import { expect, it, vi } from "vitest";
import { profile, env, identity, mockAI } from "./fixtures";
import { createWorker } from "../../worker/index";
import {
  assessmentPolicy,
  assessmentInstruction,
  coherentAssessment,
} from "../../worker/assessment-policy";
import { analysisSchema, scoreRequirements } from "../../shared/contracts";
import { displayAnalysis } from "../../src/lib/adapter";
import { DreamJobDB } from "../../src/lib/storage";
const candidate = {
  ...profile,
  skills: [...profile.skills, { id: "react", text: "React", provenance: null }],
};
const descriptions = [
  "TypeScript and Python",
  "Accessible application development",
  "BSc degree",
  "React and AWS certification",
  "AWS certification",
  "Vue frontend development",
  "5 years of distributed systems experience",
  "Own scalable systems architecture",
];
const quotes = descriptions.map(
  (s, i) => `${i < 4 ? "Required" : "Preferred"}: ${s}.`,
);
const jobDescription = quotes.join(" ");
function draft(optimistic = false) {
  const statuses = optimistic
    ? ["met", "met", "met", "met", "missing", "partial", "partial", "met"]
    : [
        "partial",
        "met",
        "met",
        "partial",
        "missing",
        "partial",
        "missing",
        "partial",
      ];
  const refs = [
    ["skill-1"],
    ["ach-1"],
    ["edu-1"],
    ["react"],
    [],
    ["react"],
    optimistic ? ["exp-1"] : [],
    ["ach-1"],
  ];
  const evidence = [
    "TypeScript is evidenced; Python is not evidenced.",
    "Built 3 accessible applications.",
    "BSc is evidenced.",
    "React is evidenced; AWS certification is not evidenced.",
    "AWS certification is not evidenced.",
    "React component experience is transferable; Vue proficiency is not evidenced.",
    "The profile lists developer work from 2021–2024; the requested duration/domain is not evidenced.",
    "Application delivery is evidenced; scale and architecture ownership scope remain unclear.",
  ];
  return {
    jobTitle: "Developer",
    requirements: descriptions.map((requirement, index) => ({
      id: `requirement-${index}`,
      requirement,
      mandatory: index < 4,
      category:
        index === 2 ? "education" : index === 6 ? "experience" : "technical",
      status: statuses[index],
      evidence: evidence[index],
      sourceFactIds: refs[index],
      jobDescriptionQuote: quotes[index],
    })),
    strengths: ["TypeScript and React work are supported."],
    gaps: [
      "Python, AWS certification and the requested distributed-systems duration are not evidenced.",
    ],
    recommendations: [
      "Emphasize verified application delivery and clarify missing qualifications before claiming them.",
    ],
    experienceAlignment:
      "The profile lists a developer role and application delivery. Review exact requirement coverage.",
  };
}
function review(disagree = false) {
  const desired = draft();
  const bases = [
    "subset",
    "direct",
    "direct",
    "subset",
    "none",
    "transferable",
    "none",
    "ambiguous",
  ];
  const reasons = [
    "incomplete_coverage",
    "direct_evidence",
    "direct_evidence",
    "incomplete_coverage",
    "credential_not_evidenced",
    "transferable_alignment",
    "duration_not_evidenced",
    "ambiguous_job_scope",
  ];
  return {
    supported: !disagree,
    statusReviews: desired.requirements.map((r, index) => ({
      index,
      status: r.status,
      basis: bases[index],
      reason: reasons[index],
      sourceFactIds: r.sourceFactIds,
    })),
    violations: disagree
      ? [0, 3, 6, 7].map((index) => ({
          rule: "status_disagreement",
          field: "requirements.status",
          index,
        }))
      : [],
  };
}
function patches() {
  const d = draft();
  return {
    revisions: [0, 3, 6, 7].map((index) => ({
      index,
      status: d.requirements[index].status,
      evidence: d.requirements[index].evidence,
      sourceFactIds: d.requirements[index].sourceFactIds,
    })),
  };
}
function setup(responses: unknown[]) {
  const fetcher = vi.fn();
  for (const r of responses) fetcher.mockResolvedValueOnce(mockAI(r));
  const log = vi.fn();
  const w = createWorker({ authenticate: identity, fetcher, log });
  const request = (signal?: AbortSignal) =>
    w.fetch(
      new Request("https://api.test/api/analyze-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile: candidate, jobDescription }),
        signal,
      }),
      env,
    );
  return { fetcher, log, request, w };
}
function payload(fetcher: any, index: number) {
  const b = JSON.parse(fetcher.mock.calls[index][1].body);
  return {
    system: b.messages[0].content,
    data: JSON.parse(b.messages[1].content),
    schema: b.response_format.json_schema.schema,
  };
}
it("realistic direct, partial, transferable, genuine gap and ambiguous assessments pass one complete independent review", async () => {
  const { request, fetcher } = setup([draft(), review()]);
  const response = await request();
  expect(response.status).toBe(200);
  const result = analysisSchema.parse(await response.json());
  expect(result.score).toBe(63);
  expect(result.requirements.map((r) => r.status)).toEqual(
    draft().requirements.map((r) => r.status),
  );
  expect(result.requirements[4]).toMatchObject({
    status: "missing",
    sourceFactIds: [],
  });
  expect(result.requirements[5].evidence).toContain(
    "Vue proficiency is not evidenced",
  );
  expect(result.requirements[7].evidence).toContain("scope remain unclear");
  expect(result.experienceAlignment).not.toContain("Evidence review revised");
  expect(fetcher).toHaveBeenCalledTimes(2);
  const generation = payload(fetcher, 0),
    audit = payload(fetcher, 1);
  for (const key of ["job", "candidate", "assessmentPolicy"])
    expect(generation.data[key]).toEqual(audit.data[key]);
  expect(generation.data.assessmentPolicy).toEqual(assessmentPolicy);
  expect(generation.system).toContain(assessmentInstruction);
  expect(audit.system).toContain(assessmentInstruction);
  expect(audit.data.analysis).not.toHaveProperty("score");
  expect(audit.schema.properties.statusReviews.minItems).toBe(8);
  expect(audit.schema.properties.statusReviews.maxItems).toBe(8);
  expect(
    audit.schema.properties.statusReviews.items.properties.index.maximum,
  ).toBe(7);
});
it("four status-only overstatements get one constrained revision and a fresh full audit, with visible disclosure and recomputed score", async () => {
  const original = draft(true),
    before = structuredClone(original);
  const { request, fetcher, log } = setup([
    original,
    review(true),
    patches(),
    review(),
  ]);
  const response = await request();
  expect(response.status).toBe(200);
  const result = analysisSchema.parse(await response.json());
  expect(result.score).toBe(63);
  expect(result.score).toBe(scoreRequirements(result.requirements));
  expect(result.experienceAlignment).toContain(
    "Evidence review revised 4 requirement assessments",
  );
  expect(displayAnalysis(result, candidate).experienceAlignment).toContain(
    "Evidence review revised 4",
  );
  expect(result.requirements.map((r) => r.status)).toEqual(
    draft().requirements.map((r) => r.status),
  );
  expect(original).toEqual(before);
  expect(result.strengths).toEqual(original.strengths);
  expect(result.gaps).toEqual(original.gaps);
  expect(result.recommendations).toEqual(original.recommendations);
  for (let i = 0; i < 8; i++) {
    const {
      status,
      evidence,
      sourceFactIds,
      jobDescriptionQuote,
      ...immutable
    } = original.requirements[i];
    expect(result.requirements[i]).toMatchObject(immutable);
  }
  expect(fetcher).toHaveBeenCalledTimes(4);
  expect(
    fetcher.mock.calls.every(
      (call) => call[1].signal === fetcher.mock.calls[0][1].signal,
    ),
  ).toBe(true);
  for (let i = 0; i < 4; i++) {
    const b = payload(fetcher, i);
    expect(b.system).toContain(assessmentInstruction);
    expect(b.data.assessmentPolicy).toEqual(assessmentPolicy);
    expect(b.data.candidate.profile).toEqual(candidate);
  }
  const final = payload(fetcher, 3).data;
  expect(final.reviewProcess).toEqual({
    attempt: 1,
    revisedIndexes: [0, 3, 6, 7],
  });
  expect(final).not.toHaveProperty("requestedRevisions");
  expect(final).not.toHaveProperty("violations");
  expect(final.analysis.requirements).toEqual(result.requirements);
  const diagnostic = log.mock.calls
    .map((c) => c[0])
    .find((e) => e.phase === "assessment_review");
  expect(diagnostic.assessmentReview).toMatchObject({
    policyVersion: assessmentPolicy.version,
    attempt: 0,
    revisionEligible: true,
  });
  expect(diagnostic.assessmentReview.assessments).toContainEqual({
    index: 6,
    proposedStatus: "partial",
    reviewedStatus: "missing",
    basis: "none",
    reason: "duration_not_evidenced",
    referenceCount: 0,
  });
  for (const secret of [
    candidate.personal.fullName,
    candidate.personal.email,
    jobDescription,
    original.requirements[0].evidence,
    "react",
  ])
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
});
it.each([
  "unsupported_candidate_fact",
  "unsupported_quantitative_claim",
  "evidence_deficiency",
])(
  "literal unsupported claims and evidence failures remain fatal: %s",
  async (rule) => {
    const audit = review(true);
    audit.violations.push({ rule, field: "requirements.evidence", index: 0 });
    const { request, fetcher } = setup([
      draft(true),
      audit,
      patches(),
      review(),
    ]);
    expect((await request()).status).toBe(422);
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);
it("legacy unsupported_candidate_fact labels at status paths remain rejected rather than reclassified by the application", async () => {
  const audit = review(true);
  for (const v of audit.violations) v.rule = "unsupported_candidate_fact";
  const { request, fetcher } = setup([draft(true), audit]);
  expect((await request()).status).toBe(422);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("a second disagreement is fatal with no third generation or unbounded retry", async () => {
  const audit = review();
  audit.supported = false;
  audit.violations = [
    { rule: "unsupported_candidate_fact", field: "strengths", index: 0 },
  ];
  const { request, fetcher } = setup([
    draft(true),
    review(true),
    patches(),
    audit,
  ]);
  expect((await request()).status).toBe(422);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it.each([
  {
    name: "unknown review reference",
    change: (r: any) => {
      r.statusReviews[0].sourceFactIds = ["PRIVATE_UNKNOWN_REFERENCE"];
    },
  },
  {
    name: "missing review row",
    change: (r: any) => {
      r.statusReviews.pop();
    },
  },
  {
    name: "duplicate review index",
    change: (r: any) => {
      r.statusReviews[1].index = 0;
    },
  },
  {
    name: "out-of-range review index",
    change: (r: any) => {
      r.statusReviews[0].index = 30;
    },
  },
  {
    name: "status/basis contradiction",
    change: (r: any) => {
      r.statusReviews[0].basis = "direct";
    },
  },
  {
    name: "unreported disagreement",
    change: (r: any) => {
      r.statusReviews[0] = {
        index: 0,
        status: "missing",
        basis: "none",
        reason: "no_supporting_evidence",
        sourceFactIds: [],
      };
    },
  },
  {
    name: "invented diagnostic reason",
    change: (r: any) => {
      r.statusReviews[0].reason = "PRIVATE_MODEL_TEXT";
    },
  },
])("rejects malformed independent review: $name", async ({ change }) => {
  const audit = review();
  change(audit);
  const { request, fetcher, log } = setup([draft(), audit]);
  expect((await request()).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(log.mock.calls)).not.toContain("PRIVATE");
});
it.each([
  {
    name: "omitted patch",
    change: (p: any) => {
      p.revisions.pop();
    },
  },
  {
    name: "duplicate patch",
    change: (p: any) => {
      p.revisions[1] = p.revisions[0];
    },
  },
  {
    name: "unflagged row",
    change: (p: any) => {
      p.revisions[0].index = 1;
    },
  },
  {
    name: "status upgrade",
    change: (p: any) => {
      p.revisions[0].status = "met";
    },
  },
  {
    name: "new unrelated valid source",
    change: (p: any) => {
      p.revisions[0].sourceFactIds = ["edu-1"];
    },
  },
  {
    name: "invented source",
    change: (p: any) => {
      p.revisions[0].sourceFactIds = ["PRIVATE_MODEL_ID"];
    },
  },
  {
    name: "rewritten job requirement",
    change: (p: any) => {
      p.revisions[0].requirement = "A different job requirement";
    },
  },
  {
    name: "silenced evidence",
    change: (p: any) => {
      p.revisions[0].evidence = "";
    },
  },
])("rejects unsafe revision: $name", async ({ change }) => {
  const patch = patches();
  change(patch);
  const { request, fetcher } = setup([draft(true), review(true), patch]);
  expect((await request()).status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("cannot upgrade a genuine missing qualification through automatic revision", async () => {
  const audit = review();
  audit.supported = false;
  audit.statusReviews[4] = {
    index: 4,
    status: "partial",
    basis: "transferable",
    reason: "transferable_alignment",
    sourceFactIds: ["react"],
  };
  audit.violations = [
    { rule: "status_disagreement", field: "requirements.status", index: 4 },
  ];
  const { request, fetcher } = setup([draft(), audit]);
  expect((await request()).status).toBe(422);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("unknown evidence in a revised missing row is rejected before the final paid review", async () => {
  const patch = patches();
  patch.revisions.find((r) => r.index === 6)!.sourceFactIds = ["exp-1"];
  const { request, fetcher } = setup([draft(true), review(true), patch]);
  expect((await request()).status).toBe(422);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("revision and re-audit still respect the original abort signal", async () => {
  const { fetcher, request } = setup([]);
  const controller = new AbortController();
  fetcher
    .mockImplementationOnce(async () => mockAI(draft(true)))
    .mockImplementationOnce(async () => mockAI(review(true)))
    .mockImplementationOnce(async (_url, init) => {
      controller.abort();
      expect(init.signal.aborted).toBe(true);
      throw Error("Synthetic cancellation");
    });
  const response = await request(controller.signal);
  expect(response.status).toBe(504);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("invalid revised claims cannot change approved profiles, histories, analyses or resumes", async () => {
  const db = new DreamJobDB("assessment-review-" + crypto.randomUUID());
  try {
    await db.approveProfile(candidate, true);
    const before = await db.exportBackup();
    const final = review();
    final.supported = false;
    final.violations = [
      {
        rule: "unsupported_candidate_fact",
        field: "requirements.evidence",
        index: 0,
      },
    ];
    const { request } = setup([draft(true), review(true), patches(), final]);
    expect((await request()).status).toBe(422);
    const after = await db.exportBackup();
    expect({ ...after, exportedAt: before.exportedAt }).toEqual(before);
  } finally {
    await db.delete();
  }
});
it("rubric invariants do not turn generic related evidence into direct qualifications", () => {
  expect(
    coherentAssessment({
      index: 0,
      status: "met",
      basis: "transferable",
      reason: "transferable_alignment",
      sourceFactIds: ["react"],
    }),
  ).toBe(false);
  expect(
    coherentAssessment({
      index: 0,
      status: "met",
      basis: "ambiguous",
      reason: "ambiguous_job_scope",
      sourceFactIds: ["react"],
    }),
  ).toBe(false);
  expect(
    coherentAssessment({
      index: 0,
      status: "missing",
      basis: "none",
      reason: "credential_not_evidenced",
      sourceFactIds: [],
    }),
  ).toBe(true);
  expect(assessmentPolicy.partial).toContain(
    "never asserts the missing named skill",
  );
});
