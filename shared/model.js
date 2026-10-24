import { z } from "zod";
import { integerSchema } from "./validation.js";
export const safeURL = z
  .string()
  .max(2000)
  .url()
  .refine((v) => {
    try {
      const u = new URL(v);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !/example\.(com|org)|placeholder/i.test(u.hostname)
      );
    } catch {
      return false;
    }
  }, "Use a real HTTPS link without credentials");
const text = z.string().trim().min(1).max(3000);
const link = z.object({ label: text, url: safeURL }).strict();
export const profileObjectSchema = z
  .object({
    confirmed: z.boolean(),
    location: z.string().max(3000).optional(),
    certifications: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string().max(3000),
            issuer: z.string().max(3000),
            dates: z.string().max(3000),
            url: safeURL.nullable(),
            provenance: z.unknown().nullable().optional(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    languages: z
      .array(
        z
          .object({
            id: z.string(),
            name: z.string().max(3000),
            proficiency: z.string().max(3000),
            provenance: z.unknown().nullable().optional(),
          })
          .strict(),
      )
      .max(30)
      .optional(),
    name: text,
    headline: text,
    phone: z.string().max(80),
    email: z.union([z.string().email(), z.literal("")]),
    links: z.array(link).max(10),
    summary: text,
    skills: z.array(text).min(1).max(100),
    employment: z
      .array(
        z
          .object({
            id: text,
            title: text,
            company: text,
            dates: text,
            bullets: z.array(text).max(20),
          })
          .strict(),
      )
      .max(10),
    projects: z
      .array(
        z
          .object({
            id: text,
            name: text,
            description: text,
            links: z.array(link).max(10),
          })
          .strict(),
      )
      .max(10),
    education: z
      .array(
        z
          .object({ id: text, degree: text, school: text, dates: text })
          .strict(),
      )
      .max(10),
    achievements: z.array(text).max(30),
  })
  .strict();
export const profileSchema = profileObjectSchema.superRefine((p, c) => {
  for (const key of ["employment", "projects", "education"])
    if (new Set(p[key].map((x) => x.id)).size !== p[key].length)
      c.addIssue({ code: "custom", message: `Duplicate ${key} IDs` });
});
const strings = z.array(text).max(30);
export const resultSchema = z
  .object({
    jobTitle: text,
    requirements: z
      .array(
        z
          .object({
            requirement: text,
            mandatory: z.boolean(),
            status: z.enum(["met", "partial", "missing"]),
            evidence: z.string().max(3000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    relevantSkills: strings,
    experienceAlignment: text,
    strengths: strings,
    gaps: strings,
    recommendations: strings,
    resume: z
      .object({
        headline: text,
        summary: text,
        skills: strings,
        employment: z
          .array(
            z
              .object({
                id: text,
                bullets: z
                  .array(
                    z
                      .object({ sourceIndex: integerSchema.min(0), text })
                      .strict(),
                  )
                  .max(20),
              })
              .strict(),
          )
          .max(10),
        projects: z
          .array(z.object({ id: text, description: text }).strict())
          .max(10),
      })
      .strict(),
  })
  .strict();
export function scoreRequirements(requirements) {
  const total = requirements.reduce((s, r) => s + (r.mandatory ? 3 : 1), 0);
  return total
    ? Math.round(
        (100 *
          requirements.reduce(
            (s, r) =>
              s +
              (r.mandatory ? 3 : 1) *
                { met: 1, partial: 0.5, missing: 0 }[r.status],
            0,
          )) /
          total,
      )
    : 0;
}
export function validateResult(raw, profile) {
  const r = resultSchema.parse(raw);
  if (
    r.resume.skills.some((s) => !profile.skills.includes(s)) ||
    r.relevantSkills.some((s) => !profile.skills.includes(s))
  )
    throw Error("Unverified skill");
  if (
    new Set(r.resume.employment.map((x) => x.id)).size !==
      profile.employment.length ||
    r.resume.employment.length !== profile.employment.length
  )
    throw Error("All employment records must be retained");
  if (
    new Set(r.resume.projects.map((x) => x.id)).size !==
      profile.projects.length ||
    r.resume.projects.length !== profile.projects.length
  )
    throw Error("All projects must be retained");
  for (const job of r.resume.employment) {
    const source = profile.employment.find((j) => j.id === job.id);
    if (
      !source ||
      job.bullets.length !== source.bullets.length ||
      new Set(job.bullets.map((b) => b.sourceIndex)).size !==
        source.bullets.length ||
      job.bullets.some((b) => !source.bullets[b.sourceIndex])
    )
      throw Error("Invalid employment evidence");
  }
  for (const p of r.resume.projects)
    if (!profile.projects.some((s) => s.id === p.id))
      throw Error("Invalid project evidence");
  const facts = JSON.stringify(profile);
  for (const n of JSON.stringify(r.resume).match(/\b\d+(?:[.,]\d+)?%?\b/g) ||
    [])
    if (!facts.includes(n)) throw Error("Unverified numerical claim");
  return { ...r, score: scoreRequirements(r.requirements) };
}
export function resumeProfile(profile, result) {
  if (!result) return profile;
  const r = result.resume;
  return {
    ...profile,
    headline: r.headline,
    summary: r.summary,
    skills: r.skills,
    employment: profile.employment.map((j) => ({
      ...j,
      bullets: r.employment
        .find((e) => e.id === j.id)
        .bullets.map((b) => b.text),
    })),
    projects: profile.projects.map((p) => ({
      ...p,
      description: r.projects.find((e) => e.id === p.id).description,
    })),
  };
}
export function demoResult(p) {
  return validateResult(
    {
      jobTitle: "Local preview — no AI analysis",
      requirements: [
        {
          requirement: "AI analysis requires a configured backend",
          mandatory: true,
          status: "missing",
          evidence: "Demo mode does not assess job fit.",
        },
      ],
      relevantSkills: p.skills.slice(0, 5),
      experienceAlignment: "Unassessed in demo mode.",
      strengths: [
        "Your confirmed profile is available for editing and export.",
      ],
      gaps: ["Connect the secure backend to analyze this job."],
      recommendations: [
        "Review all profile facts and supply your original project URLs.",
      ],
      resume: {
        headline: p.headline,
        summary: p.summary,
        skills: p.skills,
        employment: p.employment.map((j) => ({
          id: j.id,
          bullets: j.bullets.map((text, sourceIndex) => ({
            sourceIndex,
            text,
          })),
        })),
        projects: p.projects.map(({ id, description }) => ({
          id,
          description,
        })),
      },
    },
    p,
  );
}
