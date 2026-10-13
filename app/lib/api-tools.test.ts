import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { API_TOOLS, getApiTool } from "./api-tools";
import { getTool, isMultiTool } from "../../core/registry";

/** The server-side pipeline tools that have a page in the web UI. */
const EXPECTED_KEYS = [
  "atlas-packer",
  "sequence-to-sheet",
  "sheet-to-sequence",
  "nine-slice",
  "palette-swap",
  "palette-extract",
  "asset-lint",
  "trim",
  "alpha-bleed",
  "png-optimize",
];

interface JsonField {
  type?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
}

function paramsSchema(tool: string): { properties: Record<string, JsonField>; required: string[] } {
  const definition = getTool(tool);
  if (!definition) throw new Error(`unknown tool: ${tool}`);
  const schema = z.toJSONSchema(z.object(definition.params)) as {
    properties?: Record<string, JsonField>;
    required?: string[];
  };
  return { properties: schema.properties ?? {}, required: schema.required ?? [] };
}

const EXPECTED_TYPES: Record<string, string[]> = {
  number: ["number", "integer"],
  boolean: ["boolean"],
  enum: ["string"],
  text: ["string"],
  list: ["array"],
  colorPairs: ["array"],
};

describe("API_TOOLS", () => {
  test("covers exactly the pipeline tools and resolves by key", () => {
    expect([...API_TOOLS.map((config) => config.key)].sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(new Set(API_TOOLS.map((config) => config.key)).size).toBe(EXPECTED_KEYS.length);

    for (const config of API_TOOLS) {
      const definition = getTool(config.apiTool);
      expect(definition).toBeDefined();
      expect(isMultiTool(definition!)).toBe(config.inputs === "multiple");
      expect(getApiTool(config.key)).toBe(config);
    }
    expect(getApiTool("no-such-tool")).toBeUndefined();
  });

  test("only exposes parameters the API really accepts, with a compatible kind", () => {
    const problems: string[] = [];

    for (const config of API_TOOLS) {
      const { properties } = paramsSchema(config.apiTool);
      for (const option of config.options) {
        const where = `${config.key}.${option.name}`;
        const field = properties[option.name];
        if (!field) {
          problems.push(`${where}: not a parameter of ${config.apiTool}`);
          continue;
        }
        if (field.type && !EXPECTED_TYPES[option.kind].includes(field.type)) {
          problems.push(`${where}: kind "${option.kind}" but the schema type is "${field.type}"`);
        }
        if (option.kind === "boolean" && option.defaultValue === undefined) {
          problems.push(`${where}: boolean options need a defaultValue`);
        }
        if (option.kind === "enum") {
          const allowed = field.enum ?? [];
          if (allowed.length === 0) problems.push(`${where}: schema is not an enum`);
          for (const choice of option.choices ?? []) {
            if (!allowed.includes(choice.value)) {
              problems.push(`${where}: choice "${choice.value}" is not allowed (${allowed.join(", ")})`);
            }
          }
          if ((option.choices?.length ?? 0) !== allowed.length) {
            problems.push(
              `${where}: ${option.choices?.length ?? 0} choices offered but the schema allows ${allowed.length}`
            );
          }
        }
        if (option.kind === "number") {
          if (option.min !== undefined && field.minimum !== undefined && option.min < field.minimum) {
            problems.push(`${where}: min ${option.min} is below the schema minimum ${field.minimum}`);
          }
          if (option.max !== undefined && field.maximum !== undefined && option.max > field.maximum) {
            problems.push(`${where}: max ${option.max} is above the schema maximum ${field.maximum}`);
          }
        }
      }
    }

    expect(problems).toEqual([]);
  });

  test("every parameter the API requires has a form field", () => {
    const problems: string[] = [];
    for (const config of API_TOOLS) {
      const { required } = paramsSchema(config.apiTool);
      const covered = new Set(config.options.map((option) => option.name));
      for (const name of required) {
        if (!covered.has(name)) problems.push(`${config.key}.${name}: required by the API but missing from the form`);
      }
    }
    expect(problems).toEqual([]);
  });

  test("multi-input tools declare the same minimum as the registry", () => {
    for (const config of API_TOOLS.filter((entry) => entry.inputs === "multiple")) {
      const definition = getTool(config.apiTool)!;
      expect(config.minInputs ?? 2).toBe(isMultiTool(definition) ? definition.minInputs ?? 2 : 1);
    }
  });
});