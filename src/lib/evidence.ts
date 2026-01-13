import { resolveColumn, SchemaIndex, findColumnByType } from "./schema";
import { ColumnType, ListColumn } from "./types";

export function resolveEvidenceColumn(
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
