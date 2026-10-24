import { describe, it, expect } from "vitest";
import {
  professionalProfileSchema,
  extractResponseSchema,
  validateResume,
  validateAnalysis,
  scoreRequirements,
} from "../../shared/contracts";
import { profile, resume, analysis } from "./fixtures";
import { resumeToJournal, fromJournal, toJournal } from "../../src/lib/adapter";
import { resumeDocument } from "../../shared/render.js";
describe("profile and grounded resume contracts", () => {
  it("allows incomplete unverified drafts, requires approval fields, unique fact IDs and safe URLs", () => {
    expect(
      professionalProfileSchema.parse({
        ...profile,
        verified: false,
        personal: { ...profile.personal, fullName: "" },
      }).verified,
    ).toBe(false);
    expect(() =>
      professionalProfileSchema.parse({
        ...profile,
        personal: { ...profile.personal, fullName: "" },
      }),
    ).toThrow();
    expect(() =>
      professionalProfileSchema.parse({
        ...profile,
        skills: [...profile.skills, ...profile.skills],
      }),
    ).toThrow();
    expect(() =>
      professionalProfileSchema.parse({
        ...profile,
        links: [{ id: "link-1", label: "unsafe", url: "javascript:alert(1)" }],
      }),
    ).toThrow();
    expect(() =>
      extractResponseSchema.parse({ profile, warnings: [] }),
    ).toThrow();
  });
  it("calculates weighted scores, distinguishes missing evidence and rejects ungrounded matches", () => {
    expect(
      scoreRequirements([
        ...analysis.requirements,
        {
          ...analysis.requirements[0],
          id: "r2",
          mandatory: false,
          status: "partial",
        },
      ]),
    ).toBe(88);
    expect(
      validateAnalysis((({ score, ...a }) => a)(analysis), profile).score,
    ).toBe(100);
    expect(() =>
      validateAnalysis({ ...analysis, score: undefined }, profile),
    ).toThrow();
    expect(() =>
      validateAnalysis(
        {
          ...(({ score, ...a }) => a)(analysis),
          requirements: [{ ...analysis.requirements[0], sourceFactIds: [] }],
        },
        profile,
      ),
    ).toThrow();
  });
  it("rejects foreign IDs, new metrics, record metadata and cross-record bullet citations", () => {
    expect(validateResume(resume, profile)).toEqual(resume);
    expect(() =>
      validateResume({ ...resume, skillIds: ["made-up"] }, profile),
    ).toThrow();
    expect(() =>
      validateResume(
        {
          ...resume,
          experience: [
            {
              sourceId: "exp-1",
              achievements: [
                { text: "Built 30 applications.", sourceFactIds: ["ach-1"] },
              ],
            },
          ],
        },
        profile,
      ),
    ).toThrow(/numerical/);
    expect(() =>
      validateResume(
        {
          ...resume,
          experience: [
            {
              sourceId: "exp-1",
              achievements: [{ text: "Developer", sourceFactIds: ["exp-1"] }],
            },
          ],
        },
        profile,
      ),
    ).toThrow();
    expect(() =>
      validateResume({ ...resume, employer: "Invented" }, profile),
    ).toThrow();
    expect(() =>
      validateResume(
        {
          ...resume,
          summary: { text: "<script>bad</script>", sourceFactIds: ["summary"] },
        },
        profile,
      ),
    ).toThrow();
  });
  it("maps source metadata into approved renderer, escapes text, and preserves the master", () => {
    const before = structuredClone(profile);
    const j = resumeToJournal(profile, {
      ...resume,
      headline: {
        text: "Accessible application developer",
        sourceFactIds: ["headline"],
      },
    });
    expect(j.employment[0].company).toBe("Acme");
    expect(j.education[0].degree).toBe("BSc");
    expect(resumeDocument({ ...j, name: "<script>bad</script>" })).toContain(
      "&lt;script&gt;",
    );
    expect(profile).toEqual(before);
    expect(
      fromJournal(toJournal(profile), profile).experience[0].achievements[0].id,
    ).toBe("ach-1");
  });
});
import { applyManualText } from "../../src/lib/adapter";
it("uses current manual resume text for refinement while keeping source references", () => {
  const j = resumeToJournal(profile, resume);
  j.summary = "Develops accessible software.";
  const current = applyManualText(profile, resume, j);
  expect(current.summary.text).toBe(j.summary);
  expect(current.summary.sourceFactIds).toEqual(["summary"]);
  expect(profile.summary).toBe("Builds accessible applications.");
  expect(() =>
    applyManualText(profile, resume, { ...j, skills: ["Invented skill"] }),
  ).toThrow();
});
it("keeps achievement IDs stable when another achievement is deleted or inserted", () => {
  const p = {
    ...profile,
    achievements: [
      { id: "top-a", text: "First achievement.", provenance: null },
      { id: "top-b", text: "Second achievement.", provenance: null },
    ],
  };
  const j = toJournal(p);
  j.achievements = ["New achievement.", "Second achievement."];
  const updated = fromJournal(j, p);
  expect(updated.achievements[1].id).toBe("top-b");
  expect(updated.achievements[0].id).toBe("top-a");
  const deleted = fromJournal(
    { ...j, achievements: ["Second achievement."] },
    p,
  );
  expect(deleted.achievements[0].id).toBe("top-b");
});
