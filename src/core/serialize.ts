import type { OrderedValue } from "./infer";
import { LIMITS } from "./limits";

export function serializeSchema(value: OrderedValue): string {
  const chunks: string[] = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  function append(text: string): void {
    bytes += encoder.encode(text).length;
    if (bytes > LIMITS.outputBytes)
      throw new Error(
        "O schema excede o limite de saída de 10 MiB. Reduza o JSON de entrada.",
      );
    chunks.push(text);
  }
  function write(current: OrderedValue, depth: number): void {
    if (typeof current === "string") {
      append(JSON.stringify(current));
      return;
    }
    const array = Array.isArray(current);
    const entries = array
      ? current.map((item) => [null, item] as const)
      : current.entries;
    append(array ? "[" : "{");
    entries.forEach(([key, child], index) => {
      append(`${index ? "," : ""}\n${"  ".repeat(depth + 1)}`);
      if (key !== null) append(`${JSON.stringify(key)}: `);
      write(child, depth + 1);
    });
    if (entries.length) append(`\n${"  ".repeat(depth)}`);
    append(array ? "]" : "}");
  }
  write(value, 0);
  return chunks.join("");
}
