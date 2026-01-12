import { resolveSchemaPath } from "./config";
import { SlackListsClient } from "./slack-client";
import { buildSchemaIndex, normalizeSchema, loadSchemaFromFile, SchemaIndex } from "./schema";
import { loadCachedSchema, saveSchemaCache } from "./cache";

export async function resolveSchemaIndex(
  client: SlackListsClient,
  listId: string,
  schemaPath?: string,
  refreshCache = false
): Promise<SchemaIndex | undefined> {
  const resolvedPath = resolveSchemaPath(schemaPath);
  if (resolvedPath) {
    const schema = await loadSchemaFromFile(resolvedPath);
    return buildSchemaIndex(schema);
  }

  if (!refreshCache) {
    const cached = await loadCachedSchema(listId);
    if (cached) {
      return buildSchemaIndex(cached);
    }
  }

  try {
    const result = await client.call("slackLists.info", { list_id: listId });
    if ((result as { ok?: boolean }).ok) {
      const schema = normalizeSchema(result as unknown as Record<string, unknown>);
      await saveSchemaCache(listId, schema);
      return buildSchemaIndex(schema);
    }
  } catch (error) {
    const slackError = (error as { data?: { error?: string } })?.data?.error;
    if (slackError !== "unknown_method") {
      throw error;
    }
  }

  return undefined;
}
