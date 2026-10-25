import { it, expect, vi } from "vitest";
import {
  extractedLinkedinField,
  extractResponseSchema,
  professionalProfileSchema,
} from "../../shared/contracts";
import {
  normalizeExtractedOptionalUrls,
  linkedinReviewWarning,
} from "../../worker/extraction";
import {
  structuredSchema,
  extractionSchema,
  assertStructuredSchema,
} from "../../worker/ai";
import { createWorker } from "../../worker/index";
import { profile, env, identity, mockAI } from "./fixtures";
import { DreamJobDB } from "../../src/lib/storage";
import { DreamJobClient } from "../../src/lib/api";
const omitted = Symbol("omitted");
const valid = [
  "https://www.linkedin.com/in/alex-developer-123",
  "https://linkedin.com/in/alex-developer-123/?trk=public_profile",
  "https://il.linkedin.com/in/alex-developer-123",
  "https://www.linkedin.com/pub/alex-developer/12/345/678",
  "https://WWW.LINKEDIN.COM/in/alex-developer-123",
];
const invalid = [
  omitted,
  null,
  "",
  "   ",
  "N/A",
  "not provided",
  "LinkedIn",
  "linkedin.com/in/alex",
  "www.linkedin.com/in/alex",
  "http://www.linkedin.com/in/alex",
  "https://portfolio.test/alex",
  "https://linkedin.com.evil.test/in/alex",
  "https://notlinkedin.com/in/alex",
  "https://www.linkedin.com@evil.test/in/alex",
  "javascript:alert(1)",
  "https://user:password@www.linkedin.com/in/alex",
  "https://www.linkedin.com/in/your-name",
  "https://www.linkedin.com/in/username",
  "https://www.linkedin.com/in/placeholder",
  "https://www.linkedin.com/in/%3Cname%3E",
  "https://www.linkedin.com",
  "https://lnkd.in/short-link",
  123,
  {},
  "https://www.linkedin.com/in/" + "x".repeat(2100),
];
function output(linkedin: unknown) {
  const personal: any = { ...profile.personal };
  if (linkedin === omitted) delete personal.linkedin;
  else personal.linkedin = linkedin;
  return { profile: { ...profile, verified: false, personal }, warnings: [] };
}
it("reproduces the confirmed two-issue production field rejection before normalization", () => {
  const p = professionalProfileSchema.safeParse(output("N/A").profile);
  expect(p.success).toBe(false);
  if (!p.success)
    expect(
      p.error.issues
        .filter((i) => i.path.join(".") === "personal.linkedin")
        .map((i) => i.code),
    ).toEqual(["invalid_format", "custom"]);
  const parsed = extractResponseSchema.parse(
    normalizeExtractedOptionalUrls(output("N/A")),
  );
  expect(parsed.profile.personal.linkedin).toBeNull();
});
it.each(valid)("preserves valid supplied LinkedIn URL exactly: %s", (url) => {
  const raw = output(url);
  const before = structuredClone(raw);
  const parsed = extractResponseSchema.parse(
    normalizeExtractedOptionalUrls(raw),
  );
  expect(parsed.profile.personal.linkedin).toBe(url);
  expect(raw).toEqual(before);
  expect(parsed.profile.verified).toBe(false);
});
it.each(invalid.map((value, index) => ({ value, index })))(
  "clears missing/invalid LinkedIn case $index without changing any other fields",
  ({ value }) => {
    const raw = output(value);
    const normalized: any = normalizeExtractedOptionalUrls(raw);
    const parsed = extractResponseSchema.parse(normalized);
    expect(parsed.profile.personal).toEqual({
      ...profile.personal,
      linkedin: null,
    });
    expect({ ...parsed.profile, personal: profile.personal }).toEqual({
      ...profile,
      verified: false,
    });
    expect(raw.profile.personal.linkedin).toEqual(
      value === omitted ? undefined : value,
    );
  },
);
it.each(["email", "fullName"])("does not relax validation for %s", (field) => {
  const raw = output("N/A");
  (raw.profile.personal as any)[field] =
    field === "fullName" ? 123 : "not valid";
  expect(
    extractResponseSchema.safeParse(normalizeExtractedOptionalUrls(raw))
      .success,
  ).toBe(false);
});
it("keeps invalid facts, duplicate IDs, malformed warnings and verification flags rejected", () => {
  for (const raw of [
    { ...output("N/A"), profile: { ...output("N/A").profile, verified: true } },
    { ...output("N/A"), warnings: [""] },
    { ...output("N/A"), warnings: Array(51).fill("Too many") },
    {
      ...output("N/A"),
      profile: {
        ...output("N/A").profile,
        skills: [...profile.skills, ...profile.skills],
      },
    },
    { ...output("N/A"), unexpected: true },
  ])
    expect(
      extractResponseSchema.safeParse(normalizeExtractedOptionalUrls(raw))
        .success,
    ).toBe(false);
});
it("uses the shared nullable field contract and an explicit null/no-fabrication extraction prompt", async () => {
  expect(extractionSchema).toBe(extractResponseSchema);
  const schema: any = structuredSchema(extractionSchema);
  assertStructuredSchema(schema);
  const personal = schema.properties.profile.properties.personal;
  expect(personal.required).toContain("linkedin");
  expect(JSON.stringify(personal.properties.linkedin)).toContain("null");
  expect(personal.properties.linkedin.description).toContain("Never infer");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(output("N/A")))
    .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
  const r = await createWorker({
    authenticate: identity,
    fetcher,
    log: () => {},
  }).fetch(
    new Request("https://api.test/api/extract-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Synthetic developer experience and a missing optional LinkedIn URL.",
      }),
    }),
    env,
  );
  expect(r.status).toBe(200);
  const req = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(req.messages[0].content).toContain("personal.linkedin must be null");
  const audit = JSON.parse(
    JSON.parse(fetcher.mock.calls[1][1].body).messages[1].content,
  );
  expect(audit.output.profile.personal.linkedin).toBeNull();
});
it("returns an unapproved review draft with a safe warning and never changes the saved master", async () => {
  const db = new DreamJobDB("linkedin-" + crypto.randomUUID());
  try {
    await db.approveProfile(profile, true);
    const before = await db.professionalProfiles.toArray();
    const log = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        mockAI({
          ...output("private-linkedin-placeholder"),
          warnings: Array.from({ length: 50 }, (_, i) => "Review " + i),
        }),
      )
      .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
    const w = createWorker({ authenticate: identity, fetcher, log });
    const client = new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    );
    const draft = await client.extractProfile({
      text: "Synthetic developer experience for manual review before any profile save.",
    });
    expect(draft.profile.personal.linkedin).toBeNull();
    expect(draft.profile.personal.fullName).toBe(profile.personal.fullName);
    expect(draft.profile.verified).toBe(false);
    expect(draft.warnings).toContain(linkedinReviewWarning);
    expect(draft.warnings.length).toBeLessThanOrEqual(50);
    expect(await db.professionalProfiles.toArray()).toEqual(before);
    expect(await db.profileVersions.count()).toBe(1);
    expect(log).not.toHaveBeenCalled();
  } finally {
    await db.delete();
  }
});
it("keeps the final response validator strict: it never normalizes arbitrary client responses", () => {
  expect(
    extractedLinkedinField.safeParse("https://portfolio.test/alex").success,
  ).toBe(false);
  expect(extractResponseSchema.safeParse(output("N/A")).success).toBe(false);
});
