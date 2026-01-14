import { Command } from "commander";

import { resolveToken } from "../lib/config";
import { resolveChannelId } from "../lib/resolvers";
import { SlackListsClient } from "../lib/slack-client";
import { getGlobalOptions } from "../utils/command";
import { handleCommandError } from "../utils/errors";
import { outputJson } from "../utils/output";

type SlackMessage = {
  ts?: string;
  thread_ts?: string;
  user?: string;
  text?: string;
};

export function registerSlackCommands(program: Command): void {
  const slack = program.command("slack").description("Slack message helpers");

  slack
    .command("history")
    .description("List messages from a channel")
    .argument("<channel>", "Channel ID or name")
    .option("--limit <count>", "Maximum messages to return", "200")
    .option("--since <time>", "Oldest timestamp (ISO or epoch)")
    .option("--latest <time>", "Latest timestamp (ISO or epoch)")
    .option("--compact", "Return only user/text/ts/thread_ts", false)
    .action(async (channelArg: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const channel = await resolveChannelId(client, channelArg);
        const limit = parseLimit(options.limit, 200);
        const oldest = parseSlackTimestamp(options.since as string | undefined);
        const latest = parseSlackTimestamp(options.latest as string | undefined);

        const messages: SlackMessage[] = [];
        let cursor: string | undefined = undefined;
        let remaining = limit;

        do {
          const batchSize = Math.min(remaining, 200);
          const result = await client.call("conversations.history", {
            channel,
            limit: batchSize,
            cursor,
            oldest,
            latest
          });

          const page = (result as { messages?: SlackMessage[] }).messages ?? [];
          messages.push(...page);

          cursor = (result as { response_metadata?: { next_cursor?: string } }).response_metadata?.next_cursor;
          remaining = limit - messages.length;
          if (remaining <= 0) {
            break;
          }
        } while (cursor);

        const trimmed = messages.slice(0, limit);
        const payload = options.compact
          ? trimmed.map((message) => ({
              ts: message.ts,
              thread_ts: message.thread_ts,
              user: message.user,
              text: message.text
            }))
          : trimmed;

        outputJson({
          ok: true,
          channel,
          message_count: trimmed.length,
          messages: payload
        });
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  slack
    .command("search")
    .description("Search Slack messages (user token required)")
    .argument("<query>", "Search query")
    .option("--limit <count>", "Maximum messages to return", "50")
    .option("--sort <sort>", "relevance|timestamp", "relevance")
    .option("--sort-dir <dir>", "asc|desc", "desc")
    .option("--compact", "Return only text/permalink/timestamp", false)
    .action(async (query: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const token = resolveToken(globals);
      if (token.startsWith("xoxb-")) {
        throw new Error("Slack search requires a user token (xoxp-). Set SLACK_USER_TOKEN and use --as-user.");
      }

      const client = new SlackListsClient(token);

      try {
        const limit = parseLimit(options.limit, 50);
        const sort = validateSort(options.sort as string | undefined);
        const sortDir = validateSortDir(options.sortDir as string | undefined);

        const matches: Array<Record<string, unknown>> = [];
        let page = 1;

        while (matches.length < limit) {
          const batchSize = Math.min(100, limit - matches.length);
          const result = await client.call("search.messages", {
            query,
            sort,
            sort_dir: sortDir,
            count: batchSize,
            page
          });

          const chunk = (result as { messages?: { matches?: Array<Record<string, unknown>> } }).messages
            ?.matches;
          if (chunk && chunk.length > 0) {
            matches.push(...chunk);
          }

          const paging = (result as { messages?: { paging?: { page?: number; pages?: number } } })
            .messages?.paging;
          if (!paging?.page || !paging.pages || paging.page >= paging.pages) {
            break;
          }
          page += 1;
        }

        const trimmed = matches.slice(0, limit);
        const payload = options.compact
          ? trimmed.map((match) => ({
              ts: match.ts,
              text: match.text,
              permalink: match.permalink,
              channel: match.channel
            }))
          : trimmed;

        outputJson({
          ok: true,
          query,
          message_count: trimmed.length,
          messages: payload
        });
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });
}

function parseLimit(value: string | undefined, fallback: number): number {
  const limit = Number(value ?? fallback);
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error("--limit must be a positive number");
  }
  return limit;
}

function parseSlackTimestamp(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    const seconds = numeric > 1e12 ? Math.floor(numeric / 1000) : numeric;
    return String(seconds);
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) {
    return String(Math.floor(parsed / 1000));
  }
  throw new Error("--since/--latest must be an ISO timestamp or epoch seconds");
}

function validateSort(value?: string): "relevance" | "timestamp" {
  if (!value || value === "relevance" || value === "timestamp") {
    return (value ?? "relevance") as "relevance" | "timestamp";
  }
  throw new Error("--sort must be relevance or timestamp");
}

function validateSortDir(value?: string): "asc" | "desc" {
  if (!value || value === "asc" || value === "desc") {
    return (value ?? "desc") as "asc" | "desc";
  }
  throw new Error("--sort-dir must be asc or desc");
}
