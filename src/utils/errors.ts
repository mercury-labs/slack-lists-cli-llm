import { outputError, formatError, formatSlackError } from "./output";

export function handleCommandError(error: unknown, verbose?: boolean): never {
  const details = verbose ? formatSlackError(error) : formatError(error);
  outputError("command_failed", details);
}
