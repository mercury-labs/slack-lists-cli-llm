type GraphQLResponse<T> = {
  data?: T;
  errors?: Array<{ message: string; extensions?: Record<string, unknown> }>;
};

export class LinearClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async request<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: normalizeAuthHeader(this.token)
      },
      body: JSON.stringify({ query, variables })
    });

    const text = await response.text();
    let payload: GraphQLResponse<T>;
    try {
      payload = JSON.parse(text) as GraphQLResponse<T>;
    } catch (error) {
      throw new Error(`Linear API returned non-JSON response: ${text.slice(0, 200)}`);
    }

    if (!response.ok) {
      const message = payload.errors?.[0]?.message ?? response.statusText;
      throw new Error(`Linear API error: ${message}`);
    }

    if (payload.errors && payload.errors.length > 0) {
      throw new Error(`Linear API error: ${payload.errors[0].message}`);
    }

    if (!payload.data) {
      throw new Error("Linear API returned empty data.");
    }

    return payload.data;
  }
}

function normalizeAuthHeader(token: string): string {
  const trimmed = token.trim();
  if (/^bearer\s+/i.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}
