import { z } from "zod";
import { profileSchema, profileObjectSchema, resultSchema } from "./model.js";
export const emptyProfile = {
  confirmed: false,
  location: "",
  certifications: [],
  languages: [],
  name: "",
  headline: "",
  phone: "",
  email: "",
  links: [],
  summary: "",
  skills: [],
  employment: [],
  projects: [],
  education: [],
  achievements: [],
};
const base = profileObjectSchema;
const blank = z.string().max(3000);
// Incomplete facts are valid drafts; generation/export still require the stricter schema.
export const profileDraftObject = profileObjectSchema.extend({
  employment: z
    .array(
      base.shape.employment.element.extend({
        title: blank,
        company: blank,
        dates: blank,
      }),
    )
    .max(10),
  projects: z
    .array(
      base.shape.projects.element.extend({ name: blank, description: blank }),
    )
    .max(10),
  education: z
    .array(
      base.shape.education.element.extend({
        degree: blank,
        school: blank,
        dates: blank,
      }),
    )
    .max(10),
  name: z.string().max(3000),
  headline: z.string().max(3000),
  email: z.union([z.string().email(), z.literal("")]),
  summary: z.string().max(3000),
  skills: z.array(z.string().min(1).max(3000)).max(100),
});
export const profileDraftSchema = profileDraftObject.superRefine((p, c) => {
  for (const key of ["employment", "projects", "education"])
    if (new Set(p[key].map((x) => x.id)).size !== p[key].length)
      c.addIssue({ code: "custom", message: `Duplicate ${key} IDs` });
  if (p.confirmed) {
    const parsed = profileSchema.safeParse(p);
    if (!parsed.success)
      for (const issue of parsed.error.issues) c.addIssue(issue);
  }
});
export const storedAnalysisSchema = resultSchema.extend({
  score: z.number().int().min(0).max(100),
  demo: z.boolean().optional(),
});
export const resumeSnapshotSchema = z
  .object({
    twoPages: z.boolean().default(false),
    title: z.string().trim().min(1).max(120),
    folder: z.string().trim().max(80),
    jobDescription: z.string().max(18000),
    profile: profileSchema.refine(
      (p) => p.confirmed,
      "Confirm the resume facts first",
    ),
    analysis: storedAnalysisSchema.nullable(),
  })
  .strict();
export function profileChanges(before, after) {
  return Object.keys(emptyProfile).filter(
    (k) =>
      k !== "confirmed" &&
      JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
}
