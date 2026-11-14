import { describe, expect, it } from "vitest";
import Ajv2019 from "ajv/dist/2019.js";
import { generateSchema } from "../../src/core/generate";
import { DIALECT } from "../../src/core/infer";
import { LIMITS } from "../../src/core/limits";
import { EXAMPLE } from "../../src/example";
import expectedExample from "../fixtures/example.schema.json" with { type: "json" };

const ajv = new Ajv2019({ strict: true, allErrors: true });
const schemaFor = (source: string) => JSON.parse(generateSchema(source));

describe("Draft 2019-09 generation", () => {
  const samples = [
    EXAMPLE,
    "{}",
    "[]",
    "null",
    "true",
    "false",
    '"2024-01-09"',
    "42",
    "-12.00",
    '{"a":{"b":[{"c":true}]}}',
    "[1,2,3]",
    '[1,2.00,"x",true,null,{},[]]',
    '[{"id":1,"name":"Ana"},{"id":2}]',
    '[[1],["x"],[]]',
    '{"3ds_authentic_silent":true,"__proto__":{"constructor":1}}',
  ];

  it.each(samples)(
    "produces a valid schema accepting the original input: %s",
    (source) => {
      const schema = schemaFor(source);
      expect(ajv.validateSchema(schema), JSON.stringify(ajv.errors)).toBe(true);
      const validate = ajv.compile(schema);
      expect(
        validate(JSON.parse(source)),
        JSON.stringify(validate.errors),
      ).toBe(true);
    },
  );

  it("matches the requested example exactly including whitespace and property order", () => {
    expect(generateSchema(EXAMPLE)).toBe(
      JSON.stringify(expectedExample, null, 2),
    );
  });

  it("preserves source order for integer-like and special keys at every level", () => {
    const output = generateSchema(
      '{"10":0,"2":{"3":0,"1":0},"1":0,"__proto__":true}',
    );
    expect(output).toContain(
      '"required": [\n    "10",\n    "2",\n    "1",\n    "__proto__"\n  ]',
    );
    expect(output.indexOf('"10": {')).toBeLessThan(output.indexOf('"2": {'));
    expect(output.indexOf('"3": {')).toBeLessThan(output.indexOf('"1": {'));
    expect(schemaFor('{"__proto__":true}').properties).toHaveProperty(
      "__proto__",
    );
    expect(Object.prototype).not.toHaveProperty("polluted");
  });

  it.each([
    ["10", "integer"],
    ["-0", "integer"],
    ["9007199254740993123456789", "integer"],
    ["10.00", "number"],
    ["10444.0100", "number"],
    ["1e3", "number"],
    ["0E+0", "number"],
    ["1e400", "number"],
    ["1e-400", "number"],
  ])("classifies the original numeric token %s as %s", (source, type) => {
    expect(schemaFor(source)).toEqual({ $schema: DIALECT, type });
  });

  it("preserves string names after JSON unescaping", () => {
    const result = schemaFor('{"a\\u0062":1,"quote\\\"":true,"á🚀":null}');
    expect(result.required).toEqual(["ab", 'quote"', "á🚀"]);
  });

  it("deduplicates alternatives in first-seen order", () => {
    expect(schemaFor('[1,"a",2,true,"b",null]').items.anyOf).toEqual([
      { type: "integer" },
      { type: "string" },
      { type: "boolean" },
      { type: "null" },
    ]);
  });

  it("keeps required fields in each object alternative", () => {
    const result = schemaFor('[{"id":1,"name":"Ana"},{"id":2}]');
    expect(
      result.items.anyOf.map((item: { required: string[] }) => item.required),
    ).toEqual([["id", "name"], ["id"]]);
  });

  it("does not impose types on an empty array", () => {
    expect(schemaFor("[]").items).toEqual({});
    expect(schemaFor("{}")).toEqual({
      $schema: DIALECT,
      type: "object",
      required: [],
      properties: {},
    });
  });

  it("omits unrequested keywords and blank lines at all levels", () => {
    const schema = generateSchema(EXAMPLE);
    expect(schema.startsWith(`{\n  "$schema": "${DIALECT}"`)).toBe(true);
    expect(schema).not.toMatch(/\n\s*\n/);
    const forbidden = [
      "title",
      "additionalProperties",
      "description",
      "examples",
      "default",
      "enum",
      "format",
    ];
    function inspect(value: unknown): void {
      if (Array.isArray(value)) {
        value.forEach(inspect);
        return;
      }
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        expect(forbidden).not.toContain(key);
        inspect(child);
      }
    }
    inspect(JSON.parse(schema));
  });

  it("is deterministic across repeated generations", () => {
    expect(generateSchema(EXAMPLE)).toBe(generateSchema(EXAMPLE));
  });
});

describe("strict parsing and resource limits", () => {
  it.each([
    "",
    " ",
    "{",
    "[",
    '{"x":}',
    '{"x":1,}',
    "[1,]",
    "{x:1}",
    '{"x" 1}',
    '{"x":1 "y":2}',
    "01",
    "-01",
    "+1",
    ".5",
    "1.",
    "1e",
    "1e+",
    "NaN",
    "Infinity",
    "undefined",
    "true false",
    "// comment\n{}",
    "\uFEFF{}",
    '"unterminated',
    '"bad\\q"',
    '"bad\\u12G4"',
    '"bad\nstring"',
  ])("rejects invalid JSON %s with a source location", (source) => {
    expect(() => generateSchema(source)).toThrow(/linha \d+, coluna \d+/);
  });

  it("reports line and column for a duplicate including escaped spelling", () => {
    expect(() => generateSchema('{\n  "a":1,\n  "\\u0061":2\n}')).toThrow(
      "linha 3, coluna 3",
    );
    expect(() => generateSchema('{"a":1,"a":2}')).toThrow(
      "Propriedade duplicada",
    );
  });

  it("allows the same key in different objects", () => {
    expect(() => generateSchema('{"a":{"a":1}}')).not.toThrow();
  });

  it("accepts valid whitespace and string escapes", () => {
    expect(() =>
      generateSchema(' \r\n\t{"a":"\\\"\\\\\\/\\b\\f\\n\\r\\t\\u0041"} '),
    ).not.toThrow();
  });

  it("enforces byte size, not only string length", () => {
    expect(() =>
      generateSchema(`"${"á".repeat(LIMITS.inputBytes / 2)}"`),
    ).toThrow("1 MiB");
  });

  it("accepts a string exactly at the input byte limit", () => {
    expect(schemaFor(`"${"a".repeat(LIMITS.inputBytes - 2)}"`).type).toBe(
      "string",
    );
  });

  it("enforces a depth of 100 edges from the root", () => {
    expect(() =>
      generateSchema("[".repeat(100) + "0" + "]".repeat(100)),
    ).not.toThrow();
    expect(() =>
      generateSchema("[".repeat(101) + "0" + "]".repeat(101)),
    ).toThrow("100 níveis");
  });

  it("enforces the node limit without counting object keys as nodes", () => {
    expect(() =>
      generateSchema(`[${"0,".repeat(LIMITS.nodes - 2)}0]`),
    ).not.toThrow();
    expect(() => generateSchema(`[${"0,".repeat(LIMITS.nodes - 1)}0]`)).toThrow(
      "100 mil nós",
    );
  });

  it("bounds output amplification", () => {
    // Nested indentation and repeated required names can expand a compact input.
    const wide =
      "{" +
      Array.from({ length: 10000 }, (_, i) => `"field_${i}":0`).join(",") +
      "}";
    const nested = '{"x":'.repeat(80) + wide + "}".repeat(80);
    expect(() => generateSchema(nested)).toThrow("10 MiB");
  });
});
