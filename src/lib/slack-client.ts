import { WebAPICallResult, WebClient } from "@slack/web-api";

export class SlackListsClient {
  private client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  async authTest(): Promise<WebAPICallResult> {
    return this.callWithRetry(() => this.client.auth.test());
  }

  async call(method: string, params?: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.callWithRetry(() => this.client.apiCall(method, params));
  }

  async postMessage(params: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.callWithRetry(() => this.client.apiCall("chat.postMessage", params));
  }

  async usersList(params: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.callWithRetry(() => this.client.apiCall("users.list", params));
  }

  async usersLookupByEmail(params: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.callWithRetry(() => this.client.apiCall("users.lookupByEmail", params));
  }

  async conversationsList(params: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.callWithRetry(() => this.client.apiCall("conversations.list", params));
  }

  async filesUploadV2(params: Record<string, unknown>): Promise<WebAPICallResult> {
    const clientAny = this.client as unknown as {
      filesUploadV2?: (args: Record<string, unknown>) => Promise<WebAPICallResult>;
      files?: { uploadV2?: (args: Record<string, unknown>) => Promise<WebAPICallResult> };
    };

    if (clientAny.filesUploadV2) {
      return this.callWithRetry(() => clientAny.filesUploadV2!(params));
    }

    if (clientAny.files?.uploadV2) {
      return this.callWithRetry(() => clientAny.files!.uploadV2!(params));
    }

    return this.callWithRetry(() => this.client.apiCall("files.uploadV2", params));
  }

  private async callWithRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let attempt = 0;
    while (true) {
      try {
        return await fn();
      } catch (error) {
        const retryAfter = extractRetryAfter(error);
        const code = extractSlackErrorCode(error);
        if ((code === "ratelimited" || code === "rate_limited" || retryAfter) && attempt < attempts - 1) {
          const waitMs = Math.max(retryAfter ?? 1, 1) * 1000;
          await sleep(waitMs);
          attempt += 1;
          continue;
        }
        throw error;
      }
    }
  }
}

function extractSlackErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  if ("data" in error) {
    const data = (error as { data?: { error?: string } }).data;
    if (data?.error) {
      return data.error;
    }
  }
  return undefined;
}

function extractRetryAfter(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const data = (error as { data?: { retry_after?: number } }).data;
  if (data?.retry_after && Number.isFinite(data.retry_after)) {
    return data.retry_after;
  }
  const retryAfter = (error as { retryAfter?: number }).retryAfter;
  if (retryAfter && Number.isFinite(retryAfter)) {
    return retryAfter;
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
