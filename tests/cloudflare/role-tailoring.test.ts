import { guardContent, rewriteIssue } from "../../shared/tailoring";
import { contentToJournal } from "../../src/lib/content-adapter";
import { DreamJobDB } from "../../src/lib/storage";
import { tailoringProfile, roleTailoringCases } from "./role-tailoring.fixture";
import { it, expect, vi } from "vitest";
import { checkRewrite, baseContent } from "../../shared/tailoring";
import { createWorker } from "../../worker/index";
import { DreamJobClient } from "../../src/lib/api";
import { env, identity, mockAI, profile } from "./fixtures";
it("retains a factual percentage rewrite instead of restoring original wording", () => {
  expect(
    checkRewrite(
      "Reduced load time by 25 percent for the training portal.",
      "Built the training portal, reducing load time by 25%.",
    ),
  ).toBe(true);
});
it("passes the original job context to the single refinement call", async () => {
  const fetcher = vi.fn().mockResolvedValueOnce(mockAI(baseContent(profile)));
  const w = createWorker({ authenticate: identity, fetcher, log: () => {} });
  const client = new DreamJobClient("https://api.test", async (url, init) =>
    w.fetch(new Request(url, init), env),
  );
  const jobDescription =
    "Technical Trainer delivering practical software workshops and facilitator materials.";
  await client.refineContent({
    profile,
    content: baseContent(profile),
    instructions: "Make this more concise.",
    jobDescription,
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    JSON.parse(JSON.parse(fetcher.mock.calls[0][1].body).messages[1].content)
      .jobDescription,
  ).toBe(jobDescription);
});

it.each(roleTailoringCases)(
  "preserves substantive $role rewrites, selections and summaries through the one-call pipeline and storage",
  async (sample) => {
    const before = structuredClone(tailoringProfile);
    const fetcher = vi.fn().mockResolvedValueOnce(mockAI(sample.content));
    const w = createWorker({ authenticate: identity, fetcher, log: () => {} });
    const client = new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    );
    const result = await client.tailorResume({
      profile: tailoringProfile,
      jobDescription: sample.jobDescription,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const request = JSON.parse(fetcher.mock.calls[0][1].body);
    const input = JSON.parse(request.messages[1].content);
    expect(input.jobDescription).toBe(sample.jobDescription);
    expect(input.approved.experience[0].achievements).toEqual(
      tailoringProfile.experience[0].achievements.map(({ id, text }) => ({
        id,
        text,
      })),
    );
    expect(input).not.toHaveProperty("analysis");
    expect(request.messages[0].content).toContain(
      "actual responsibilities, outcomes and priorities",
    );
    expect(request.messages[0].content).toContain(
      "rather than swapping synonyms",
    );
    expect(
      request.response_format.json_schema.schema.properties.experience.items
        .properties.bullets.items.properties.text.description,
    ).toContain("role-specific rewrite");
    expect(result.content).toEqual(sample.content);
    expect(result.warnings).toEqual([]);
    expect(
      result.content.experience[0].bullets[0].sourceAchievementIds,
    ).toEqual([sample.primaryAchievement]);
    expect(result.content.summary).toContain(sample.emphasis);
    expect(JSON.stringify(result.content)).not.toMatch(
      /GraphQL|Articulate|SCORM|AWS|Certified/i,
    );
    for (const bullet of result.content.experience[0].bullets)
      expect(bullet.text).not.toBe(
        tailoringProfile.experience[0].achievements.find(
          (a) => a.id === bullet.sourceAchievementIds[0],
        )!.text,
      );
    const journal = contentToJournal(tailoringProfile, result.content);
    expect(journal.summary).toBe(sample.content.summary);
    expect(journal.employment[0].bullets).toEqual(
      sample.content.experience[0].bullets.map((b) => b.text),
    );
    expect(journal.employment[0]).toMatchObject({
      title: tailoringProfile.experience[0].title,
      company: tailoringProfile.experience[0].employer,
      dates: tailoringProfile.experience[0].dates,
    });
    const db = new DreamJobDB("roles-" + crypto.randomUUID());
    try {
      const saved = await db.saveResume({
        formatVersion: 2,
        id: crypto.randomUUID(),
        title: sample.role,
        folder: "",
        profile: tailoringProfile,
        content: result.content,
        jobDescription: sample.jobDescription,
        warnings: result.warnings,
        review: null,
        twoPages: false,
        createdAt: new Date().toISOString(),
      });
      expect(await db.resumes.get(saved.id)).toEqual(saved);
    } finally {
      await db.delete();
    }
    expect(tailoringProfile).toEqual(before);
  },
);
it("the comparative fixture changes emphasis and wording, including the same source achievement and project", () => {
  expect(new Set(roleTailoringCases.map((c) => c.content.summary)).size).toBe(
    3,
  );
  expect(
    new Set(roleTailoringCases.map((c) => c.content.projects[0].description))
      .size,
  ).toBe(3);
  expect(
    new Set(roleTailoringCases.map((c) => c.primaryAchievement)).size,
  ).toBe(3);
  const frontend = roleTailoringCases[0].content.experience[0].bullets[0];
  const learning = roleTailoringCases[1].content.experience[0].bullets[1];
  expect(frontend.sourceAchievementIds).toEqual(learning.sourceAchievementIds);
  expect(frontend.text).not.toBe(learning.text);
});
it.each([
  ["Reduced load time by 25 per cent.", "Reduced load time by 25%.", undefined],
  ["Reduced load time by 25%.", "Reduced load time by 25 percent.", undefined],
  [
    "Reduced load time by 25 percentage points.",
    "Reduced load time by 25%.",
    "UNSUPPORTED_QUANTITY",
  ],
  [
    "Reduced load time by 30 percent.",
    "Reduced load time by 25%.",
    "UNSUPPORTED_QUANTITY",
  ],
  [
    "Delivered training for 60 years.",
    "Delivered training for 60 employees.",
    "UNSUPPORTED_QUANTITY",
  ],
  [
    "Led workshops for 60 employees.",
    "Delivered workshops for 60 employees.",
    "UNSUPPORTED_QUALIFICATION_OR_RESPONSIBILITY",
  ],
  [
    "AWS Certified Technical Trainer.",
    "Delivered software workshops.",
    "UNSUPPORTED_QUALIFICATION_OR_RESPONSIBILITY",
  ],
  [
    "More at https://new.test/.",
    "Delivered software workshops.",
    "UNSUPPORTED_LINK",
  ],
  [
    "<b>Delivered software workshops.</b>",
    "Delivered software workshops.",
    "UNSAFE_MARKUP",
  ],
])("keeps the focused guard strict for %s", (text, source, reason) => {
  expect(rewriteIssue(text!, source!)).toBe(reason);
});
it("reveals why unsupported model claims were replaced without discarding valid role rewrites", async () => {
  const raw = structuredClone(roleTailoringCases[2].content);
  raw.experience[0].bullets[0].text =
    "AWS Certified Technical Trainer delivering workshops for 60 employees.";
  const checked = guardContent(raw, tailoringProfile);
  expect(checked.content.experience[0].bullets[0].text).toBe(
    tailoringProfile.experience[0].achievements[2].text,
  );
  expect(checked.content.experience[0].bullets[1]).toEqual(
    raw.experience[0].bullets[1],
  );
  expect(checked.content.summary).toBe(raw.summary);
  expect(checked.warnings).toHaveLength(1);
  expect(checked.warnings[0]).toContain("Experience 1 bullet 1");
  expect(checked.warnings[0]).toContain(
    "UNSUPPORTED_QUALIFICATION_OR_RESPONSIBILITY",
  );
  expect(checked.warnings[0]).not.toMatch(/AWS|60|Learning Studio/);
  const fetcher = vi.fn().mockResolvedValueOnce(mockAI(raw));
  const w = createWorker({ authenticate: identity, fetcher, log: () => {} });
  const client = new DreamJobClient("https://api.test", async (url, init) =>
    w.fetch(new Request(url, init), env),
  );
  const result = await client.tailorResume({
    profile: tailoringProfile,
    jobDescription: roleTailoringCases[2].jobDescription,
  });
  expect(result.content).toEqual(checked.content);
  expect(result.warnings).toEqual(checked.warnings);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("job-only skills cannot become approved skill selections", async () => {
  const raw = structuredClone(roleTailoringCases[0].content);
  raw.skillIds.push("s-graphql");
  const fetcher = vi.fn().mockResolvedValueOnce(mockAI(raw));
  const w = createWorker({ authenticate: identity, fetcher, log: () => {} });
  const client = new DreamJobClient("https://api.test", async (url, init) =>
    w.fetch(new Request(url, init), env),
  );
  await expect(
    client.tailorResume({
      profile: tailoringProfile,
      jobDescription: roleTailoringCases[0].jobDescription,
    }),
  ).rejects.toMatchObject({ code: "INVALID_AI_RESPONSE" });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
