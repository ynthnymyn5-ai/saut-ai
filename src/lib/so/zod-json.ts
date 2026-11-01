import { z } from "zod";

/** Minimal Zod → JSON Schema for tool parameters (objects, strings, numbers, enums, arrays, optionals). */
export function zodToJsonSchema(s: z.ZodTypeAny): Record<string, unknown> {
  const def = s._def as { typeName: string; [k: string]: unknown };
  switch (def.typeName) {
    case "ZodEffects": return zodToJsonSchema(def.schema as z.ZodTypeAny);
    case "ZodOptional":
    case "ZodNullable": return zodToJsonSchema(def.innerType as z.ZodTypeAny);
    case "ZodDefault": return { ...zodToJsonSchema(def.innerType as z.ZodTypeAny), default: (def.defaultValue as () => unknown)() };
    case "ZodString": return { type: "string" };
    case "ZodNumber": return { type: (def.checks as { kind: string }[]).some((c) => c.kind === "int") ? "integer" : "number" };
    case "ZodBoolean": return { type: "boolean" };
    case "ZodEnum": return { type: "string", enum: def.values as string[] };
    case "ZodArray": return { type: "array", items: zodToJsonSchema(def.type as z.ZodTypeAny) };
    case "ZodObject": {
      const shape = (s as z.ZodObject<z.ZodRawShape>).shape;
      const required = Object.entries(shape).filter(([, v]) => !(v as z.ZodTypeAny).isOptional()).map(([k]) => k);
      return { type: "object", properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, zodToJsonSchema(v as z.ZodTypeAny)])), required, additionalProperties: false };
    }
    default: return {};
  }
}
