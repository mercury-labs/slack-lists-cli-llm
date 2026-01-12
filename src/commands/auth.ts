import { Command } from "commander";

import { resolveToken } from "../lib/config";
import { SlackListsClient } from "../lib/slack-client";
import { outputJson } from "../utils/output";

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Authentication helpers");

  auth
    .command("status")
    .description("Verify token works")
    .action(async (_options, command: Command) => {
      const opts = command.optsWithGlobals();
      const token = resolveToken({ token: opts.token, asUser: opts.asUser });
      const client = new SlackListsClient(token);
      const result = await client.authTest();
      outputJson({ ...result, ok: true });
    });
}
