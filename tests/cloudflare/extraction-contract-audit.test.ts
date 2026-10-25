import { expect, it, vi } from "vitest";
import { z } from "zod";
import fixture from "./fixtures/extraction-url-sequence.json";
import {
  professionalProfileSchema,
  extractResponseSchema,
  extractionCandidateSchema,
} from "../../shared/contracts";
import { parseExtractedProfile } from "../../worker/extraction";
import {
  structuredSchema,
  extractionSchema,
  assertStructuredSchema,
} from "../../worker/ai";
import { createWorker } from "../../worker/index";
import { DreamJobClient } from "../../src/lib/api";
import { DreamJobDB } from "../../src/lib/storage";
import { profile, env, identity, mockAI } from "./fixtures";
const clean = () => ({
  profile: structuredClone(fixture.expectedProfile),
  warnings: [],
});
const warningCategories = [
  "LinkedIn URL",
  "Portfolio URL",
  "GitHub URL",
  "certification URLs",
  "Project 1:",
  "General profile links:",
];
it("reproduces the final confirmed general link failure with canonical validation", () => {
  const raw = clean();
  raw.profile.links = [
    { id: "invalid-link", label: "Professional site", url: "N/A" },
  ];
  const before = professionalProfileSchema.safeParse(raw.profile);
  expect(before.success).toBe(false);
  if (!before.success)
    expect(
      before.error.issues.map((i) => ({
        path: i.path.join("."),
        code: i.code,
      })),
    ).toEqual([
      { path: "links.0.url", code: "invalid_format" },
      { path: "links.0.url", code: "custom" },
    ]);
  const result = parseExtractedProfile(raw);
  expect(result.success).toBe(true);
  if (result.success) {
    expect(result.data.profile.links).toEqual([]);
    expect(result.data.warnings.join(" ")).toContain("General profile links:");
  }
});
const omitted = Symbol("omitted");
it.each(
  [
    omitted,
    null,
    "",
    "   ",
    "N/A",
    "not provided",
    "site.test/me",
    "http://site.test/me",
    "javascript:alert(1)",
    "https://user:secret@site.test/me",
    "https://localhost/me",
    "https://example.com/me",
    "https://placeholder.invalid/me",
    "https://site.test/{username}",
    "https://site.test/your-url",
    123,
    {},
    [],
    "https://site.test/" + "a".repeat(2100),
  ].map((url, index) => ({ url, index })),
)(
  "filters general link case $index while preserving valid labels/URLs/order and facts",
  ({ url }) => {
    const raw: any = clean();
    const bad: any = { id: "general-invalid", label: "Optional destination" };
    if (url !== omitted) bad.url = url;
    raw.profile.links.splice(1, 0, bad);
    const before = structuredClone(raw);
    const result = parseExtractedProfile(raw);
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.profile).toEqual(fixture.expectedProfile);
    expect(raw).toEqual(before);
  },
);
it("leaves empty general link arrays untouched without a removal warning", () => {
  const raw = clean();
  raw.profile.links = [];
  expect(parseExtractedProfile(raw)).toEqual({ success: true, data: raw });
});
it("rejects malformed link metadata, duplicate IDs and bounds before removing bad URLs", () => {
  for (const mutate of [
    (r: any) => {
      r.profile.links[0].id = "";
    },
    (r: any) => {
      r.profile.links[0].id = "skill-1";
    },
    (r: any) => {
      r.profile.links[0].label = "";
    },
    (r: any) => {
      r.profile.links[0].label = "   ";
    },
    (r: any) => {
      r.profile.links[0].label = 123;
    },
    (r: any) => {
      r.profile.links[0].unknown = true;
    },
    (r: any) => {
      r.profile.links.push({ ...r.profile.links[0] });
    },
    (r: any) => {
      r.profile.links = Array.from({ length: 11 }, (_, i) => ({
        id: `bad-${i}`,
        label: "Site",
        url: "N/A",
      }));
    },
    (r: any) => {
      r.warnings = Array(51).fill("Review");
    },
  ]) {
    const raw: any = clean();
    raw.profile.links[0].url = "N/A";
    mutate(raw);
    expect(parseExtractedProfile(raw).success).toBe(false);
  }
});
it("the complete historical failure fixture passes the full mocked pipeline and remains unsaved", async () => {
  const db = new DreamJobDB("contract-audit-" + crypto.randomUUID());
  try {
    await db.approveProfile(profile, true);
    const before = await db.professionalProfiles.toArray();
    const log = vi.fn();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(mockAI(fixture.candidate))
      .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
    const w = createWorker({ authenticate: identity, fetcher, log });
    const client = new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    );
    const result = await client.extractProfile({ text: fixture.sourceText });
    expect(extractResponseSchema.parse(result)).toEqual(result);
    expect(professionalProfileSchema.safeParse(result.profile).success).toBe(
      true,
    );
    expect({
      ...result.profile,
      id: fixture.expectedProfile.id,
      updatedAt: fixture.expectedProfile.updatedAt,
    }).toEqual(fixture.expectedProfile);
    expect(result.profile.verified).toBe(false);
    for (const category of warningCategories)
      expect(result.warnings.some((w) => w.includes(category))).toBe(true);
    const audit = JSON.parse(
      JSON.parse(fetcher.mock.calls[1][1].body).messages[1].content,
    );
    expect(audit.output.profile).toEqual(fixture.expectedProfile);
    expect(audit.output.warnings.join(" ")).toContain("General profile links:");
    const provider = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(provider.messages[0].content).toContain(
      "General profile links and project links are optional collections",
    );
    expect(log).not.toHaveBeenCalled();
    expect(await db.professionalProfiles.toArray()).toEqual(before);
    expect(await db.profileVersions.count()).toBe(1);
  } finally {
    await db.delete();
  }
});
it("retains every recovery warning even with maximum model/project/certification warnings", async () => {
  const raw: any = structuredClone(fixture.candidate);
  raw.warnings = Array.from({ length: 50 }, (_, i) => `Review ${i}`);
  raw.profile.projects = Array.from({ length: 10 }, (_, i) => ({
    ...raw.profile.projects[0],
    id: `project-${i}`,
    achievements: [],
    links: [{ id: `plink-${i}`, label: "Site", url: "N/A" }],
  }));
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(raw))
    .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
  const response = await createWorker({
    authenticate: identity,
    fetcher,
    log: () => {},
  }).fetch(
    new Request("https://api.test/api/extract-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: fixture.sourceText }),
    }),
    env,
  );
  expect(response.status).toBe(200);
  const result = extractResponseSchema.parse(await response.json());
  expect(result.warnings).toHaveLength(50);
  for (const category of warningCategories)
    expect(result.warnings.some((w) => w.includes(category))).toBe(true);
  for (let i = 1; i <= 10; i++)
    expect(result.warnings.some((w) => w.startsWith(`Project ${i}:`))).toBe(
      true,
    );
});
it("does not normalize arbitrary client responses or canonical saved profiles", () => {
  expect(extractResponseSchema.safeParse(fixture.candidate).success).toBe(
    false,
  );
  expect(
    professionalProfileSchema.safeParse(fixture.candidate.profile).success,
  ).toBe(false);
});
it("uses one supported nullable candidate URL schema for both collections and strict final URLs", () => {
  const provider: any = structuredSchema(extractionSchema);
  assertStructuredSchema(provider);
  const p = provider.properties.profile.properties;
  expect(p.links.items).toEqual(p.projects.items.properties.links.items);
  expect(p.links.items.required).toEqual(
    expect.arrayContaining(["id", "label", "url"]),
  );
  expect(JSON.stringify(p.links.items.properties.url)).toContain("null");
  const final: any = z.toJSONSchema(extractResponseSchema, { io: "input" });
  expect(
    final.properties.profile.properties.links.items.properties.url.type,
  ).toBe("string");
  expect(
    extractionCandidateSchema.safeParse({
      ...clean(),
      profile: {
        ...fixture.expectedProfile,
        links: [{ id: "nullable-link", label: "Site", url: null }],
      },
    }).success,
  ).toBe(true);
});
it("still rejects unsupported professional facts after every URL recovery", async () => {
  const log = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(fixture.candidate))
    .mockResolvedValueOnce(
      mockAI({ supported: false, reasons: ["Unsupported claim"] }),
    );
  const r = await createWorker({ authenticate: identity, fetcher, log }).fetch(
    new Request("https://api.test/api/extract-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: fixture.sourceText }),
    }),
    env,
  );
  expect(r.status).toBe(422);
  expect(((await r.json()) as any).error.code).toBe("UNSUPPORTED_CLAIM");
  expect(JSON.stringify(log.mock.calls)).not.toContain("Alex Synthetic");
  expect(JSON.stringify(log.mock.calls)).not.toContain(
    "Built 3 accessible applications",
  );
});
// Exercise every populated field/record in the complete fixture, rather than
// approving one happy path per field. Only the six documented URL paths recover.
type Path = (string | number)[];
const urlPath = (path: Path) =>
  /^(profile\.personal\.(linkedin|portfolio|github)|profile\.certifications\[\]\.url|profile\.projects\[\]\.links\[\]\.url|profile\.links\[\]\.url)$/.test(
    path
      .map((p) => (typeof p === "number" ? "[]" : "." + p))
      .join("")
      .slice(1),
  );
function parent(root: any, path: Path) {
  return path.slice(0, -1).reduce((p, k) => p[k], root);
}
const cases: { path: Path; value: any }[] = [];
function inventory(value: any, path: Path = []) {
  if (path.length) cases.push({ path, value });
  if (Array.isArray(value)) value.forEach((v, i) => inventory(v, [...path, i]));
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value)) inventory(v, [...path, k]);
}
inventory(clean());
for (const { path, value } of cases.filter((c) => !urlPath(c.path))) {
  it(`rejects missing/wrong-type required contract value: ${path.join(".")}`, () => {
    const raw: any = clean();
    const target = parent(raw, path);
    const key = path.at(-1)!;
    target[key] = Array.isArray(value)
      ? {}
      : typeof value === "object"
        ? []
        : typeof value === "string"
          ? 123
          : typeof value === "boolean"
            ? "false"
            : "invalid";
    expect(parseExtractedProfile(raw).success).toBe(false);
    if (typeof key !== "number") {
      const missing: any = clean();
      delete parent(missing, path)[key];
      expect(parseExtractedProfile(missing).success).toBe(false);
    }
  });
}
it("enforces every nested array bound and rejects unknown fields on every record", () => {
  const schema: any = z.toJSONSchema(extractResponseSchema, { io: "input" });
  let arrayCount = 0,
    objectCount = 0;
  function visit(node: any, value: any, path: Path) {
    if (node.anyOf) {
      const branch = node.anyOf.find((n: any) => n.type !== "null");
      if (branch) visit(branch, value, path);
      return;
    }
    if (node.type === "array") {
      arrayCount++;
      const raw: any = clean();
      parent(raw, path)[path.at(-1)!] = Array.from(
        { length: node.maxItems + 1 },
        (_, i) => (value.length ? structuredClone(value[0]) : "Review"),
      );
      const result = parseExtractedProfile(raw);
      expect(result.success).toBe(false);
      if (!result.success)
        expect(
          result.error.issues.some(
            (i) => i.code === "too_big" && i.path.join(".") === path.join("."),
          ),
        ).toBe(true);
      value.forEach((v: any, i: number) => visit(node.items, v, [...path, i]));
      return;
    }
    if (node.type === "object") {
      objectCount++;
      const raw: any = clean();
      const obj = path.length ? parent(raw, path)[path.at(-1)!] : raw;
      obj.unexpected = "reject";
      expect(parseExtractedProfile(raw).success).toBe(false);
      for (const [key, child] of Object.entries(node.properties || {}))
        visit(child, value[key], [...path, key]);
    }
  }
  visit(schema, clean(), []);
  expect(arrayCount).toBe(12);
  expect(objectCount).toBeGreaterThan(20);
});
it("preserves explicit unknown provenance but rejects semantic non-URL errors", () => {
  const unknown: any = clean();
  unknown.profile.education[0].provenance = null;
  const accepted = parseExtractedProfile(unknown);
  expect(accepted.success).toBe(true);
  if (accepted.success)
    expect(accepted.data.profile.education[0].provenance).toBeNull();
  for (const change of [
    (r: any) => {
      r.profile.personal.email = "N/A";
    },
    (r: any) => {
      r.profile.updatedAt = "yesterday";
    },
    (r: any) => {
      r.profile.version = 0;
    },
    (r: any) => {
      r.profile.version = 1.5;
    },
    (r: any) => {
      r.profile.verified = true;
    },
    (r: any) => {
      r.profile.skills[0].text = "   ";
    },
    (r: any) => {
      r.profile.projects[0].name = "";
    },
    (r: any) => {
      r.profile.certifications[0].name = "";
    },
    (r: any) => {
      r.profile.languages[0].name = "";
    },
    (r: any) => {
      r.profile.education[0].provenance.source = "invented";
    },
    (r: any) => {
      r.profile.links[1].id = r.profile.projects[0].links[1].id;
    },
  ]) {
    const raw: any = structuredClone(fixture.candidate);
    change(raw);
    expect(parseExtractedProfile(raw).success).toBe(false);
  }
});
it("retains missing reviewable personal facts as blanks and prevents incomplete approval", async () => {
  const raw = clean();
  raw.profile.personal.fullName = "";
  const db = new DreamJobDB("missing-required-review-" + crypto.randomUUID());
  try {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(mockAI(raw))
      .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
    const w = createWorker({ authenticate: identity, fetcher, log: () => {} });
    const client = new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    );
    const result = await client.extractProfile({ text: fixture.sourceText });
    expect(result.profile.personal.fullName).toBe("");
    expect(result.profile.verified).toBe(false);
    expect(result.warnings).toContain(
      "Missing fullName; review before approval.",
    );
    await expect(db.approveProfile(result.profile, true)).rejects.toThrow();
    expect(await db.professionalProfiles.count()).toBe(0);
  } finally {
    await db.delete();
  }
});
it("enforces all declared non-URL string bounds without truncating professional facts", () => {
  const schema: any = z.toJSONSchema(extractResponseSchema, { io: "input" });
  let count = 0;
  function visit(node: any, value: any, path: Path) {
    if (node.anyOf) {
      for (const branch of node.anyOf.filter((n: any) => n.type !== "null"))
        visit(branch, value, path);
      return;
    }
    if (node.type === "array") {
      value?.forEach((v: any, i: number) => visit(node.items, v, [...path, i]));
      return;
    }
    if (node.type === "object") {
      for (const [key, child] of Object.entries(node.properties || {}))
        visit(child, value?.[key], [...path, key]);
      return;
    }
    if (node.type === "string" && !urlPath(path) && node.maxLength) {
      count++;
      const raw: any = clean();
      parent(raw, path)[path.at(-1)!] = "x".repeat(node.maxLength + 1);
      expect(parseExtractedProfile(raw).success).toBe(false);
    }
    if (node.type === "string" && !urlPath(path) && node.minLength) {
      const raw: any = clean();
      parent(raw, path)[path.at(-1)!] = "";
      expect(parseExtractedProfile(raw).success).toBe(false);
    }
  }
  visit(schema, clean(), []);
  expect(count).toBeGreaterThan(30);
});
