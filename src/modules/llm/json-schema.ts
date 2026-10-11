import { z } from 'zod';

/** JSON Schema for a Zod schema, as Gemini's `parametersJsonSchema` / `responseJsonSchema` expect it. */
export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<
    string,
    unknown
  >;
  return jsonSchema;
}
