import { it, expect } from "vitest";
import * as c from "../../shared/contracts";
import { profileSchema, safeURL } from "../../shared/model.js";
import {
  profileDraftSchema,
  resumeSnapshotSchema,
} from "../../shared/workspace.js";
import { savedResumeSchema, backupSchema } from "../../src/lib/storage";
import fixtures from "./contract-compatibility.json";
const schemas: any = {
  professionalProfile: c.professionalProfileSchema,
  extractRequest: c.extractRequestSchema,
  analyzeRequest: c.analyzeRequestSchema,
  generateRequest: c.generateRequestSchema,
  refineRequest: c.refineRequestSchema,
  tailoredResume: c.tailoredResumeSchema,
  legacyProfile: profileSchema,
  draftProfile: profileDraftSchema,
  legacySnapshot: resumeSnapshotSchema,
  savedResume: savedResumeSchema,
  backup: backupSchema,
  safeURL,
  url: c.urlSchema,
};
it.each(fixtures.map((f, i) => ({ ...f, index: i })))(
  "preserves Zod 3 validation/output case $index ($schema)",
  (f) => {
    let parsed: any;
    try {
      parsed = schemas[f.schema].safeParse(f.value);
    } catch {
      parsed = { success: false };
    }
    expect(parsed.success).toBe(f.success);
    if (f.success) expect(parsed.data).toEqual(f.data);
  },
);
import { integerSchema } from "../../shared/validation.js";
import { professionalProfileSchema } from "../../shared/contracts";
import { structuredSchema } from "../../worker/ai";
import { profile } from "./fixtures";
it("preserves Zod 3 integer semantics without changing integer JSON Schema types", () => {
  expect(
    professionalProfileSchema.safeParse({ ...profile, version: 1e20 }).success,
  ).toBe(true);
  expect(integerSchema.safeParse(1.5).success).toBe(false);
  expect(integerSchema.safeParse(Infinity).success).toBe(false);
  expect(
    (structuredSchema(professionalProfileSchema) as any).properties.version
      .type,
  ).toBe("integer");
});
