import { Command } from "commander";

export type GlobalOptions = {
  token?: string;
  asUser?: boolean;
  schema?: string;
  refreshSchema?: boolean;
  verbose?: boolean;
};

export function getGlobalOptions(command: Command): GlobalOptions {
  return command.optsWithGlobals() as GlobalOptions;
}
