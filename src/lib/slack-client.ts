import { WebAPICallResult, WebClient } from "@slack/web-api";

export class SlackListsClient {
  private client: WebClient;

  constructor(token: string) {
    this.client = new WebClient(token);
  }

  async authTest(): Promise<WebAPICallResult> {
    return this.client.auth.test();
  }

  async call(method: string, params?: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.client.apiCall(method, params);
  }

  async postMessage(params: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.client.apiCall("chat.postMessage", params);
  }

  async usersList(params: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.client.apiCall("users.list", params);
  }

  async usersLookupByEmail(params: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.client.apiCall("users.lookupByEmail", params);
  }

  async conversationsList(params: Record<string, unknown>): Promise<WebAPICallResult> {
    return this.client.apiCall("conversations.list", params);
  }

  async filesUploadV2(params: Record<string, unknown>): Promise<WebAPICallResult> {
    const clientAny = this.client as unknown as {
      filesUploadV2?: (args: Record<string, unknown>) => Promise<WebAPICallResult>;
      files?: { uploadV2?: (args: Record<string, unknown>) => Promise<WebAPICallResult> };
    };

    if (clientAny.filesUploadV2) {
      return clientAny.filesUploadV2(params);
    }

    if (clientAny.files?.uploadV2) {
      return clientAny.files.uploadV2(params);
    }

    return this.client.apiCall("files.uploadV2", params);
  }
}
