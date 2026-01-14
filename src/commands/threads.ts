import { Command } from "commander";

import { resolveToken } from "../lib/config";
import { parseMessageUrl, resolveChannelId } from "../lib/resolvers";
import { SlackListsClient } from "../lib/slack-client";
import { getThreadEntry, getThreadEntries, removeThreadEntry, setThreadEntry } from "../lib/thread-map";
import { getGlobalOptions } from "../utils/command";
import { handleCommandError } from "../utils/errors";
import { outputJson } from "../utils/output";

export function registerThreadsCommands(program: Command): void {
  const threads = program.command("threads").description("Manage per-item thread mapping");

  threads
    .command("get")
    .description("Get stored thread mapping for an item")
    .argument("<list-id>", "List ID")
    .argument("<item-id>", "Item ID")
    .action(async (listId: string, itemId: string, _options, command: Command) => {
      const globals = getGlobalOptions(command);
      try {
        const entries = await getThreadEntries(listId, itemId);
        const latest = await getThreadEntry(listId, itemId);
        outputJson({
          ok: true,
          list_id: listId,
          item_id: itemId,
          thread: latest,
          threads: entries
        });
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  threads
    .command("set")
    .description("Store thread mapping for an item")
    .argument("<list-id>", "List ID")
    .argument("<item-id>", "Item ID")
    .option("--message-url <url>", "Slack message URL")
    .option("--channel <channel>", "Channel ID or name")
    .option("--thread-ts <ts>", "Thread timestamp")
    .option("--label <label>", "Label for the thread")
    .option("--state <state>", "State for the thread")
    .action(async (listId: string, itemId: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const url = options.messageUrl as string | undefined;
        let channel = options.channel ? await resolveChannelId(client, options.channel) : undefined;
        let threadTs = options.threadTs as string | undefined;

        if (url) {
          const parsed = parseMessageUrl(url);
          if (!parsed) {
            throw new Error("Unable to parse message URL");
          }
          channel = channel ?? parsed.channel;
          threadTs = threadTs ?? parsed.ts;
        }

        if (!channel || !threadTs) {
          throw new Error("Provide --message-url or both --channel and --thread-ts");
        }

        await setThreadEntry(listId, itemId, {
          permalink: url,
          channel,
          ts: threadTs,
          label: options.label as string | undefined,
          state: options.state as string | undefined
        });

        outputJson({
          ok: true,
          list_id: listId,
          item_id: itemId,
          channel,
          thread_ts: threadTs,
          permalink: url,
          label: options.label as string | undefined,
          state: options.state as string | undefined
        });
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  threads
    .command("cleanup")
    .description("Delete messages in a thread (typically bot-created duplicates)")
    .argument("<list-id>", "List ID")
    .argument("<item-id>", "Item ID")
    .option("--message-url <url>", "Slack thread message URL")
    .option("--channel <channel>", "Channel ID or name")
    .option("--thread-ts <ts>", "Thread timestamp")
    .option("--keep-root", "Keep the root message (delete replies only)", false)
    .option("--root-only", "Delete only the root message (no reply lookup)", false)
    .option("--limit <count>", "Maximum messages to delete", "200")
    .option("--force", "Attempt to delete messages from other users", false)
    .option("--dry-run", "List deletions without deleting", false)
    .option("--clear-map", "Remove stored thread mapping for this item", false)
    .action(async (listId: string, itemId: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        let channel = options.channel ? await resolveChannelId(client, options.channel) : undefined;
        let threadTs = options.threadTs as string | undefined;
        const messageUrl = options.messageUrl as string | undefined;

        if ((!channel || !threadTs) && messageUrl) {
          const parsed = parseMessageUrl(messageUrl);
          if (!parsed) {
            throw new Error("Unable to parse message URL");
          }
          channel = channel ?? parsed.channel;
          threadTs = threadTs ?? parsed.ts;
        }

        if (!channel || !threadTs) {
          const stored = await getThreadEntry(listId, itemId);
          if (stored?.permalink) {
            const parsed = parseMessageUrl(stored.permalink);
            if (parsed) {
              channel = channel ?? parsed.channel;
              threadTs = threadTs ?? parsed.ts;
            }
          }
          if (stored?.channel && stored?.ts) {
            channel = channel ?? stored.channel;
            threadTs = threadTs ?? stored.ts;
          }
        }

        if (!channel || !threadTs) {
          throw new Error("Provide --message-url or --channel/--thread-ts to identify the thread.");
        }

        const limit = Number(options.limit);
        if (!Number.isFinite(limit) || limit <= 0) {
          throw new Error("--limit must be a positive number");
        }

        if (options.rootOnly) {
          if (options.dryRun) {
            outputJson({
              ok: true,
              channel,
              thread_ts: threadTs,
              dry_run: true,
              to_delete: [threadTs]
            });
            return;
          }

          try {
            await client.call("chat.delete", { channel, ts: threadTs });
          } catch (error) {
            const slackError = (error as { data?: { error?: string } })?.data?.error ?? "unknown_error";
            outputJson({
              ok: false,
              channel,
              thread_ts: threadTs,
              deleted: [],
              failed: [{ ts: threadTs, error: slackError }],
              skipped: []
            });
            return;
          }

          if (options.clearMap) {
            await removeThreadEntry(listId, itemId);
          }

          outputJson({
            ok: true,
            channel,
            thread_ts: threadTs,
            deleted: [threadTs],
            failed: [],
            skipped: []
          });
          return;
        }

        const auth = await client.authTest();
        const authUser = (auth as { user_id?: string }).user_id;
        const authBot = (auth as { bot_id?: string }).bot_id;

        const messages = await fetchThreadMessages(client, channel, threadTs, limit);
        const { targets, skipped } = filterMessages(messages, authUser, authBot, options.keepRoot, options.force);

        const deleted: string[] = [];
        const failed: Array<{ ts: string; error: string }> = [];

        if (options.dryRun) {
          outputJson({
            ok: true,
            channel,
            thread_ts: threadTs,
            dry_run: true,
            to_delete: targets.map((message) => message.ts).filter(Boolean),
            skipped
          });
          return;
        }

        for (const message of targets) {
          if (!message.ts) {
            continue;
          }
          try {
            await client.call("chat.delete", { channel, ts: message.ts });
            deleted.push(message.ts);
          } catch (error) {
            const slackError = (error as { data?: { error?: string } })?.data?.error ?? "unknown_error";
            failed.push({ ts: message.ts, error: slackError });
          }
        }

        if (options.clearMap) {
          await removeThreadEntry(listId, itemId);
        }

        outputJson({
          ok: failed.length === 0,
          channel,
          thread_ts: threadTs,
          deleted,
          failed,
          skipped
        });
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  threads
    .command("edit")
    .description("Edit a comment in a thread by timestamp")
    .argument("<list-id>", "List ID")
    .argument("<item-id>", "Item ID")
    .argument("<text>", "New message text")
    .option("--message-url <url>", "Slack thread message URL")
    .option("--channel <channel>", "Channel ID or name")
    .option("--thread-ts <ts>", "Thread timestamp (used to locate thread)")
    .option("--ts <message-ts>", "Timestamp of the message to edit")
    .action(async (listId: string, itemId: string, text: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        let channel = options.channel ? await resolveChannelId(client, options.channel) : undefined;
        let threadTs = options.threadTs as string | undefined;
        const messageUrl = options.messageUrl as string | undefined;

        if ((!channel || !threadTs) && messageUrl) {
          const parsed = parseMessageUrl(messageUrl);
          if (!parsed) {
            throw new Error("Unable to parse message URL");
          }
          channel = channel ?? parsed.channel;
          threadTs = threadTs ?? parsed.ts;
        }

        if (!channel || !threadTs) {
          const stored = await getThreadEntry(listId, itemId);
          if (stored?.permalink) {
            const parsed = parseMessageUrl(stored.permalink);
            if (parsed) {
              channel = channel ?? parsed.channel;
              threadTs = threadTs ?? parsed.ts;
            }
          }
          if (stored?.channel && stored?.ts) {
            channel = channel ?? stored.channel;
            threadTs = threadTs ?? stored.ts;
          }
        }

        if (!channel || !threadTs) {
          throw new Error("Unable to resolve thread. Provide --message-url or --channel/--thread-ts.");
        }

        const messageTs = options.ts as string | undefined;
        if (!messageTs) {
          throw new Error("Provide --ts with the message timestamp to edit.");
        }

        const result = await client.call("chat.update", { channel, ts: messageTs, text });
        outputJson(result);
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });
}

type ThreadMessage = {
  ts?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
};

async function fetchThreadMessages(
  client: SlackListsClient,
  channel: string,
  threadTs: string,
  limit: number
): Promise<ThreadMessage[]> {
  const messages: ThreadMessage[] = [];
  let cursor: string | undefined = undefined;
  let remaining = limit;

  do {
    const batchSize = Math.min(remaining, 200);
    const result = await client.call("conversations.replies", {
      channel,
      ts: threadTs,
      limit: batchSize,
      cursor
    });

    const page = (result as { messages?: ThreadMessage[] }).messages ?? [];
    messages.push(...page);

    cursor = (result as { response_metadata?: { next_cursor?: string } }).response_metadata?.next_cursor;
    remaining = limit - messages.length;
    if (remaining <= 0) {
      break;
    }
  } while (cursor);

  return messages.slice(0, limit);
}

function filterMessages(
  messages: ThreadMessage[],
  authUser?: string,
  authBot?: string,
  keepRoot?: boolean,
  force?: boolean
): { targets: ThreadMessage[]; skipped: string[] } {
  const targets: ThreadMessage[] = [];
  const skipped: string[] = [];

  for (const message of messages) {
    if (!force) {
      if (authUser && message.user === authUser) {
        targets.push(message);
        continue;
      }
      if (authBot && message.bot_id === authBot) {
        targets.push(message);
        continue;
      }
      if (message.ts) {
        skipped.push(message.ts);
      }
      continue;
    }
    targets.push(message);
  }

  const ordered = [...targets].sort((a, b) => (b.ts ?? "").localeCompare(a.ts ?? ""));
  const rootTs = messages[0]?.ts;
  const filtered = keepRoot ? ordered.filter((message) => message.ts !== rootTs) : ordered;
  const skippedFiltered = keepRoot && rootTs ? skipped.filter((ts) => ts !== rootTs) : skipped;
  return { targets: filtered, skipped: skippedFiltered };
}
