import { z } from "zod";
// Zod 3's int() accepted every finite integer, not only safe integers. Keep
// that contract for unbounded versions/source indexes, including JSON Schema.
export const integerSchema = z
  .number()
  .refine(Number.isInteger, "Expected integer")
  .meta({ type: "integer" });
