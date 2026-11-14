import { LIMITS } from "./limits";

// Ordered entries retain even integer-like keys in their original source order.
export type JsonNode =
  | { kind: "object"; entries: [string, JsonNode][] }
  | { kind: "array"; elements: JsonNode[] }
  | { kind: "string"; value: string }
  | { kind: "number"; raw: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" };

export class JsonInputError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
  ) {
    super(`${message} (linha ${line}, coluna ${column}).`);
    this.name = "JsonInputError";
  }
}

export function parseJson(source: string): JsonNode {
  let position = 0;
  let nodes = 0;

  function fail(message: string, at = position): never {
    const prefix = source.slice(0, at);
    const line = (prefix.match(/\n/g)?.length ?? 0) + 1;
    const column = at - prefix.lastIndexOf("\n");
    throw new JsonInputError(message, line, column);
  }

  // Bound allocations before encoding and again for actual UTF-8 size.
  if (
    source.length > LIMITS.inputBytes ||
    new TextEncoder().encode(source).length > LIMITS.inputBytes
  ) {
    fail("O JSON excede o limite de 1 MiB", 0);
  }

  function whitespace(): void {
    while (
      /[\x20\t\r\n]/.test(source[position] ?? "") &&
      position < source.length
    )
      position++;
  }

  function string(): string {
    const start = position++;
    while (position < source.length) {
      const char = source[position++];
      if (char === '"') {
        // Parse only an individual string, never numeric values or object keys as a map.
        return JSON.parse(source.slice(start, position)) as string;
      }
      if (char.charCodeAt(0) < 0x20)
        fail("Caractere de controle inválido na string", position - 1);
      if (char === "\\") {
        const escape = source[position++];
        if (escape === "u") {
          for (let i = 0; i < 4; i++) {
            if (!/^[0-9a-fA-F]$/.test(source[position] ?? ""))
              fail("Escape Unicode inválido");
            position++;
          }
        } else if (!escape || !'"\\/bfnrt'.includes(escape)) {
          fail("Escape inválido na string", position - 1);
        }
      }
    }
    fail("String não terminada", start);
  }

  function value(depth: number): JsonNode {
    whitespace();
    if (depth > LIMITS.depth)
      fail(`O JSON excede ${LIMITS.depth} níveis de profundidade`);
    if (++nodes > LIMITS.nodes) fail("O JSON excede o limite de 100 mil nós");
    const char = source[position];
    if (char === "{") {
      position++;
      whitespace();
      const entries: [string, JsonNode][] = [];
      const names = new Set<string>();
      if (source[position] !== "}") {
        while (true) {
          whitespace();
          if (source[position] !== '"')
            fail("Esperado um nome de propriedade entre aspas");
          const keyAt = position;
          const key = string();
          if (names.has(key))
            fail(`Propriedade duplicada: ${JSON.stringify(key)}`, keyAt);
          names.add(key);
          whitespace();
          if (source[position++] !== ":")
            fail('Esperado ":" após o nome da propriedade', position - 1);
          entries.push([key, value(depth + 1)]);
          whitespace();
          if (source[position] !== ",") break;
          position++;
        }
      }
      if (source[position++] !== "}") fail('Esperado "," ou "}"', position - 1);
      return { kind: "object", entries };
    }
    if (char === "[") {
      position++;
      whitespace();
      const elements: JsonNode[] = [];
      if (source[position] !== "]") {
        while (true) {
          elements.push(value(depth + 1));
          whitespace();
          if (source[position] !== ",") break;
          position++;
        }
      }
      if (source[position++] !== "]") fail('Esperado "," ou "]"', position - 1);
      return { kind: "array", elements };
    }
    if (char === '"') return { kind: "string", value: string() };
    for (const literal of ["true", "false", "null"] as const) {
      if (source.startsWith(literal, position)) {
        position += literal.length;
        return literal === "null"
          ? { kind: "null" }
          : { kind: "boolean", value: literal === "true" };
      }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      source.slice(position),
    );
    if (number) {
      position += number[0].length;
      return { kind: "number", raw: number[0] };
    }
    fail(
      position === source.length
        ? "Esperado um valor JSON"
        : "Valor JSON inválido",
    );
  }

  const root = value(0);
  whitespace();
  if (position !== source.length) fail("Conteúdo inesperado após o valor JSON");
  return root;
}
