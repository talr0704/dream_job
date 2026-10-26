import type { ProfessionalProfile, JobAnalysis } from "../../shared/contracts";
import { baseResume } from "../../src/lib/adapter";
export const profile: ProfessionalProfile = {
  id: "profile-1",
  version: 1,
  verified: true,
  personal: {
    fullName: "Alex Example",
    email: "alex@local.test",
    phone: "",
    location: "",
    linkedin: null,
    portfolio: null,
    github: null,
  },
  headline: "Software developer",
  summary: "Builds accessible applications.",
  experience: [
    {
      id: "exp-1",
      title: "Developer",
      employer: "Acme",
      dates: "2021–2024",
      achievements: [
        {
          id: "ach-1",
          text: "Built 3 accessible applications.",
          provenance: null,
        },
      ],
      provenance: null,
    },
  ],
  education: [
    {
      id: "edu-1",
      degree: "BSc",
      school: "College",
      dates: "2020",
      provenance: null,
    },
  ],
  skills: [{ id: "skill-1", text: "TypeScript", provenance: null }],
  projects: [],
  certifications: [],
  languages: [],
  achievements: [],
  links: [],
  updatedAt: "2026-10-24T00:00:00.000Z",
};
export const analysis: JobAnalysis = {
  jobTitle: "Developer",
  requirements: [
    {
      id: "req-1",
      requirement: "TypeScript",
      mandatory: true,
      category: "technical",
      status: "met",
      evidence: "TypeScript is in the profile.",
      sourceFactIds: ["skill-1"],
    },
  ],
  strengths: ["TypeScript"],
  gaps: [],
  recommendations: ["Emphasize accessible applications."],
  experienceAlignment: "Developer at Acme.",
  score: 100,
};
export const resume = baseResume(profile);
export const env = {
  OPENAI_API_KEY: "mock-only",
  OPENAI_MODEL: "mock-model",
  ALLOWED_ORIGIN: "https://frontend.test",
  ACCESS_AUD: "test-audience",
  ACCESS_TEAM_DOMAIN: "test-team.cloudflareaccess.com",
  AI_RATE_LIMITER: { limit: async () => ({ success: true }) },
};
export const identity = async () => ({
  sub: "user-1",
  email: "member@local.test",
});
export function mockAI(output: unknown) {
  return new Response(
    JSON.stringify({
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(output) } },
      ],
    }),
    { headers: { "Content-Type": "application/json" } },
  );
}

// Synthetic reviewer verdict completion for legacy API/enforcement regressions.
// Realistic disagreement/repair fixtures specify independent reviews explicitly.
export function auditWithStatuses(
  draft: any,
  verdict: any = { supported: true, violations: [] },
) {
  return {
    statusReviews: draft.requirements.map((r: any, index: number) => ({
      index,
      status: r.status,
      basis:
        r.status === "met"
          ? "direct"
          : r.status === "partial"
            ? "subset"
            : "none",
      reason:
        r.status === "met"
          ? "direct_evidence"
          : r.status === "partial"
            ? "incomplete_coverage"
            : "no_supporting_evidence",
      sourceFactIds: [...r.sourceFactIds],
    })),
    ...verdict,
  };
}
