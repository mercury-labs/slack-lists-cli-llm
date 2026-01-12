export type ErrorDetails = {
  message: string;
  name?: string;
  stack?: string;
  data?: unknown;
};

export function outputJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

export function outputError(error: string, details?: unknown): never {
  process.stderr.write(`${JSON.stringify({ ok: false, error, details }, null, 2)}\n`);
  process.exit(1);
}

export function formatError(error: unknown): ErrorDetails {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack
    };
  }

  return { message: String(error) };
}

export function formatSlackError(error: unknown): ErrorDetails {
  if (error instanceof Error && "data" in error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      data: (error as { data?: unknown }).data
    };
  }

  return formatError(error);
}
