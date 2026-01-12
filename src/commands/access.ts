import { Command } from "commander";

import { resolveToken } from "../lib/config";
import { resolveChannelId, resolveUserId } from "../lib/resolvers";
import { SlackListsClient } from "../lib/slack-client";
import { getGlobalOptions } from "../utils/command";
import { handleCommandError } from "../utils/errors";
import { outputJson } from "../utils/output";

export function registerAccessCommands(program: Command): void {
  const access = program.command("access").description("Manage list access");

  access
    .command("set")
    .description("Grant access to a list for channels or users")
    .argument("<list-id>", "List ID")
    .option("--channels <channels>", "Channel IDs or #names (comma-separated)")
    .option("--users <users>", "User IDs, @names, or emails (comma-separated)")
    .option("--level <level>", "Access level: read|write|owner", "write")
    .action(async (listId: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const channels = splitList(options.channels);
        const users = splitList(options.users);

        if (channels.length === 0 && users.length === 0) {
          throw new Error("Provide --channels or --users");
        }

        if (channels.length > 0 && users.length > 0) {
          throw new Error("Provide only one of --channels or --users");
        }

        const level = String(options.level ?? "write").toLowerCase();
        if (!['read', 'write', 'owner'].includes(level)) {
          throw new Error("--level must be read, write, or owner");
        }

        if (level === "owner" && channels.length > 0) {
          throw new Error("Owner access can only be granted to users, not channels");
        }

        const channelIds = channels.length > 0 ? await resolveChannelIds(client, channels) : undefined;
        const userIds = users.length > 0 ? await resolveUserIds(client, users) : undefined;

        const result = await client.call("slackLists.access.set", {
          list_id: listId,
          access_level: level,
          channel_ids: channelIds,
          user_ids: userIds
        });

        outputJson(result);
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  access
    .command("delete")
    .description("Revoke access to a list for channels or users")
    .argument("<list-id>", "List ID")
    .option("--channels <channels>", "Channel IDs or #names (comma-separated)")
    .option("--users <users>", "User IDs, @names, or emails (comma-separated)")
    .action(async (listId: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const channels = splitList(options.channels);
        const users = splitList(options.users);

        if (channels.length === 0 && users.length === 0) {
          throw new Error("Provide --channels or --users");
        }

        if (channels.length > 0 && users.length > 0) {
          throw new Error("Provide only one of --channels or --users");
        }

        const channelIds = channels.length > 0 ? await resolveChannelIds(client, channels) : undefined;
        const userIds = users.length > 0 ? await resolveUserIds(client, users) : undefined;

        const result = await client.call("slackLists.access.delete", {
          list_id: listId,
          channel_ids: channelIds,
          user_ids: userIds
        });

        outputJson(result);
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });
}

function splitList(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((entry: string) => entry.trim())
    .filter(Boolean);
}

async function resolveChannelIds(client: SlackListsClient, channels: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const channel of channels) {
    ids.push(await resolveChannelId(client, channel));
  }
  return ids;
}

async function resolveUserIds(client: SlackListsClient, users: string[]): Promise<string[]> {
  const ids: string[] = [];
  for (const user of users) {
    ids.push(await resolveUserId(client, user));
  }
  return ids;
}
