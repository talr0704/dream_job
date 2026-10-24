import { z } from "zod";
const text = z.string().trim().max(3000);
const nonempty = text.min(1);
const id = z.string().min(1).max(120);
export const urlSchema = z
  .string()
  .max(2000)
  .url()
  .refine((v) => {
    const u = new URL(v);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !/^(localhost|127\.|\[::1\])/.test(u.hostname)
    );
  }, "Use a public HTTPS URL without credentials");
const provenance = z
  .object({ source: z.enum(["manual", "document", "legacy"]), quote: text })
  .strict();
const fact = z
  .object({ id, text: nonempty, provenance: provenance.nullable() })
  .strict();
const link = z.object({ id, label: nonempty, url: urlSchema }).strict();
const experience = z
  .object({
    id,
    title: text,
    employer: text,
    dates: text,
    achievements: z.array(fact).max(20),
    provenance: provenance.nullable(),
  })
  .strict();
const education = z
  .object({
    id,
    degree: text,
    school: text,
    dates: text,
    provenance: provenance.nullable(),
  })
  .strict();
const project = z
  .object({
    id,
    name: nonempty,
    description: text,
    achievements: z.array(fact).max(20),
    links: z.array(link).max(10),
    provenance: provenance.nullable(),
  })
  .strict();
const certification = z
  .object({
    id,
    name: nonempty,
    issuer: text,
    dates: text,
    url: urlSchema.nullable(),
    provenance: provenance.nullable(),
  })
  .strict();
const language = z
  .object({
    id,
    name: nonempty,
    proficiency: text,
    provenance: provenance.nullable(),
  })
  .strict();
export const professionalProfileSchema = z
  .object({
    id,
    version: z.number().int().positive(),
    verified: z.boolean(),
    personal: z
      .object({
        fullName: text,
        email: z.union([z.string().email(), z.literal("")]),
        phone: text,
        location: text,
        linkedin: urlSchema.nullable(),
        portfolio: urlSchema.nullable(),
        github: urlSchema.nullable(),
      })
      .strict(),
    headline: text,
    summary: text,
    experience: z.array(experience).max(10),
    education: z.array(education).max(10),
    skills: z.array(fact).max(100),
    projects: z.array(project).max(10),
    certifications: z.array(certification).max(30),
    languages: z.array(language).max(30),
    achievements: z.array(fact).max(30),
    links: z.array(link).max(10),
    updatedAt: z.string().datetime(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = allFactEntries(p).map(([key]) => key);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({
        code: "custom",
        message:
          "Fact IDs must be unique, including reserved personal/headline/summary IDs",
      });
    if (
      p.verified &&
      (!p.personal.fullName || !p.summary || !p.headline || !p.skills.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Review name, headline, summary and skills before approval",
      });
  });
export type ProfessionalProfile = z.infer<typeof professionalProfileSchema>;
export type Experience = z.infer<typeof experience>;
export type Education = z.infer<typeof education>;
export type Project = z.infer<typeof project>;
export type Skill = z.infer<typeof fact>;
export type Certification = z.infer<typeof certification>;
export type Language = z.infer<typeof language>;
export function allFactEntries(p: ProfessionalProfile): [string, string][] {
  return [
    ["personal", JSON.stringify(p.personal)],
    ["headline", p.headline],
    ["summary", p.summary],
    ...p.skills.map((f) => [f.id, f.text] as [string, string]),
    ...p.achievements.map((f) => [f.id, f.text] as [string, string]),
    ...p.experience.flatMap((e) => [
      [
        e.id,
        JSON.stringify({
          title: e.title,
          employer: e.employer,
          dates: e.dates,
        }),
      ] as [string, string],
      ...e.achievements.map((f) => [f.id, f.text] as [string, string]),
    ]),
    ...p.projects.flatMap((e) => [
      [e.id, JSON.stringify({ name: e.name, description: e.description })] as [
        string,
        string,
      ],
      ...e.achievements.map((f) => [f.id, f.text] as [string, string]),
      ...e.links.map((l) => [l.id, JSON.stringify(l)] as [string, string]),
    ]),
    ...p.education.map((e) => [e.id, JSON.stringify(e)] as [string, string]),
    ...p.certifications.map(
      (e) => [e.id, JSON.stringify(e)] as [string, string],
    ),
    ...p.languages.map((e) => [e.id, JSON.stringify(e)] as [string, string]),
    ...p.links.map((l) => [l.id, JSON.stringify(l)] as [string, string]),
  ];
}
export const verifiedProfileSchema = professionalProfileSchema.refine(
  (p) => p.verified,
  "Approve the professional profile first",
);
export const claimSchema = z
  .object({ text: nonempty, sourceFactIds: z.array(id).min(1).max(30) })
  .strict();
const requirement = z
  .object({
    id,
    requirement: nonempty,
    mandatory: z.boolean(),
    category: z.enum([
      "technical",
      "experience",
      "education",
      "seniority",
      "domain",
      "responsibilities",
    ]),
    status: z.enum(["met", "partial", "missing"]),
    evidence: text,
    sourceFactIds: z.array(id).max(30),
  })
  .strict();
export const analysisDraftSchema = z
  .object({
    jobTitle: text,
    requirements: z.array(requirement).min(1).max(40),
    strengths: z.array(nonempty).max(30),
    gaps: z.array(nonempty).max(30),
    recommendations: z.array(nonempty).max(30),
    experienceAlignment: text,
  })
  .strict();
export const analysisSchema = analysisDraftSchema.extend({
  score: z.number().int().min(0).max(100),
});
export type JobAnalysis = z.infer<typeof analysisSchema>;
export const tailoredResumeSchema = z
  .object({
    headline: claimSchema,
    summary: claimSchema,
    skillIds: z.array(id).max(100),
    experience: z
      .array(
        z
          .object({ sourceId: id, achievements: z.array(claimSchema).max(20) })
          .strict(),
      )
      .max(10),
    projects: z
      .array(
        z
          .object({
            sourceId: id,
            description: claimSchema,
            achievements: z.array(claimSchema).max(20),
          })
          .strict(),
      )
      .max(10),
    educationIds: z.array(id).max(10),
    certificationIds: z.array(id).max(30),
    linkIds: z.array(id).max(10),
  })
  .strict();
export type TailoredResume = z.infer<typeof tailoredResumeSchema>;
const jobDescription = z.string().trim().min(40).max(18000);
export const extractRequestSchema = z
  .object({ text: z.string().trim().min(20).max(60000) })
  .strict();
export const extractResponseSchema = z
  .object({
    profile: professionalProfileSchema.refine((p) => !p.verified),
    warnings: z.array(nonempty).max(50),
  })
  .strict();
export const analyzeRequestSchema = z
  .object({
    profile: verifiedProfileSchema,
    jobDescription,
    companyName: text.optional(),
    jobTitle: text.optional(),
    jobUrl: urlSchema.optional(),
  })
  .strict();
export const generateRequestSchema = z
  .object({
    profile: verifiedProfileSchema,
    jobDescription,
    analysis: analysisSchema,
  })
  .strict();
export const refineRequestSchema = z
  .object({
    profile: verifiedProfileSchema,
    resume: tailoredResumeSchema,
    instructions: z.string().trim().min(3).max(6000),
  })
  .strict();
export const endpoints = {
  "extract-profile": {
    request: extractRequestSchema,
    response: extractResponseSchema,
  },
  "analyze-job": { request: analyzeRequestSchema, response: analysisSchema },
  "generate-resume": {
    request: generateRequestSchema,
    response: tailoredResumeSchema,
  },
  "refine-resume": {
    request: refineRequestSchema,
    response: tailoredResumeSchema,
  },
} as const;
export type Endpoint = keyof typeof endpoints;
export type ApiInput<K extends Endpoint> = z.input<
  (typeof endpoints)[K]["request"]
>;
export type ApiOutput<K extends Endpoint> = z.output<
  (typeof endpoints)[K]["response"]
>;
export function scoreRequirements(rs: JobAnalysis["requirements"]): number {
  const total = rs.reduce((n, r) => n + (r.mandatory ? 3 : 1), 0);
  return total
    ? Math.round(
        (100 *
          rs.reduce(
            (n, r) =>
              n +
              (r.mandatory ? 3 : 1) *
                { met: 1, partial: 0.5, missing: 0 }[r.status],
            0,
          )) /
          total,
      )
    : 0;
}
export function validateAnalysis(
  raw: unknown,
  p: ProfessionalProfile,
): JobAnalysis {
  const a = analysisDraftSchema.parse(raw);
  const facts = new Map(allFactEntries(p));
  if (new Set(a.requirements.map((r) => r.id)).size !== a.requirements.length)
    throw Error("Duplicate requirements");
  for (const r of a.requirements) {
    if (
      (r.status !== "missing" && !r.sourceFactIds.length) ||
      r.sourceFactIds.some((id) => !facts.has(id))
    )
      throw Error("Unsupported requirement evidence");
    if (r.status === "missing" && r.sourceFactIds.length)
      throw Error("Missing evidence must not cite matches");
  }
  return { ...a, score: scoreRequirements(a.requirements) };
}
export function validateResume(
  raw: unknown,
  p: ProfessionalProfile,
): TailoredResume {
  const r = tailoredResumeSchema.parse(raw);
  const facts = new Map(allFactEntries(p));
  const check = (c: z.infer<typeof claimSchema>, allowed?: string[]) => {
    if (
      c.sourceFactIds.some(
        (id) => !facts.has(id) || (allowed && !allowed.includes(id)),
      )
    )
      throw Error("Unsupported source fact");
    const source = c.sourceFactIds.map((id) => facts.get(id)).join(" ");
    const numbers = (s: string): string[] =>
      s.match(/\b\d+(?:[.,]\d+)?%?\b/g) || [];
    if (numbers(c.text).some((n) => !numbers(source).includes(n)))
      throw Error("Unsupported numerical achievement");
    if (/<\/?[a-z][^>]*>/i.test(c.text))
      throw Error("AI must return text, not HTML");
  };
  const subset = (ids: string[], values: { id: string }[]) => {
    if (
      new Set(ids).size !== ids.length ||
      ids.some((id) => !values.some((v) => v.id === id))
    )
      throw Error("Unsupported or duplicate record");
  };
  check(r.headline);
  check(r.summary);
  subset(r.skillIds, p.skills);
  subset(r.educationIds, p.education);
  subset(r.certificationIds, p.certifications);
  subset(r.linkIds, p.links);
  subset(
    r.experience.map((e) => e.sourceId),
    p.experience,
  );
  subset(
    r.projects.map((e) => e.sourceId),
    p.projects,
  );
  for (const e of r.experience) {
    const source = p.experience.find((x) => x.id === e.sourceId)!;
    e.achievements.forEach((c) =>
      check(
        c,
        source.achievements.map((a) => a.id),
      ),
    );
  }
  for (const e of r.projects) {
    const source = p.projects.find((x) => x.id === e.sourceId)!;
    check(e.description, [source.id, ...source.achievements.map((a) => a.id)]);
    e.achievements.forEach((c) =>
      check(
        c,
        source.achievements.map((a) => a.id),
      ),
    );
  }
  return r;
}
