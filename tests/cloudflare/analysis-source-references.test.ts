import { expect, it, vi } from "vitest";
import { z } from "zod";
import {
  allFactEntries,
  validateAnalysis,
  verifiedProfileSchema,
  analysisSchema,
} from "../../shared/contracts";
import { jobAnalysisProviderContract } from "../../worker/job-analysis";
import { structuredSchema, assertStructuredSchema } from "../../worker/ai";
import { createWorker } from "../../worker/index";
import { DreamJobDB } from "../../src/lib/storage";
import { DreamJobClient } from "../../src/lib/api";
import { profile, env, identity, mockAI, auditWithStatuses } from "./fixtures";
const jobDescription =
  "Required: TypeScript. Preferred: AWS certification. Responsibilities include accessible application development.";
function draft(status = "met", ids = ["skill-1"]) {
  return {
    jobTitle: "Developer",
    requirements: Array.from({ length: 5 }, (_, index) => ({
      id: `req-${index}`,
      requirement:
        index === 4 && status === "missing"
          ? "AWS certification"
          : "TypeScript",
      mandatory: index !== 4,
      category: "technical",
      status: index === 4 ? status : "met",
      evidence:
        index === 4 && status === "missing"
          ? "AWS certification is not evidenced in the profile."
          : "TypeScript is evidenced in the profile.",
      sourceFactIds: index === 4 ? ids : ["skill-1"],
      jobDescriptionQuote:
        index === 4 && status === "missing"
          ? "Preferred: AWS certification."
          : "Required: TypeScript.",
    })),
    strengths: ["TypeScript is evidenced."],
    gaps: status === "missing" ? ["AWS certification is not evidenced."] : [],
    recommendations: ["Emphasize verified TypeScript work."],
    experienceAlignment: "The profile lists a developer role.",
  };
}
function setup(
  raw: unknown = draft(),
  verdict: unknown = { supported: true, violations: [] },
) {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(raw))
    .mockResolvedValueOnce(mockAI(auditWithStatuses(raw, verdict)));
  const log = vi.fn();
  const worker = createWorker({ authenticate: identity, fetcher, log });
  const request = (p: unknown = profile) =>
    worker.fetch(
      new Request("https://api.test/api/analyze-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: p, jobDescription }),
      }),
      env,
    );
  return { request, fetcher, log, worker };
}
it("generation and validation use the same approved fact inventory without rewriting IDs", async () => {
  const approved = verifiedProfileSchema.parse({
    ...profile,
    skills: [{ ...profile.skills[0], id: " opaque fact / Ω " }],
    projects: [
      {
        id: "project-stable",
        name: "Tool",
        description: "A tool",
        achievements: [
          { id: "project-fact", text: "Built a tool", provenance: null },
        ],
        links: [
          {
            id: "project-link",
            label: "Source",
            url: "https://repo.test/tool",
          },
        ],
        provenance: null,
      },
    ],
    certifications: [
      {
        id: "certificate-stable",
        name: "Certificate",
        issuer: "Institute",
        dates: "2024",
        url: null,
        provenance: null,
      },
    ],
    languages: [
      {
        id: "language-stable",
        name: "English",
        proficiency: "Fluent",
        provenance: null,
      },
    ],
    achievements: [
      {
        id: "achievement-stable",
        text: "Mentored colleagues",
        provenance: null,
      },
    ],
    links: [
      { id: "link-stable", label: "Writing", url: "https://writing.test/alex" },
    ],
  });
  const raw = draft("met", [" opaque fact / Ω "]);
  for (const r of raw.requirements) r.sourceFactIds = [" opaque fact / Ω "];
  const before = structuredClone(approved);
  const { request, fetcher } = setup(raw);
  expect((await request(approved)).status).toBe(200);
  const generation = JSON.parse(fetcher.mock.calls[0][1].body);
  const facts = JSON.parse(generation.messages[1].content).candidate.facts;
  expect(facts).toEqual(Object.fromEntries(allFactEntries(approved)));
  const schema = generation.response_format.json_schema.schema;
  assertStructuredSchema(schema);
  const branches = schema.properties.requirements.items.anyOf;
  const match = branches.find((b: any) =>
    b.properties.status.enum.includes("met"),
  );
  const missing = branches.find((b: any) =>
    b.properties.status.enum.includes("missing"),
  );
  expect(match.properties.sourceFactIds.items.enum).toEqual(Object.keys(facts));
  expect(match.properties.sourceFactIds.minItems).toBe(1);
  expect(missing.properties.sourceFactIds.maxItems).toBe(0);
  expect(facts).toHaveProperty("personal");
  expect(facts).toHaveProperty("headline");
  expect(facts).toHaveProperty("summary");
  for (const id of [
    "exp-1",
    "ach-1",
    "edu-1",
    "project-stable",
    "project-fact",
    "project-link",
    "certificate-stable",
    "language-stable",
    "achievement-stable",
    "link-stable",
  ])
    expect(Object.hasOwn(facts, id)).toBe(true);
  expect(Object.hasOwn(facts, approved.id)).toBe(false);
  expect(generation.messages[0].content).toContain("sourceFactIds MUST be []");
  expect(generation.messages[0].content).toContain(
    "only exact keys of candidate.facts",
  );
  expect(approved).toEqual(before);
});
it.each([
  {
    status: "met",
    ids: ["PRIVATE_UNKNOWN_ID"],
    reasons: ["unknown_fact_id"],
    unknown: 1,
  },
  {
    status: "partial",
    ids: [],
    reasons: ["match_without_evidence"],
    unknown: 0,
  },
  { status: "met", ids: [], reasons: ["match_without_evidence"], unknown: 0 },
  {
    status: "missing",
    ids: ["skill-1"],
    reasons: ["missing_status_with_references"],
    unknown: 0,
  },
  {
    status: "missing",
    ids: ["PRIVATE_UNKNOWN_ID"],
    reasons: ["unknown_fact_id", "missing_status_with_references"],
    unknown: 1,
  },
  {
    status: "met",
    ids: ["skill-1", "PRIVATE_UNKNOWN_ID"],
    reasons: ["unknown_fact_id"],
    unknown: 1,
  },
  {
    status: "met",
    ids: ["profile.skills.0"],
    reasons: ["unknown_fact_id"],
    unknown: 1,
  },
  { status: "met", ids: ["req-4"], reasons: ["unknown_fact_id"], unknown: 1 },
  {
    status: "met",
    ids: ["profile-1"],
    reasons: ["unknown_fact_id"],
    unknown: 1,
  },
  {
    status: "met",
    ids: ["constructor"],
    reasons: ["unknown_fact_id"],
    unknown: 1,
  },
])(
  "distinguishes fifth-requirement cause: $status / $reasons",
  async ({ status, ids, reasons, unknown }) => {
    const raw = draft(status, ids);
    const before = structuredClone(raw);
    const { request, fetcher, log } = setup(raw);
    const response = await request();
    expect(response.status).toBe(422);
    const body: any = await response.json();
    expect(body.error.code).toBe("UNSUPPORTED_CLAIM");
    const event = log.mock.calls
      .map((c) => c[0])
      .find((e) => e.phase === "factuality");
    expect(event).toMatchObject({
      requestId: body.error.requestId,
      operation: "audit",
      factualitySource: "application",
      factualityIssues: [
        {
          rule: "invalid_source_reference",
          path: "requirements.4.sourceFactIds",
        },
      ],
      sourceReferenceFailure: {
        reasons,
        status,
        referenceCount: ids.length,
        unknownReferenceCount: unknown,
        schemaMode: "enum",
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(raw).toEqual(before);
    const logs = JSON.stringify(log.mock.calls);
    for (const value of [
      "PRIVATE_UNKNOWN_ID",
      profile.personal.fullName,
      profile.personal.email,
      jobDescription,
    ])
      expect(logs).not.toContain(value);
  },
);
it.each(["met", "partial", "missing"])(
  "provider contract enforces status/reference invariant for %s",
  (status) => {
    const { schema } = jobAnalysisProviderContract(
      Object.fromEntries(allFactEntries(profile)),
    );
    expect(
      schema.safeParse(draft(status, status === "missing" ? [] : ["skill-1"]))
        .success,
    ).toBe(true);
    expect(
      schema.safeParse(draft(status, status === "missing" ? ["skill-1"] : []))
        .success,
    ).toBe(false);
    expect(schema.safeParse(draft(status, ["invented-id"])).success).toBe(
      false,
    );
  },
);
it("a role requirement without matching candidate evidence legitimately returns missing and []", async () => {
  const { request, fetcher } = setup(draft("missing", []));
  const response = await request();
  expect(response.status).toBe(200);
  const result = analysisSchema.parse(await response.json());
  expect(result.requirements[4]).toMatchObject({
    status: "missing",
    sourceFactIds: [],
    requirement: "AWS certification",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(result.score).toBe(92); // Four mandatory matches (12) + one preferred missing (1).
});
it("known references do not bypass independent semantic factuality checks", async () => {
  const { request, fetcher } = setup(draft("met", ["skill-1"]), {
    supported: false,
    violations: [
      { rule: "unsupported_match", field: "requirements.status", index: 4 },
    ],
  });
  const response = await request();
  expect(response.status).toBe(422);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(((await response.json()) as any).error.code).toBe("UNSUPPORTED_CLAIM");
});
it("same references remain subject to the shared canonical analysis validator", () => {
  for (const [status, ids] of [
    ["met", []],
    ["missing", ["skill-1"]],
    ["partial", ["unknown"]],
  ] as const) {
    const raw = draft(status, [...ids]);
    const candidate = {
      ...raw,
      requirements: raw.requirements.map(({ jobDescriptionQuote, ...r }) => r),
    };
    expect(() => validateAnalysis(candidate, profile)).toThrow();
  }
});
it("large ID inventories retain all facts and stay inside supported provider enum limits", () => {
  const facts = Object.fromEntries(
    Array.from({ length: 300 }, (_, i) => [
      `id-${i}-` + "x".repeat(100),
      "Synthetic approved fact",
    ]),
  );
  const contract = jobAnalysisProviderContract(facts);
  expect(contract.mode).toBe("validated_string");
  const json: any = structuredSchema(contract.schema);
  assertStructuredSchema(json);
  const match = json.properties.requirements.items.anyOf.find((b: any) =>
    b.properties.status.enum.includes("met"),
  );
  expect(match.properties.sourceFactIds.items.enum).toBeUndefined();
  const raw = draft();
  for (const r of raw.requirements) r.sourceFactIds = [Object.keys(facts)[0]];
  expect(contract.schema.safeParse(raw).success).toBe(true);
  raw.requirements[4].sourceFactIds = ["invented"];
  expect(contract.schema.safeParse(raw).success).toBe(false);
  expect(Object.keys(facts)).toHaveLength(300);
});
it("all runtime profile records are unchanged after the failed reference request", async () => {
  const db = new DreamJobDB("source-reference-" + crypto.randomUUID());
  try {
    await db.approveProfile(profile, true);
    const before = await db.exportBackup();
    const { worker } = setup(draft("missing", ["skill-1"]));
    const client = new DreamJobClient("https://api.test", async (url, init) =>
      worker.fetch(new Request(url, init), env),
    );
    await expect(
      client.analyzeJob({ profile, jobDescription }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CLAIM", status: 422 });
    const after = await db.exportBackup();
    expect({ ...after, exportedAt: before.exportedAt }).toEqual(before);
  } finally {
    await db.delete();
  }
});
