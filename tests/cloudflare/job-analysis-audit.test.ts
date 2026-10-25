import { expect, it, vi } from "vitest";
import { createWorker } from "../../worker/index";
import { DreamJobClient, ClientError } from "../../src/lib/api";
import { DreamJobDB } from "../../src/lib/storage";
import {
  analysisSchema,
  analyzeRequestSchema,
  scoreRequirements,
} from "../../shared/contracts";
import {
  analysisAuditSchema,
  jobAnalysisCandidateSchema,
  jobAnalysisAuditInstruction,
  jobAnalysisInstruction,
} from "../../worker/job-analysis";
import { structuredSchema, assertStructuredSchema } from "../../worker/ai";
import { profile, env, identity, mockAI } from "./fixtures";
const jobDescription =
  "Backend developer. Required: TypeScript and accessible application development. Required: AWS certification. Preferred: Python. Preferred: 5 years of distributed systems experience. Responsibilities: collaborate with product and engineering.";
const input = {
  profile,
  jobDescription,
  companyName: "Synthetic Hiring Company",
  jobTitle: "Backend developer",
};
function draft() {
  return {
    jobTitle: "Backend developer",
    requirements: [
      {
        id: "r-typescript",
        requirement: "TypeScript and accessible application development",
        mandatory: true,
        category: "technical",
        status: "met",
        evidence:
          "TypeScript is verified and the candidate built 3 accessible applications.",
        sourceFactIds: ["skill-1", "ach-1"],
        jobDescriptionQuote:
          "Required: TypeScript and accessible application development.",
      },
      {
        id: "r-aws",
        requirement: "AWS certification",
        mandatory: true,
        category: "technical",
        status: "missing",
        evidence: "No AWS certification is evidenced in the verified profile.",
        sourceFactIds: [],
        jobDescriptionQuote: "Required: AWS certification.",
      },
      {
        id: "r-python",
        requirement: "Python",
        mandatory: false,
        category: "technical",
        status: "missing",
        evidence: "Python is not evidenced in the verified profile.",
        sourceFactIds: [],
        jobDescriptionQuote: "Preferred: Python.",
      },
      {
        id: "r-duration",
        requirement: "5 years of distributed systems experience",
        mandatory: false,
        category: "experience",
        status: "missing",
        evidence:
          "The requested duration/domain combination is not evidenced in the profile.",
        sourceFactIds: [],
        jobDescriptionQuote:
          "Preferred: 5 years of distributed systems experience.",
      },
    ],
    strengths: [
      "TypeScript and accessible application work are supported by the profile.",
    ],
    gaps: ["AWS certification and Python are not evidenced in the profile."],
    recommendations: [
      "Emphasize verified accessible application work.",
      "Consider AWS training or clarify any certification evidence before claiming it.",
    ],
    experienceAlignment:
      "The profile lists a Developer at Acme, 2021–2024. Distributed systems experience is not evidenced.",
  };
}
const supported = { supported: true, violations: [] };
function setup(value: unknown = draft(), audit: unknown = supported) {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(value))
    .mockResolvedValueOnce(mockAI(audit));
  const log = vi.fn();
  const w = createWorker({ authenticate: identity, fetcher, log });
  const request = (data: unknown = input) =>
    w.fetch(
      new Request("https://api.test/api/analyze-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
      env,
    );
  return { fetcher, log, w, request };
}
it("accepts supported comparisons, sourced requirements absent from the candidate, evidence gaps and prospective advice", async () => {
  const { request, fetcher, log } = setup();
  const response = await request();
  expect(response.status).toBe(200);
  const result = analysisSchema.parse(await response.json());
  expect(result.score).toBe(38);
  expect(result.score).toBe(scoreRequirements(result.requirements));
  expect(result.requirements[1].status).toBe("missing");
  expect(result.recommendations).toContain(
    "Consider AWS training or clarify any certification evidence before claiming it.",
  );
  expect(
    result.requirements.every((r) => !Object.hasOwn(r, "jobDescriptionQuote")),
  ).toBe(true);
  const generation = JSON.parse(fetcher.mock.calls[0][1].body);
  const audit = JSON.parse(fetcher.mock.calls[1][1].body);
  const source = JSON.parse(audit.messages[1].content);
  expect(source.candidate.profile).toEqual(profile);
  expect(source.candidate.facts["skill-1"]).toBe("TypeScript");
  expect(source.job.jobDescription).toBe(jobDescription);
  expect(source.job.companyName).toBe(input.companyName);
  expect(JSON.stringify(source.candidate)).not.toContain("AWS certification");
  expect(source.jobRequirementSources[1].quote).toBe(
    "Required: AWS certification.",
  );
  expect(source.analysis).not.toHaveProperty("score");
  expect(generation.messages[0].content).toContain(jobAnalysisInstruction);
  expect(audit.messages[0].content).toContain(jobAnalysisAuditInstruction);
  expect(audit.messages[0].content).toContain("absence of a fact is unknown");
  expect(audit.messages[0].content).toContain(
    "Valid IDs alone do not establish entailment",
  );
  expect(audit.messages[0].content).toContain("prospective advice");
  expect(audit.messages[0].content).toContain(
    "rather than demanding nonexistent citation fields",
  );
  expect(log).not.toHaveBeenCalled();
});
it("permits a supported partial comparison without upgrading it to a full match", async () => {
  const raw = draft();
  raw.requirements[0].status = "partial";
  raw.requirements[0].requirement = "TypeScript and Python";
  raw.requirements[0].jobDescriptionQuote = "Required: TypeScript and Python.";
  raw.requirements[0].sourceFactIds = ["skill-1"];
  raw.requirements[0].evidence =
    "TypeScript is evidenced; Python is not evidenced in the profile.";
  const { request } = setup(raw);
  const response = await request({
    ...input,
    jobDescription: jobDescription.replace(
      "Required: TypeScript and accessible application development.",
      "Required: TypeScript and Python.",
    ),
  });
  expect(response.status).toBe(200);
  const result = analysisSchema.parse(await response.json());
  expect(result.requirements[0].status).toBe("partial");
  expect(result.score).toBe(19);
});
const unsupported = [
  {
    name: "invented skill",
    rule: "unsupported_candidate_fact",
    field: "strengths",
    index: 0,
    mutate: (r: any) => {
      r.strengths[0] = "The candidate is an AWS expert.";
    },
  },
  {
    name: "invented employer",
    rule: "unsupported_candidate_fact",
    field: "experienceAlignment",
    index: null,
    mutate: (r: any) => {
      r.experienceAlignment = "Previously employed at Globex.";
    },
  },
  {
    name: "invented degree",
    rule: "unsupported_candidate_fact",
    field: "strengths",
    index: 0,
    mutate: (r: any) => {
      r.strengths[0] = "The candidate holds a PhD.";
    },
  },
  {
    name: "invented certification",
    rule: "unsupported_candidate_fact",
    field: "strengths",
    index: 0,
    mutate: (r: any) => {
      r.strengths[0] = "The candidate is AWS certified.";
    },
  },
  {
    name: "invented duration",
    rule: "unsupported_quantitative_claim",
    field: "experienceAlignment",
    index: null,
    mutate: (r: any) => {
      r.experienceAlignment =
        "The candidate has 10 years of distributed systems experience.";
    },
  },
  {
    name: "invented achievement",
    rule: "unsupported_quantitative_claim",
    field: "requirements.evidence",
    index: 0,
    mutate: (r: any) => {
      r.requirements[0].evidence = "Increased revenue by 50%.";
    },
  },
  {
    name: "absence asserted as lack",
    rule: "missing_evidence_as_absence",
    field: "gaps",
    index: 0,
    mutate: (r: any) => {
      r.gaps[0] = "The candidate has never used Python.";
    },
  },
  {
    name: "misleading recommendation",
    rule: "misleading_recommendation",
    field: "recommendations",
    index: 0,
    mutate: (r: any) => {
      r.recommendations[0] = "Highlight your AWS certification.";
    },
  },
  {
    name: "fabricated job requirement using a real unrelated quote",
    rule: "unsupported_job_requirement",
    field: "requirements.requirement",
    index: 1,
    mutate: (r: any) => {
      r.requirements[1].requirement = "PhD in computer science";
    },
  },
  {
    name: "preferred requirement promoted to mandatory",
    rule: "incorrect_requirement_classification",
    field: "requirements.mandatory",
    index: 2,
    mutate: (r: any) => {
      r.requirements[2].mandatory = true;
    },
  },
  {
    name: "valid IDs cited for an unsupported match",
    rule: "unsupported_match",
    field: "requirements.status",
    index: 1,
    mutate: (r: any) => {
      r.requirements[1].status = "met";
      r.requirements[1].sourceFactIds = ["skill-1"];
    },
  },
  {
    name: "invented job metadata",
    rule: "unsupported_job_metadata",
    field: "jobTitle",
    index: null,
    mutate: (r: any) => {
      r.jobTitle = "Chief Executive Officer";
    },
  },
] as const;
it.each(unsupported)(
  "rejects $name with a safe rule/path instead of partial acceptance",
  async (test) => {
    const raw = draft();
    test.mutate(raw);
    const { request, log, fetcher } = setup(raw, {
      supported: false,
      violations: [{ rule: test.rule, field: test.field, index: test.index }],
    });
    const response = await request();
    expect(response.status).toBe(422);
    const body: any = await response.json();
    expect(body.error.code).toBe("UNSUPPORTED_CLAIM");
    expect(body).not.toHaveProperty("requirements");
    const event = log.mock.calls
      .map((c) => c[0])
      .find((e) => e.phase === "factuality");
    const [root, ...rest] = test.field.split(".");
    expect(event).toMatchObject({
      requestId: body.error.requestId,
      endpoint: "analyze-job",
      operation: "audit",
      factualitySource: "model",
      factualityIssueCount: 1,
      factualityIssues: [
        {
          rule: test.rule,
          path: [
            root,
            ...(test.index === null ? [] : [String(test.index)]),
            ...rest,
          ].join("."),
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(2); // No unreviewed repair/retry path.
    const logs = JSON.stringify(log.mock.calls);
    for (const privateValue of [
      profile.personal.fullName,
      profile.personal.email,
      jobDescription,
      raw.strengths[0],
      raw.experienceAlignment,
      env.OPENAI_API_KEY,
    ])
      expect(logs).not.toContain(privateValue);
  },
);
it.each([
  {
    name: "quote from candidate instead of job",
    rule: "unsupported_job_requirement",
    field: "requirements.0.jobDescriptionQuote",
    change: (r: any) => {
      r.requirements[0].jobDescriptionQuote =
        "Built 3 accessible applications.";
    },
  },
  {
    name: "invented job quote",
    rule: "unsupported_job_requirement",
    field: "requirements.0.jobDescriptionQuote",
    change: (r: any) => {
      r.requirements[0].jobDescriptionQuote =
        "Required: PhD and 20 years at Globex.";
    },
  },
  {
    name: "nonexistent candidate source",
    rule: "invalid_source_reference",
    field: "requirements.0.sourceFactIds",
    change: (r: any) => {
      r.requirements[0].sourceFactIds = ["job-description"];
    },
  },
  {
    name: "inherited object property as source",
    rule: "invalid_source_reference",
    field: "requirements.0.sourceFactIds",
    change: (r: any) => {
      r.requirements[0].sourceFactIds = ["constructor"];
    },
  },
  {
    name: "match without evidence",
    rule: "invalid_source_reference",
    field: "requirements.0.sourceFactIds",
    change: (r: any) => {
      r.requirements[0].sourceFactIds = [];
    },
  },
  {
    name: "missing status citing a match",
    rule: "invalid_source_reference",
    field: "requirements.1.sourceFactIds",
    change: (r: any) => {
      r.requirements[1].sourceFactIds = ["skill-1"];
    },
  },
  {
    name: "duplicate requirement ID",
    rule: "duplicate_requirement_id",
    field: "requirements.1.id",
    change: (r: any) => {
      r.requirements[1].id = r.requirements[0].id;
    },
  },
])("application rejects $name before a paid audit call", async (test) => {
  const raw = draft();
  test.change(raw);
  const { request, fetcher, log } = setup(raw);
  const response = await request();
  expect(response.status).toBe(422);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const event = log.mock.calls
    .map((c) => c[0])
    .find((e) => e.phase === "factuality");
  expect(event).toMatchObject({
    factualitySource: "application",
    factualityIssues: [{ rule: test.rule, path: test.field }],
  });
});
it("accepts exact requirement quotations across harmless source whitespace", async () => {
  const { request } = setup();
  const response = await request({
    ...input,
    jobDescription: jobDescription.replace(
      "TypeScript and accessible",
      "TypeScript and\n\taccessible",
    ),
  });
  expect(response.status).toBe(200);
});
it.each([
  {
    supported: true,
    violations: [
      { rule: "unsupported_candidate_fact", field: "strengths", index: 0 },
    ],
  },
  { supported: false, violations: [] },
  {
    supported: false,
    violations: [
      { rule: "PRIVATE_MODEL_TEXT_TOKEN", field: "strengths", index: 0 },
    ],
  },
  {
    supported: false,
    violations: [
      {
        rule: "unsupported_candidate_fact",
        field: "PRIVATE_MODEL_TEXT_TOKEN",
        index: 0,
      },
    ],
  },
  {
    supported: false,
    violations: [
      { rule: "unsupported_candidate_fact", field: "strengths", index: 29 },
    ],
  },
  {
    supported: false,
    violations: [
      { rule: "unsupported_candidate_fact", field: "strengths", index: null },
    ],
  },
  {
    supported: false,
    violations: [
      {
        rule: "unsupported_candidate_fact",
        field: "experienceAlignment",
        index: 0,
      },
    ],
  },
  {
    supported: false,
    violations: [
      {
        rule: "unsupported_candidate_fact",
        field: "strengths",
        index: 0,
        reason: "PRIVATE_MODEL_TEXT_TOKEN",
      },
    ],
  },
  { supported: false, reasons: ["PRIVATE_MODEL_TEXT_TOKEN"] },
])(
  "fails closed on malformed/contradictory audit result %# without logging text",
  async (review) => {
    const { request, log } = setup(draft(), review);
    const response = await request();
    expect(response.status).toBe(502);
    expect(((await response.json()) as any).error.code).toBe(
      "INVALID_AI_RESPONSE",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      "PRIVATE_MODEL_TEXT_TOKEN",
    );
  },
);
it("caps diagnostic violations while retaining the failure", async () => {
  const violations = Array.from({ length: 50 }, () => ({
    rule: "unsupported_candidate_fact",
    field: "strengths",
    index: 0,
  }));
  const { request, log } = setup(draft(), { supported: false, violations });
  expect((await request()).status).toBe(422);
  const event = log.mock.calls
    .map((c) => c[0])
    .find((e) => e.phase === "factuality");
  expect(event.factualityIssueCount).toBe(50);
  expect(event.factualityIssues).toHaveLength(12);
});
it("keeps job inputs, approved profile, history and analyses unchanged after an audit rejection", async () => {
  const db = new DreamJobDB("job-analysis-audit-" + crypto.randomUUID());
  try {
    await db.approveProfile(profile, true);
    const before = await db.exportBackup();
    const beforeInput = structuredClone(input);
    const { w } = setup(draft(), {
      supported: false,
      violations: [
        { rule: "unsupported_candidate_fact", field: "strengths", index: 0 },
      ],
    });
    const client = new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    );
    const e = await client.analyzeJob(input).catch((e) => e);
    expect(e).toBeInstanceOf(ClientError);
    expect(e.code).toBe("UNSUPPORTED_CLAIM");
    expect(e.requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(input).toEqual(beforeInput);
    expect((await db.exportBackup()).professionalProfiles).toEqual(
      before.professionalProfiles,
    );
    expect(await db.profileVersions.count()).toBe(1);
    expect(await db.jobAnalyses.count()).toBe(0);
  } finally {
    await db.delete();
  }
});
it("keeps model schema, public API and deterministic scoring contracts distinct and strict", () => {
  assertStructuredSchema(structuredSchema(jobAnalysisCandidateSchema));
  assertStructuredSchema(structuredSchema(analysisAuditSchema));
  expect(
    jobAnalysisCandidateSchema.safeParse({ ...draft(), score: 100 }).success,
  ).toBe(false);
  const missingQuote: any = draft();
  delete missingQuote.requirements[0].jobDescriptionQuote;
  expect(jobAnalysisCandidateSchema.safeParse(missingQuote).success).toBe(
    false,
  );
  expect(
    analyzeRequestSchema.safeParse({
      ...input,
      profile: { ...profile, verified: false },
    }).success,
  ).toBe(false);
});
it("logger failures never allow a failed audit to pass", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(draft()))
    .mockResolvedValueOnce(
      mockAI({
        supported: false,
        violations: [
          { rule: "missing_evidence_as_absence", field: "gaps", index: 0 },
        ],
      }),
    );
  const w = createWorker({
    authenticate: identity,
    fetcher,
    log: () => {
      throw Error("logger unavailable");
    },
  });
  const r = await w.fetch(
    new Request("https://api.test/api/analyze-job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    env,
  );
  expect(r.status).toBe(422);
});
it("allows a sourced explicit shortfall rather than treating every negative gap as unsupported", async () => {
  const candidate = {
    ...profile,
    summary: profile.summary + " Does not hold an AWS certification.",
  };
  const raw = draft();
  raw.gaps = [
    "The verified profile explicitly states that the candidate does not hold an AWS certification.",
  ];
  const { request } = setup(raw);
  expect((await request({ ...input, profile: candidate })).status).toBe(200);
});
it("rejects non-English generated analysis through the dedicated audit rule", async () => {
  const raw = draft();
  raw.strengths = ["Texto sintetico no ingles."];
  const { request, log } = setup(raw, {
    supported: false,
    violations: [{ rule: "invalid_language", field: "strengths", index: 0 }],
  });
  expect((await request()).status).toBe(422);
  expect(JSON.stringify(log.mock.calls)).not.toContain(raw.strengths[0]);
});
