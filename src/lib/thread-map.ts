import { promises as fs } from "fs";
import path from "path";

import { resolveThreadMapPath } from "./config";

export type ThreadEntry = {
  permalink?: string;
  channel?: string;
  ts?: string;
  label?: string;
  state?: string;
  created_at?: string;
  updated_at?: string;
};

type ThreadMap = {
  lists?: Record<string, Record<string, ThreadEntry[]>>;
};

export async function getThreadEntry(listId: string, itemId: string): Promise<ThreadEntry | null> {
  const entries = await getThreadEntries(listId, itemId);
  if (entries.length === 0) {
    return null;
  }
  return findLatestThread(entries);
}

export async function getThreadEntries(listId: string, itemId: string): Promise<ThreadEntry[]> {
  const map = await loadThreadMap();
  const raw = map.lists?.[listId]?.[itemId];
  return normalizeThreads(raw);
}

export async function setThreadEntry(listId: string, itemId: string, entry: ThreadEntry): Promise<void> {
  const filePath = resolveThreadMapPath();
  const map = await loadThreadMap();
  if (!map.lists) {
    map.lists = {};
  }
  if (!map.lists[listId]) {
    map.lists[listId] = {};
  }
  const existing = normalizeThreads(map.lists[listId][itemId]);
  const now = new Date().toISOString();
  const index = findThreadIndex(existing, entry);
  if (index >= 0) {
    const current = existing[index];
    existing[index] = {
      ...current,
      ...entry,
      created_at: current.created_at ?? now,
      updated_at: now
    };
  } else {
    existing.push({
      ...entry,
      created_at: now,
      updated_at: now
    });
  }
  map.lists[listId][itemId] = existing;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(map, null, 2), "utf-8");
}

export async function removeThreadEntry(listId: string, itemId: string): Promise<void> {
  const filePath = resolveThreadMapPath();
  const map = await loadThreadMap();
  if (!map.lists?.[listId]?.[itemId]) {
    return;
  }
  delete map.lists[listId][itemId];
  if (Object.keys(map.lists[listId]).length === 0) {
    delete map.lists[listId];
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(map, null, 2), "utf-8");
}

async function loadThreadMap(): Promise<ThreadMap> {
  const filePath = resolveThreadMapPath();
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as ThreadMap;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function normalizeThreads(value: ThreadEntry[] | ThreadEntry | { threads?: ThreadEntry[] } | undefined): ThreadEntry[] {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((entry) => entry && typeof entry === "object");
  }
  if (typeof value === "object" && "threads" in value) {
    const threads = (value as { threads?: ThreadEntry[] }).threads;
    if (Array.isArray(threads)) {
      return threads.filter((entry) => entry && typeof entry === "object");
    }
  }
  return [value as ThreadEntry];
}

function findThreadIndex(entries: ThreadEntry[], entry: ThreadEntry): number {
  if (entry.ts) {
    const index = entries.findIndex((candidate) => candidate.ts === entry.ts);
    if (index >= 0) {
      return index;
    }
  }
  if (entry.permalink) {
    const index = entries.findIndex((candidate) => candidate.permalink === entry.permalink);
    if (index >= 0) {
      return index;
    }
  }
  if (entry.channel && entry.ts) {
    return entries.findIndex(
      (candidate) => candidate.channel === entry.channel && candidate.ts === entry.ts
    );
  }
  return -1;
}

function findLatestThread(entries: ThreadEntry[]): ThreadEntry {
  let latest = entries[0];
  let latestTime = parseThreadTime(latest);
  for (const entry of entries.slice(1)) {
    const time = parseThreadTime(entry);
    if (time >= latestTime) {
      latest = entry;
      latestTime = time;
    }
  }
  return latest;
}

function parseThreadTime(entry: ThreadEntry): number {
  if (entry.updated_at) {
    const time = Date.parse(entry.updated_at);
    if (!Number.isNaN(time)) {
      return time;
    }
  }
  if (entry.created_at) {
    const time = Date.parse(entry.created_at);
    if (!Number.isNaN(time)) {
      return time;
    }
  }
  return 0;
}
