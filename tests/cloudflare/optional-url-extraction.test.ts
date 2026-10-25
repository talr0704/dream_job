import { expect, it, vi } from "vitest";
import { z } from "zod";
import {
  extractResponseSchema,
  professionalProfileSchema,
  extractedOptionalUrlFields,
} from "../../shared/contracts";
import {
  normalizeExtractedOptionalUrls,
  optionalUrlReviewWarnings,
} from "../../worker/extraction";
import {
  extractionSchema,
  structuredSchema,
  assertStructuredSchema,
} from "../../worker/ai";
import { createWorker } from "../../worker/index";
import { DreamJobDB } from "../../src/lib/storage";
import { DreamJobClient } from "../../src/lib/api";
import { profile, env, identity, mockAI } from "./fixtures";

const locations = ["linkedin", "portfolio", "github", "certification"] as const;
type Location = (typeof locations)[number];
const omitted = Symbol("omitted");
function draft() {
  return {
    profile: {
      ...structuredClone(profile),
      verified: false,
      certifications: [
        {
          id: "cert-1",
          name: "Professional certification",
          issuer: "Issuer",
          dates: "2024",
          url: null,
          provenance: {
            source: "document" as const,
            quote: "Professional certification",
          },
        },
      ],
    },
    warnings: [] as string[],
  };
}
function setUrl(raw: ReturnType<typeof draft>, key: Location, value: unknown) {
  const record: any =
    key === "certification"
      ? raw.profile.certifications[0]
      : raw.profile.personal;
  const field = key === "certification" ? "url" : key;
  if (value === omitted) delete record[field];
  else record[field] = value;
}
function getUrl(raw: ReturnType<typeof draft>, key: Location) {
  return key === "certification"
    ? raw.profile.certifications[0].url
    : raw.profile.personal[key];
}
const invalid = [
  omitted,
  null,
  "",
  "   ",
  "N/A",
  "not provided",
  "https://",
  "www.site.test/me",
  "http://site.test/me",
  "ftp://site.test/me",
  "javascript:alert(1)",
  "mailto:alex@site.test",
  "https://user:secret@site.test/me",
  "https://localhost/me",
  "https://127.0.0.1/me",
  "https://example.com/me",
  "https://sub.example.org/me",
  "https://placeholder.invalid/me",
  "https://site.test/<name>",
  "https://site.test/%7Busername%7D",
  "https://your-website.test/me",
  "https://site.test/placeholder",
  123,
  {},
  [],
  "https://site.test/" + "a".repeat(2000),
];
for (const key of locations) {
  it.each(invalid.map((value, index) => ({ value, index })))(
    `${key}: invalid/missing case $index clears only optional URLs`,
    ({ value }) => {
      const raw = draft();
      setUrl(raw, key, value);
      const before = structuredClone(raw);
      const expected = draft();
      setUrl(expected, key, null);
      const result = extractResponseSchema.parse(
        normalizeExtractedOptionalUrls(raw),
      );
      expect(result).toEqual(expected);
      expect(raw).toEqual(before);
      expect(getUrl(result, key)).toBeNull();
      expect(optionalUrlReviewWarnings(result.profile).length).toBe(4);
    },
  );
  const valid =
    key === "linkedin"
      ? [
          "https://WWW.LINKEDIN.COM/in/alex-123/?trk=abc",
          "https://il.linkedin.com/pub/alex/1/2/3",
        ]
      : [
          "https://Portfolio.test:443/Alex/%E2%9C%93?ref=CV#Work",
          "https://github.com/alex-123?tab=repositories",
          "https://issuer.test/verify/abc-123",
          "https://site.test/work?tags[]=engineering&filter[tag]=a",
        ];
  it.each(valid)(`${key}: valid supplied URL is unchanged: %s`, (url) => {
    const raw = draft();
    setUrl(raw, key, url);
    const result = extractResponseSchema.parse(
      normalizeExtractedOptionalUrls(raw),
    );
    expect(getUrl(result, key)).toBe(url);
    expect(result).toEqual(raw);
  });
  it(`${key}: canonical profiles and unnormalized API responses still reject malformed values`, () => {
    const raw = draft();
    setUrl(raw, key, "N/A");
    expect(professionalProfileSchema.safeParse(raw.profile).success).toBe(
      false,
    );
    expect(extractResponseSchema.safeParse(raw).success).toBe(false);
  });
}
it("reproduces both confirmed portfolio validation codes before normalization", () => {
  const raw = draft();
  setUrl(raw, "portfolio", "N/A");
  const before = professionalProfileSchema.safeParse(raw.profile);
  expect(before.success).toBe(false);
  if (!before.success)
    expect(
      before.error.issues
        .filter((i) => i.path.join(".") === "personal.portfolio")
        .map((i) => i.code),
    ).toEqual(["invalid_format", "custom"]);
  expect(
    extractResponseSchema.safeParse(normalizeExtractedOptionalUrls(raw))
      .success,
  ).toBe(true);
});
it("keeps scalar URL normalization isolated from required URLs and other constraints", () => {
  const mutations: ((raw: any) => void)[] = [
    (r) => {
      delete r.profile.personal;
    },
    (r) => {
      r.profile.personal = [];
    },
    (r) => {
      delete r.profile.skills;
    },
    (r) => {
      r.profile.personal.fullName = 123;
    },
    (r) => {
      r.profile.personal.email = "invalid";
    },
    (r) => {
      r.profile.verified = true;
    },
    (r) => {
      r.profile.skills.push(r.profile.skills[0]);
    },
    (r) => {
      r.profile.certifications[0].name = "";
    },
    (r) => {
      r.profile.certifications[0].issuer = 123;
    },
    (r) => {
      r.profile.certifications[0].unexpected = true;
    },
    (r) => {
      r.profile.certifications.push(null);
    },
    (r) => {
      delete r.profile.certifications;
    },
    (r) => {
      r.warnings = [""];
    },
    (r) => {
      r.warnings = Array(51).fill("Review");
    },
    (r) => {
      r.profile.links = [
        { id: "link-1", label: "Professional site", url: "N/A" },
      ];
    },
    (r) => {
      r.profile.projects = [
        {
          id: "project-1",
          name: "Project",
          description: "Useful work",
          achievements: [],
          provenance: null,
          links: [{ id: "link-2", label: "Source code", url: "N/A" }],
        },
      ];
    },
  ];
  for (const mutate of mutations) {
    const raw = draft();
    setUrl(raw, "portfolio", "N/A");
    mutate(raw);
    const before = structuredClone(raw);
    const normalized = normalizeExtractedOptionalUrls(raw);
    expect(extractResponseSchema.safeParse(normalized).success).toBe(false);
    expect(raw).toEqual(before);
  }
});
it("uses shared required nullable schemas for every optional URL location", () => {
  const schema: any = structuredSchema(extractionSchema);
  assertStructuredSchema(schema);
  const p = schema.properties.profile.properties;
  for (const key of locations) {
    const parent =
      key === "certification" ? p.certifications.items : p.personal;
    const field = key === "certification" ? "url" : key;
    expect(parent.required).toContain(field);
    expect(JSON.stringify(parent.properties[field])).toContain("null");
    expect(parent.properties[field].description).toContain("Never infer");
    expect(extractedOptionalUrlFields[key].safeParse(null).success).toBe(true);
  }
});
it("returns retained facts and bounded privacy-safe warnings through audit/client without saving", async () => {
  const db = new DreamJobDB("optional-urls-" + crypto.randomUUID());
  try {
    await db.approveProfile(profile, true);
    const before = await db.professionalProfiles.toArray();
    const raw = draft();
    for (const key of locations) setUrl(raw, key, "private-invalid-url-marker");
    raw.warnings = Array.from({ length: 50 }, (_, i) => `Review ${i}`);
    const log = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(mockAI(raw))
      .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
    const worker = createWorker({ authenticate: identity, fetcher, log });
    const client = new DreamJobClient("https://api.test", async (url, init) =>
      worker.fetch(new Request(url, init), env),
    );
    const result = await client.extractProfile({
      text: "Synthetic developer experience with a professional certification for review.",
    });
    for (const key of locations)
      expect(getUrl(result as ReturnType<typeof draft>, key)).toBeNull();
    expect(result.profile.certifications).toEqual(
      draft().profile.certifications,
    );
    expect(result.profile.experience).toEqual(profile.experience);
    expect(result.profile.verified).toBe(false);
    expect(result.warnings).toEqual(
      expect.arrayContaining(optionalUrlReviewWarnings(result.profile)),
    );
    expect(result.warnings).toHaveLength(50);
    expect(JSON.stringify(result)).not.toContain("private-invalid-url-marker");
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(request.messages[0].content).toContain("certifications[].url");
    expect(request.messages[0].content).toContain(
      "never infer, repair, or fabricate any URL",
    );
    const audit = JSON.parse(
      JSON.parse(fetcher.mock.calls[1][1].body).messages[1].content,
    );
    expect(audit.output.profile.certifications).toEqual(
      draft().profile.certifications,
    );
    expect(JSON.stringify(audit.output)).not.toContain(
      "private-invalid-url-marker",
    );
    expect(await db.professionalProfiles.toArray()).toEqual(before);
    expect(await db.profileVersions.count()).toBe(1);
    expect(log).not.toHaveBeenCalled();
  } finally {
    await db.delete();
  }
});
it("never bypasses factuality review after optional URL normalization", async () => {
  const raw = draft();
  setUrl(raw, "portfolio", "N/A");
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(raw))
    .mockResolvedValueOnce(
      mockAI({ supported: false, reasons: ["Unsupported fact"] }),
    );
  const worker = createWorker({
    authenticate: identity,
    fetcher,
    log: () => {},
  });
  const response = await worker.fetch(
    new Request("https://api.test/api/extract-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Synthetic professional facts that require independent grounding verification.",
      }),
    }),
    env,
  );
  expect(response.status).toBe(422);
  expect(((await response.json()) as any).error.code).toBe("UNSUPPORTED_CLAIM");
});

it("inventories every nullable URL in the canonical extraction input profile", () => {
  const paths: string[] = [];
  function visit(node: any, path: string) {
    if (
      node.anyOf?.some((n: any) => n.type === "null") &&
      node.anyOf?.some((n: any) => n.format === "uri")
    )
      paths.push(path);
    for (const [key, child] of Object.entries(node.properties || {}))
      visit(child, path ? path + "." + key : key);
    if (node.items) visit(node.items, path + "[]");
  }
  visit(z.toJSONSchema(professionalProfileSchema, { io: "input" }), "");
  expect(paths.sort()).toEqual(
    [
      "personal.linkedin",
      "personal.portfolio",
      "personal.github",
      "certifications[].url",
    ].sort(),
  );
});
