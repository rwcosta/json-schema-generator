import type { JsonNode } from "./parser";

export const DIALECT = "https://json-schema.org/draft/2019-09/schema";

// This is an ordered JSON representation, not an ordinary JS object. The distinction
// matters for properties named "2", "10", "__proto__" and similar user input.
export type OrderedValue = string | OrderedObject | OrderedValue[];
export interface OrderedObject {
  entries: [string, OrderedValue][];
}
const object = (entries: OrderedObject["entries"]): OrderedObject => ({
  entries,
});

export function inferSchema(node: JsonNode, root = true): OrderedObject {
  let entries: OrderedObject["entries"];
  switch (node.kind) {
    case "object":
      entries = [
        ["type", "object"],
        ["required", node.entries.map(([key]) => key)],
        [
          "properties",
          object(
            node.entries.map(([key, child]) => [
              key,
              inferSchema(child, false),
            ]),
          ),
        ],
      ];
      break;
    case "array": {
      const alternatives = new Map<string, OrderedObject>();
      for (const child of node.elements) {
        const schema = inferSchema(child, false);
        // Equality intentionally includes property order: no observed order is discarded.
        const identity = JSON.stringify(schema);
        if (!alternatives.has(identity)) alternatives.set(identity, schema);
      }
      const schemas = [...alternatives.values()];
      const items =
        schemas.length === 0
          ? object([])
          : schemas.length === 1
            ? schemas[0]
            : object([["anyOf", schemas]]);
      entries = [
        ["type", "array"],
        ["items", items],
      ];
      break;
    }
    case "number":
      entries = [["type", /[.eE]/.test(node.raw) ? "number" : "integer"]];
      break;
    default:
      entries = [["type", node.kind]];
  }
  if (root) entries.unshift(["$schema", DIALECT]);
  return object(entries);
}
