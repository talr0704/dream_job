import { it, expect, vi } from "vitest";
import { planTailoring, evidenceCatalog } from "../../shared/evidence";
import {
  guardContent,
  validateContent,
  contentDigest,
} from "../../shared/tailoring";
import { DreamJobClient } from "../../src/lib/api";
import { createWorker } from "../../worker/index";
import { contentToJournal } from "../../src/lib/content-adapter";
import { DreamJobDB } from "../../src/lib/storage";
import { env, identity, mockAI } from "./fixtures";
import {
  evidenceProfile,
  engineCases,
  rewrittenAchievements,
} from "./evidence.fixture";
function draftFor(sample: (typeof engineCases)[number]) {
  const plan = planTailoring(evidenceProfile, sample.job);
  const project = plan.projects.find((p) => p.projectId === "mixed")!;
  const fact = project.facts.find((f) =>
    f.text.includes(sample.projectFragment),
  )!;
  return {
    summary: sample.summary,
    summarySourceFactIds: plan.experience[0].facts.map((e) => e.id),
    experience: [
      {
        experienceId: "career",
        bullets: plan.experience[0].facts.map((f) => ({
          sourceAchievementIds: [f.id],
          text: rewrittenAchievements[f.id],
        })),
      },
    ],
    projects: [
      {
        projectId: "mixed",
        description: sample.project,
        sourceFactIds: [fact.id],
      },
    ],
  };
}
const setup = (draft: unknown) => {
  const fetcher = vi.fn().mockResolvedValueOnce(mockAI(draft));
  const w = createWorker({ authenticate: identity, fetcher, log: () => {} });
  return {
    fetcher,
    client: new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    ),
    w,
  };
};
it.each(engineCases)(
  "ranks $role evidence by independently labelled competency coverage, not output string differences",
  (sample) => {
    const plan = planTailoring(evidenceProfile, sample.job);
    const selected = plan.experience[0].facts.map((f) => f.id);
    const precision =
      selected.filter((id) => sample.gold.includes(id)).length /
      selected.length;
    expect(precision).toBeGreaterThanOrEqual(2 / 3);
    expect(plan.priorities[0].id).toBe(sample.dimension);
    expect(plan.headline.text).not.toContain("Full Stack Web Developer");
    expect(plan.skillIds.length).toBeLessThan(evidenceProfile.skills.length);
    expect(
      plan.projects.find((p) => p.projectId === "mixed")!.facts[0].text,
    ).toContain(sample.projectFragment);
  },
);
it("changes semantic evidence selection and skill ranking across job families, including the same project's details", () => {
  const plans = engineCases.map((c) => planTailoring(evidenceProfile, c.job));
  expect(
    new Set(plans.map((p) => p.experience[0].facts.map((f) => f.id).join()))
      .size,
  ).toBe(3);
  expect(new Set(plans.map((p) => p.skillIds.join())).size).toBe(3);
  expect(new Set(plans.map((p) => p.headline.text)).size).toBe(3);
  // Gold labels are capability annotations of the source facts, not vocabulary
  // overlap between generated sentences. Renaming the target role cannot change them.
  const renamed = planTailoring(
    evidenceProfile,
    engineCases[0].job.replace("Product Manager", "Role X"),
  );
  expect(renamed.experience[0].facts.map((f) => f.id)).toEqual(
    plans[0].experience[0].facts.map((f) => f.id),
  );
});
it.each(engineCases)(
  "composes $role in one provider call with traceable summary/project evidence and protected history",
  async (sample) => {
    const raw = draftFor(sample);
    const { client, fetcher } = setup(raw);
    const result = await client.tailorResume({
      profile: evidenceProfile,
      jobDescription: sample.job,
      strategy: "evidence",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    const payload = JSON.parse(request.messages[1].content);
    expect(payload).not.toHaveProperty("currentDraft");
    expect(JSON.stringify(payload)).not.toContain(evidenceProfile.headline);
    expect(JSON.stringify(payload)).not.toContain(
      evidenceProfile.personal.email,
    );
    expect(payload.target.jobDescription).toBe(sample.job);
    expect(result.content.summary).toBe(sample.summary);
    expect(result.content.projects[0].description).toBe(sample.project);
    expect(result.content.skillIds).toEqual(
      planTailoring(evidenceProfile, sample.job).skillIds,
    );
    expect(result.content.headline).toEqual(
      planTailoring(evidenceProfile, sample.job).headline,
    );
    const journal = contentToJournal(evidenceProfile, result.content);
    expect(journal.employment[0]).toMatchObject({
      title: evidenceProfile.experience[0].title,
      company: evidenceProfile.experience[0].employer,
      dates: evidenceProfile.experience[0].dates,
    });
    expect(journal.headline).toBe(result.content.headline!.text);
    expect(
      journal.employment.map((e: any) => [e.title, e.company, e.dates]),
    ).toEqual(
      evidenceProfile.experience.map((e) => [e.title, e.employer, e.dates]),
    );
    expect(journal.email).toBe(evidenceProfile.personal.email);
    expect(journal.education[0].degree).toBe(
      evidenceProfile.education[0].degree,
    );
    expect(JSON.stringify(result.content)).not.toMatch(
      /WordPress|\bSEO\b|Product Manager/,
    );
    const db = new DreamJobDB("engine-" + crypto.randomUUID());
    try {
      await db.approveProfile(evidenceProfile, true);
      const content = result.content;
      const saved = await db.saveResume({
        formatVersion: 2,
        id: crypto.randomUUID(),
        title: sample.role,
        folder: "",
        profile: evidenceProfile,
        content,
        warnings: result.warnings,
        review: {
          reviewedAt: new Date().toISOString(),
          digest: await contentDigest(evidenceProfile, content),
        },
        jobDescription: sample.job,
        twoPages: false,
        createdAt: new Date().toISOString(),
      });
      const backup = await db.exportBackup();
      const other = new DreamJobDB("import-" + crypto.randomUUID());
      try {
        await other.importBackup(backup);
        expect(await other.resumes.get(saved.id)).toEqual(saved);
      } finally {
        await other.delete();
      }
      expect((await db.professionalProfiles.toArray())[0].experience).toEqual(
        evidenceProfile.experience,
      );
    } finally {
      await db.delete();
    }
  },
);
it.each([
  "WordPress development",
  "SEO specialist",
  "Product Manager with extensive experience",
])(
  "restores unsupported %s claims with a warning instead of manufacturing qualifications",
  async (claim) => {
    const raw = draftFor(engineCases[0]);
    raw.summary = claim;
    const { client } = setup(raw);
    const result = await client.tailorResume({
      profile: evidenceProfile,
      jobDescription: engineCases[0].job,
      strategy: "evidence",
    });
    expect(result.content.summary).not.toBe(claim);
    expect(result.content.summary).not.toBe(evidenceProfile.summary);
    expect(result.warnings.some((w) => w.includes("UNSUPPORTED_"))).toBe(true);
  },
);
it("rejects cross-project, unknown and non-retrieved references without repairing evidence or retrying", async () => {
  for (const bad of ["unknown", "frontend", "lx1"]) {
    const raw = draftFor(engineCases[0]);
    raw.projects[0].sourceFactIds = [bad];
    const { client, fetcher } = setup(raw);
    await expect(
      client.tailorResume({
        profile: evidenceProfile,
        jobDescription: engineCases[0].job,
        strategy: "evidence",
      }),
    ).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  }
});
it("derives stable lossless project fragments without changing approved records", () => {
  const before = structuredClone(evidenceProfile);
  const catalog = evidenceCatalog(evidenceProfile);
  const details = catalog.filter((f) => f.parentId === "mixed");
  expect(details).toHaveLength(3);
  expect(details.map((f) => f.text).join(" ")).toBe(
    evidenceProfile.projects[0].description,
  );
  expect(
    evidenceCatalog({
      ...evidenceProfile,
      projects: [...evidenceProfile.projects].reverse(),
    }).filter((f) => f.parentId === "mixed"),
  ).toEqual(details);
  expect(evidenceProfile).toEqual(before);
});
it("rejects invalid summary evidence and retains one achievement per bullet", () => {
  const raw = draftFor(engineCases[0]);
  const content = {
    ...raw,
    headline: planTailoring(evidenceProfile, engineCases[0].job).headline,
    skillIds: ["skill0"],
  };
  expect(() =>
    validateContent(
      { ...content, summarySourceFactIds: ["private-contact"] },
      evidenceProfile,
    ),
  ).toThrow();
  content.experience[0].bullets[0].sourceAchievementIds = ["pm1", "pm2"];
  expect(() => guardContent(content, evidenceProfile)).toThrow();
});
it("retains role context in a single refinement call without promoting draft text into approved evidence", async () => {
  const raw = draftFor(engineCases[0]);
  const initial = setup(raw);
  const generated = await initial.client.tailorResume({
    profile: evidenceProfile,
    jobDescription: engineCases[0].job,
    strategy: "evidence",
  });
  generated.content.summary = "User-authored wording for this draft.";
  const refined = setup(raw);
  await refined.client.refineContent({
    profile: evidenceProfile,
    content: generated.content,
    jobDescription: engineCases[0].job,
    instructions: "Keep supported manual edits while shortening the summary.",
    strategy: "evidence",
  });
  expect(refined.fetcher).toHaveBeenCalledTimes(1);
  const payload = JSON.parse(
    JSON.parse(refined.fetcher.mock.calls[0][1].body).messages[1].content,
  );
  expect(payload.target.jobDescription).toBe(engineCases[0].job);
  expect(payload.currentDraft.summary).toBe(generated.content.summary);
  expect(JSON.stringify(payload.approvedEvidence)).not.toContain(
    "User-authored",
  );
});
it("invalid current references fail before a paid refinement call", async () => {
  const raw = draftFor(engineCases[0]);
  const current = {
    ...raw,
    skillIds: ["skill0"],
    summarySourceFactIds: ["unapproved"],
  };
  const { client, fetcher } = setup(raw);
  await expect(
    client.refineContent({
      profile: evidenceProfile,
      content: current,
      instructions: "Refine this draft",
      strategy: "evidence",
    }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("a lower-priority unapproved requirement cannot manufacture a headline credential or displace supported core focus", () => {
  const plan = planTailoring(evidenceProfile, engineCases[0].job);
  expect(plan.headline.text).toContain("Requirements Analysis");
  expect(plan.headline.text).toMatch(/User Feedback|Project Delivery/);
  expect(plan.headline.text).not.toMatch(/WordPress|SEO|Product Manager/);
  expect(
    plan.headline.sourceFactIds.every((id) =>
      plan.evidence.some((e) => e.id === id),
    ),
  ).toBe(true);
});
it("snapshot-local project detail references remain unambiguous even with reserved-prefix IDs and non-ASCII IDs", () => {
  const p = structuredClone(evidenceProfile);
  p.skills[0].id = "@detail/custom";
  p.projects[0].id = "界".repeat(100);
  const facts = evidenceCatalog(p).filter(
    (e) => e.parentId === p.projects[0].id,
  );
  expect(new Set(evidenceCatalog(p).map((e) => e.id)).size).toBe(
    evidenceCatalog(p).length,
  );
  const content = {
    summary: facts[0].text,
    summarySourceFactIds: [facts[0].id],
    skillIds: [p.skills[0].id],
    experience: [],
    projects: [
      {
        projectId: p.projects[0].id,
        sourceFactIds: [facts[0].id],
        description: facts[0].text,
      },
    ],
  };
  expect(() => validateContent(content, p)).not.toThrow();
});
it("reports unsupported named requirements as gaps rather than candidate qualifications", () => {
  const plan = planTailoring(evidenceProfile, engineCases[0].job);
  expect(
    plan.warnings.some((w) => w.startsWith("WordPress is requested")),
  ).toBe(true);
  expect(plan.warnings.some((w) => w.startsWith("SEO is requested"))).toBe(
    true,
  );
});
it("the new strategy remains behind authentication and the existing quota before any paid call", async () => {
  for (const authenticated of [false, true]) {
    const fetcher = vi.fn();
    const w = createWorker({
      ...(authenticated ? { authenticate: identity } : {}),
      fetcher,
      log: () => {},
    });
    const r = await w.fetch(
      new Request("https://api.test/api/generate-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formatVersion: 2,
          strategy: "evidence",
          profile: evidenceProfile,
          jobDescription: engineCases[0].job,
        }),
      }),
      { ...env, AI_RATE_LIMITER: { limit: async () => ({ success: false }) } },
    );
    expect(r.status).toBe(authenticated ? 429 : 401);
    expect(fetcher).not.toHaveBeenCalled();
  }
});
it("ordinary mentions of requirements do not discard responsibilities earlier in the job text", () => {
  const plan = planTailoring(
    evidenceProfile,
    "Build React and TypeScript interfaces with responsive HTML and CSS, while meeting stakeholder requirements.",
  );
  expect(plan.priorities[0].id).toBe("interfaces");
  expect(
    plan.experience[0].facts.filter((f) => f.id.startsWith("fe")).length,
  ).toBeGreaterThanOrEqual(2);
});
it("sparse unfamiliar jobs still produce a valid bounded capability headline without changing skill facts", () => {
  const p = structuredClone(evidenceProfile);
  p.skills[0].text = "Z".repeat(3000);
  const plan = planTailoring(
    p,
    "An unfamiliar role outside the supported capability vocabulary.",
  );
  expect(plan.headline.text.length).toBeLessThanOrEqual(3000);
  expect(plan.headline.sourceFactIds.length).toBeGreaterThan(0);
  expect(p.skills[0].text).toBe("Z".repeat(3000));
});
