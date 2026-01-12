import { existsSync, readFileSync } from "fs";
import path from "path";

const DEFAULT_ENV_FILES = [".env.local", ".env"];

export function loadEnvFiles(files: string[] = DEFAULT_ENV_FILES): void {
  const cwd = process.cwd();
  for (const file of files) {
    const filePath = path.resolve(cwd, file);
    if (!existsSync(filePath)) {
      continue;
    }

    const contents = readFileSync(filePath, "utf-8");
    const lines = contents.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const normalized = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
      const equalsIndex = normalized.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }

      const key = normalized.slice(0, equalsIndex).trim();
      let value = normalized.slice(equalsIndex + 1).trim();
      if (!key || process.env[key] !== undefined) {
        continue;
      }

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}
