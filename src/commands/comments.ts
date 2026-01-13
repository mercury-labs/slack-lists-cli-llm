import { Command } from "commander";

import { resolveDefaultChannel, resolveToken } from "../lib/config";
import { findColumnByType } from "../lib/schema";
import { resolveSchemaIndex } from "../lib/schema-resolver";
import { getThreadEntry, setThreadEntry } from "../lib/thread-map";
import { parseMessageUrl, resolveChannelId, resolveUserId } from "../lib/resolvers";
import { buildThreadRootText, extractThreadFromItem } from "../lib/thread-utils";
import { SlackListsClient } from "../lib/slack-client";
import { getGlobalOptions } from "../utils/command";
import { handleCommandError } from "../utils/errors";
import { outputJson } from "../utils/output";

export function registerCommentCommands(program: Command): void {
  program
    .command("comment")
    .description("Post a comment on a list item thread")
    .argument("<list-id>", "List ID")
    .argument("<item-id>", "Item ID")
    .argument("<text>", "Comment text")
    .option("--channel <channel>", "Channel ID or name")
    .option("--thread-ts <ts>", "Thread timestamp")
    .option("--message-url <url>", "Slack message URL to infer thread")
    .action(async (listId: string, itemId: string, text: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        let channel = options.channel ? await resolveChannelId(client, options.channel) : undefined;
        let threadTs = options.threadTs as string | undefined;

        let messageUrl = options.messageUrl as string | undefined;
        if (!channel || !threadTs) {
          if (messageUrl) {
            const parsed = parseMessageUrl(messageUrl);
            if (parsed) {
              channel = channel ?? parsed.channel;
              threadTs = threadTs ?? parsed.ts;
            }
          }
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

        let itemResult: Record<string, unknown> | null = null;
        if (!channel || !threadTs) {
          itemResult = (await client.call("slackLists.items.info", {
            list_id: listId,
            id: itemId
          })) as unknown as Record<string, unknown>;
          const thread = extractThreadFromItem(itemResult);
          if (thread) {
            channel = channel ?? thread.channel;
            threadTs = threadTs ?? thread.ts;
          }
        }

        if (!channel) {
          const fallback = resolveDefaultChannel(listId);
          if (fallback) {
            channel = await resolveChannelId(client, fallback);
          }
        }

        if (!threadTs && channel) {
          const details = itemResult ?? ((await client.call("slackLists.items.info", {
            list_id: listId,
            id: itemId
          })) as unknown as Record<string, unknown>);

          const rootText = buildThreadRootText(details, listId, itemId);
          const root = await client.postMessage({ channel, text: rootText });
          const rootTs = (root as { ts?: string }).ts;
          if (!rootTs) {
            throw new Error("Unable to create thread root message");
          }

          const permalinkResult = await client.call("chat.getPermalink", {
            channel,
            message_ts: rootTs
          });
          const permalink = (permalinkResult as { permalink?: string }).permalink;
          if (!permalink) {
            throw new Error("Unable to fetch permalink for thread root");
          }

          const schemaIndex = await resolveSchemaIndex(
            client,
            listId,
            globals.schema,
            globals.refreshSchema
          );
          const messageColumn = schemaIndex ? findColumnByType(schemaIndex, ["message"]) : undefined;
          if (messageColumn) {
            await client.call("slackLists.items.update", {
              list_id: listId,
              cells: [
                {
                  row_id: itemId,
                  column_id: messageColumn.id,
                  message: [permalink]
                }
              ]
            });
          }

          await setThreadEntry(listId, itemId, {
            permalink,
            channel,
            ts: rootTs
          });

          messageUrl = permalink;

          threadTs = rootTs;
        }

        if (!channel || !threadTs) {
          throw new Error(
            "Unable to infer thread. Provide --channel and --thread-ts or --message-url, or set SLACK_LIST_DEFAULT_CHANNEL."
          );
        }

        const result = await client.postMessage({
          channel,
          text,
          thread_ts: threadTs
        });

        if (messageUrl) {
          await setThreadEntry(listId, itemId, {
            permalink: messageUrl,
            channel,
            ts: threadTs
          });
        }

        outputJson(result);
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  program
    .command("comments")
    .description("List comment thread for a list item")
    .argument("<list-id>", "List ID")
    .argument("<item-id>", "Item ID")
    .option("--channel <channel>", "Channel ID or name")
    .option("--thread-ts <ts>", "Thread timestamp")
    .option("--message-url <url>", "Slack message URL to infer thread")
    .option("--limit <count>", "Maximum messages to return", "200")
    .option("--compact", "Return only user/text/ts fields", false)
    .action(async (listId: string, itemId: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        let channel = options.channel ? await resolveChannelId(client, options.channel) : undefined;
        let threadTs = options.threadTs as string | undefined;

        let messageUrl = options.messageUrl as string | undefined;
        if (!channel || !threadTs) {
          if (messageUrl) {
            const parsed = parseMessageUrl(messageUrl);
            if (parsed) {
              channel = channel ?? parsed.channel;
              threadTs = threadTs ?? parsed.ts;
            }
          }
        }

        if (!channel || !threadTs) {
          const itemResult = await client.call("slackLists.items.info", {
            list_id: listId,
            id: itemId
          });
          const thread = extractThreadFromItem(itemResult as unknown as Record<string, unknown>);
          if (thread) {
            channel = channel ?? thread.channel;
            threadTs = threadTs ?? thread.ts;
            messageUrl = messageUrl ?? thread.permalink;
          }
        }

        if (!channel || !threadTs) {
          throw new Error(
            "Unable to infer thread. Provide --channel and --thread-ts or --message-url."
          );
        }

        const limit = Number(options.limit);
        if (!Number.isFinite(limit) || limit <= 0) {
          throw new Error("--limit must be a positive number");
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

        const messages: Array<Record<string, unknown>> = [];
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

          const page = (result as { messages?: Array<Record<string, unknown>> }).messages ?? [];
          messages.push(...page);

          cursor = (result as { response_metadata?: { next_cursor?: string } }).response_metadata
            ?.next_cursor;

          remaining = limit - messages.length;
          if (remaining <= 0) {
            break;
          }
        } while (cursor);

        const trimmed = messages.slice(0, limit);
        const payload = options.compact
          ? trimmed.map((message) => ({
              ts: message.ts,
              user: message.user,
              text: message.text,
              thread_ts: message.thread_ts
            }))
          : trimmed;

        if (messageUrl && channel && threadTs) {
          await setThreadEntry(listId, itemId, {
            permalink: messageUrl,
            channel,
            ts: threadTs
          });
        }

        outputJson({
          ok: true,
          channel,
          thread_ts: threadTs,
          message_count: trimmed.length,
          messages: payload
        });
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  program
    .command("ask")
    .description("Ask a question in a channel, with optional mention")
    .argument("<channel>", "Channel ID or name")
    .argument("<text>", "Question text")
    .option("--user <user>", "User to mention (@name, email, or ID)")
    .action(async (channelInput: string, text: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const channel = await resolveChannelId(client, channelInput);
        const mention = options.user ? `<@${await resolveUserId(client, options.user)}>` : "";
        const message = mention ? `${mention} ${text}` : text;
        const result = await client.postMessage({ channel, text: message });
        outputJson(result);
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  program
    .command("post")
    .description("Post a message to a channel")
    .argument("<channel>", "Channel ID or name")
    .argument("<text>", "Message text")
    .action(async (channelInput: string, text: string, _options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const channel = await resolveChannelId(client, channelInput);
        const result = await client.postMessage({ channel, text });
        outputJson(result);
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  program
    .command("comment-edit")
    .description("Edit a comment by timestamp")
    .argument("<channel>", "Channel ID or name")
    .argument("<ts>", "Message timestamp")
    .argument("<text>", "New message text")
    .action(async (channelInput: string, ts: string, text: string, _options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const channel = await resolveChannelId(client, channelInput);
        const result = await client.call("chat.update", { channel, ts, text });
        outputJson(result);
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });
}
