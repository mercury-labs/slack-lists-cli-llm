import { Command } from "commander";
import { createReadStream } from "fs";
import path from "path";

import { resolveToken } from "../lib/config";
import { buildTypedField } from "../lib/fields";
import { resolveChannelId } from "../lib/resolvers";
import { resolveColumn, SchemaIndex, findColumnByType } from "../lib/schema";
import { ColumnType, ListColumn } from "../lib/types";
import { resolveSchemaIndex } from "../lib/schema-resolver";
import { SlackListsClient } from "../lib/slack-client";
import { getGlobalOptions } from "../utils/command";
import { handleCommandError } from "../utils/errors";
import { outputJson } from "../utils/output";

export function registerFilesCommands(program: Command): void {
  const evidence = program.command("evidence").description("Evidence helpers");

  evidence
    .command("upload")
    .description("Upload a file as evidence")
    .argument("<list-id>", "List ID")
    .argument("<item-id>", "Item ID")
    .argument("<file-path>", "File path")
    .option("--description <text>", "Evidence description")
    .option("--column <column>", "Column ID/key/name to update")
    .option("--column-type <type>", "attachment|reference", "attachment")
    .option("--channel <channel>", "Optional channel to share the file")
    .action(async (listId: string, itemId: string, filePath: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const schemaIndex = await resolveSchemaIndex(client, listId, globals.schema, globals.refreshSchema);
        const columnType = options.columnType as ColumnType;
        if (!["attachment", "reference"].includes(columnType)) {
          throw new Error("--column-type must be attachment or reference");
        }
        const column = resolveEvidenceColumn(
          schemaIndex,
          options.column,
          columnType,
          ["attachment", "reference"]
        );

        const filename = path.basename(filePath);
        const fileUpload = await client.filesUploadV2({
          file: createReadStream(filePath),
          filename,
          title: options.description ?? filename,
          channel_id: options.channel ? await resolveChannelId(client, options.channel) : undefined
        });

        const fileId = extractFileId(fileUpload as unknown as Record<string, unknown>);
        const typed = await buildTypedField(column, fileId, { client });

        const result = await client.call("slackLists.items.update", {
          list_id: listId,
          cells: [{ row_id: itemId, column_id: column.id, ...typed }]
        });

        outputJson({ ok: true, file_id: fileId, slack: result });
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  evidence
    .command("link")
    .description("Attach a link as evidence")
    .argument("<list-id>", "List ID")
    .argument("<item-id>", "Item ID")
    .argument("<url>", "URL")
    .option("--description <text>", "Link description")
    .option("--column <column>", "Column ID/key/name to update")
    .action(async (listId: string, itemId: string, url: string, options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const schemaIndex = await resolveSchemaIndex(client, listId, globals.schema, globals.refreshSchema);
        const column = resolveEvidenceColumn(schemaIndex, options.column, "link", ["link"]);
        const value = options.description ? `${url}|${options.description}` : url;
        const typed = await buildTypedField(column, value, { client });

        const result = await client.call("slackLists.items.update", {
          list_id: listId,
          cells: [{ row_id: itemId, column_id: column.id, ...typed }]
        });

        outputJson(result);
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });

  evidence
    .command("list")
    .description("List evidence on an item")
    .argument("<list-id>", "List ID")
    .argument("<item-id>", "Item ID")
    .action(async (listId: string, itemId: string, _options, command: Command) => {
      const globals = getGlobalOptions(command);
      const client = new SlackListsClient(resolveToken(globals));

      try {
        const result = await client.call("slackLists.items.info", { list_id: listId, item_id: itemId });
        const evidence = extractEvidence(result as unknown as Record<string, unknown>);
        outputJson({ ok: true, list_id: listId, item_id: itemId, evidence });
      } catch (error) {
        handleCommandError(error, globals.verbose);
      }
    });
}

function resolveEvidenceColumn(
  schemaIndex: SchemaIndex | undefined,
  columnArg: string | undefined,
  fallbackType: ColumnType,
  allowedTypes: ColumnType[]
): ListColumn {
  if (schemaIndex) {
    if (columnArg) {
      const resolved = resolveColumn(schemaIndex, columnArg);
      if (!resolved) {
        throw new Error(`Unknown column: ${columnArg}`);
      }
      if (!allowedTypes.includes(resolved.type)) {
        throw new Error(`Column ${resolved.name} is not of type ${allowedTypes.join("/")}`);
      }
      return resolved;
    }

    const inferred = findColumnByType(schemaIndex, allowedTypes);
    if (!inferred) {
      throw new Error("No evidence column found in schema. Provide --column.");
    }
    return inferred;
  }

  if (!columnArg) {
    throw new Error("Schema required or provide --column and --column-type.");
  }

  return { id: columnArg, name: columnArg, type: fallbackType } as ListColumn;
}

function extractFileId(result: Record<string, unknown>): string {
  const files = (result as { files?: Array<{ id?: string }> }).files;
  if (Array.isArray(files) && files.length > 0 && files[0]?.id) {
    return String(files[0].id);
  }
  const file = (result as { file?: { id?: string } }).file;
  if (file?.id) {
    return String(file.id);
  }
  throw new Error("Unable to locate uploaded file id");
}

function extractEvidence(result: Record<string, unknown>): Array<Record<string, unknown>> {
  const item = (result as { item?: Record<string, unknown> }).item;
  if (!item) {
    return [];
  }
  const fields = item.fields;
  if (!Array.isArray(fields)) {
    return [];
  }

  return fields.filter((field) => {
    if (!field || typeof field !== "object") {
      return false;
    }
    const fieldObj = field as Record<string, unknown>;
    return (
      "attachment" in fieldObj ||
      "link" in fieldObj ||
      "reference" in fieldObj ||
      "message" in fieldObj
    );
  });
}
