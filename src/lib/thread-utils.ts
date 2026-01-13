import { parseMessageUrl } from "./resolvers";

export function extractThreadFromItem(
  itemResult: Record<string, unknown>
): { channel: string; ts: string; permalink?: string } | null {
  const item =
    (itemResult as { item?: Record<string, unknown>; record?: Record<string, unknown> }).item ??
    (itemResult as { record?: Record<string, unknown> }).record;
  if (!item) {
    return null;
  }
  const fields = item.fields;
  if (!Array.isArray(fields)) {
    return null;
  }

  for (const field of fields) {
    if (!field || typeof field !== "object") {
      continue;
    }
    const messageEntries = (field as { message?: unknown }).message;
    if (Array.isArray(messageEntries) && messageEntries.length > 0) {
      const entry = messageEntries[0];
      if (typeof entry === "string") {
        const parsed = parseMessageUrl(entry);
        if (parsed) {
          return { ...parsed, permalink: entry };
        }
      }
      if (entry && typeof entry === "object") {
        const record = entry as { value?: unknown; channel_id?: unknown; ts?: unknown };
        if (record.channel_id && record.ts) {
          return {
            channel: String(record.channel_id),
            ts: String(record.ts),
            permalink: typeof record.value === "string" ? record.value : undefined
          };
        }
        if (record.value) {
          const parsed = parseMessageUrl(String(record.value));
          if (parsed) {
            return { ...parsed, permalink: String(record.value) };
          }
        }
      }
    }
  }

  return null;
}

export function buildThreadRootText(
  itemResult: Record<string, unknown>,
  listId: string,
  itemId: string
): string {
  const list = (itemResult as { list?: Record<string, unknown> }).list ?? {};
  const listTitle =
    (typeof list.title === "string" && list.title.trim()) ||
    (typeof list.name === "string" && list.name.trim()) ||
    listId;

  const item =
    (itemResult as { item?: Record<string, unknown>; record?: Record<string, unknown> }).item ??
    (itemResult as { record?: Record<string, unknown> }).record ??
    {};

  const fields = Array.isArray((item as { fields?: unknown }).fields)
    ? ((item as { fields?: unknown }).fields as Record<string, unknown>[])
    : [];

  let title = "";
  for (const field of fields) {
    if (field && typeof field === "object" && (field as { key?: string }).key === "name") {
      title = (field as { text?: string }).text ?? "";
      if (title) {
        break;
      }
    }
  }

  if (!title) {
    for (const field of fields) {
      if (field && typeof field === "object") {
        const text = (field as { text?: string }).text;
        if (text) {
          title = text;
          break;
        }
      }
    }
  }

  const itemLabel = title ? `"${title}"` : itemId;
  return `Thread for ${listTitle} item ${itemLabel}`;
}
