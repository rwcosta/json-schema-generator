import { inferSchema } from "./infer";
import { parseJson } from "./parser";
import { serializeSchema } from "./serialize";

export function generateSchema(source: string): string {
  return serializeSchema(inferSchema(parseJson(source)));
}
