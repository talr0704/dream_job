import { z } from "zod";
import { integerSchema } from "./validation.js";
// Zod 3 accepted both minute-precision and second/fractional UTC timestamps.
export const timestampSchema = z.union([
  z.iso.datetime(),
  z.iso.datetime({ precision: -1 }),
]);
const text = z.string().trim().max(3000);
const nonempty = text.min(1);
const id = z.string().min(1).max(120);
export const urlSchema = z
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
        !/^(localhost|127\.|\[::1\])/.test(u.hostname)
      );
    } catch {
      return false;
    }
  }, "Use a public HTTPS URL without credentials");
// Extraction-only policy: retain accepted strings byte-for-byte; never repair them.
// Explicit template markers and reserved documentation domains are not evidence.
const extractedUrlSchema = urlSchema.refine((value) => {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (
      /^(?:.*\.)?(?:example\.(?:com|org|net)|invalid|localhost)$/.test(host) ||
      host.endsWith(".invalid")
    )
      return false;
    const decoded = decodeURIComponent(value);
    return (
      !/(?:<|\[|\{)(?:name|username|your-name|your-domain|your-url|url|website|portfolio|placeholder)(?:>|\]|\})/i.test(
        decoded,
      ) &&
      !/(?:^|[/.])(?:placeholder|your-domain|your-website|your-portfolio|your-url)(?:[/.?#]|$)/i.test(
        decoded,
      )
    );
  } catch {
    return false;
  }
}, "Use an exact supplied URL, not a placeholder");
// Extraction accepts only an actual, supplied personal LinkedIn profile URL.
// This validator never repairs a URL or derives one from a person's name.
export const extractedLinkedinSchema = extractedUrlSchema.refine((value) => {
  try {
    const u = new URL(value);
    if (
      !(
        u.hostname === "linkedin.com" || u.hostname.endsWith(".linkedin.com")
      ) ||
      u.port
    )
      return false;
    const match = /^\/(?:in|pub)\/([^/]+)(?:\/.*)?$/.exec(u.pathname);
    if (!match) return false;
    const slug = decodeURIComponent(match[1]).toLowerCase();
    return !new Set([
      "your-name",
      "yourname",
      "your-profile",
      "your-linkedin",
      "your-linkedin-profile",
      "username",
      "placeholder",
      "example",
      "profile-url",
      "<name>",
      "[name]",
    ]).has(slug);
  } catch {
    return false;
  }
}, "Use a supplied LinkedIn personal profile URL");
export const extractedLinkedinField = extractedLinkedinSchema
  .nullable()
  .describe(
    "Optional LinkedIn personal profile URL. Copy an exact supplied HTTPS linkedin.com/in/ or linkedin.com/pub/ URL. Use null when absent, invalid, a placeholder, or not LinkedIn. Never infer, repair, or fabricate a URL.",
  );
export const extractedOptionalUrlFields = {
  linkedin: extractedLinkedinField,
  portfolio: extractedUrlSchema
    .nullable()
    .describe(
      "Optional portfolio URL. Copy an exact supplied public HTTPS URL without credentials. Use null when missing, malformed, a placeholder, or unsupported. Never infer, repair, or fabricate a URL.",
    ),
  github: extractedUrlSchema
    .nullable()
    .describe(
      "Optional GitHub URL. Copy an exact supplied public HTTPS URL without credentials. Use null when missing, malformed, a placeholder, or unsupported. Never infer, repair, or fabricate a URL.",
    ),
  certification: extractedUrlSchema
    .nullable()
    .describe(
      "Optional certification URL. Copy an exact supplied public HTTPS URL without credentials. Use null when missing, malformed, a placeholder, or unsupported. Preserve the certification record and facts. Never infer, repair, or fabricate a URL.",
    ),
} as const;
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
const professionalProfileObjectSchema = z
  .object({
    id,
    version: integerSchema.positive(),
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
    updatedAt: timestampSchema,
  })
  .strict();
export type ProfessionalProfile = z.infer<
  typeof professionalProfileObjectSchema
>;
export const professionalProfileSchema =
  professionalProfileObjectSchema.superRefine(checkProfile);
function checkProfile(p: ProfessionalProfile, ctx: z.RefinementCtx) {
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
}
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
// Extraction preserves supplied link labels verbatim. Canonical storage
// retains its existing trimming behavior. Blank/overlong labels still fail.
const extractedLink = link.extend({
  label: z
    .string()
    .min(1)
    .max(3000)
    .refine((v) => v.trim().length > 0, "Expected a nonempty label"),
  url: extractedUrlSchema,
});
export const extractedLinkCandidateSchema = extractedLink.extend({
  url: extractedUrlSchema
    .nullable()
    .describe(
      "Optional link candidate. Copy an exact supplied public HTTPS URL, or null when missing, malformed, a placeholder or unsupported. Prefer an empty links array when no valid URLs are supplied. Never infer, repair or fabricate URLs. Keep professional facts outside link labels.",
    ),
});
const extractedProject = project.extend({
  links: z.array(extractedLink).max(10),
});
export const extractResponseSchema = z
  .object({
    profile: professionalProfileSchema.safeExtend({
      verified: z.literal(false),
      projects: z.array(extractedProject).max(10),
      links: z.array(extractedLink).max(10),
      personal: professionalProfileSchema.shape.personal.extend({
        linkedin: extractedOptionalUrlFields.linkedin,
        portfolio: extractedOptionalUrlFields.portfolio,
        github: extractedOptionalUrlFields.github,
      }),
      certifications: z
        .array(
          certification.extend({
            url: extractedOptionalUrlFields.certification,
          }),
        )
        .max(30),
    }),
    warnings: z.array(nonempty).max(50),
  })
  .strict();
// Provider candidates may have an unusable optional link URL represented as
// null. Validate every record and global fact ID before dropping such links.
// The client/final response contract above still requires every retained URL.
export const extractionCandidateSchema = extractResponseSchema.extend({
  profile: z
    .object({
      ...extractResponseSchema.shape.profile.shape,
      links: z.array(extractedLinkCandidateSchema).max(10),
      projects: z
        .array(
          project.extend({
            links: z.array(extractedLinkCandidateSchema).max(10),
          }),
        )
        .max(10),
    })
    .strict()
    .superRefine((p, ctx) => {
      // checkProfile walks fact IDs and required approval fields; it never parses
      // URL values. Candidate null URLs are removed before final URL validation.
      checkProfile(p as ProfessionalProfile, ctx);
    }),
});
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
    analysis: analysisSchema.optional(),
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
