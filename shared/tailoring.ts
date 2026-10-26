import {
  resumeContentSchema,
  verifiedProfileSchema,
  type ResumeContent,
  type ProfessionalProfile,
} from "./contracts";
export function validateContent(
  raw: unknown,
  p: ProfessionalProfile,
): ResumeContent {
  const c = resumeContentSchema.parse(raw);
  const unique = (ids: string[]) => {
    if (new Set(ids).size !== ids.length)
      throw Error("Duplicate content selection");
  };
  unique(c.skillIds);
  unique(c.experience.map((e) => e.experienceId));
  unique(c.projects.map((e) => e.projectId));
  if (c.skillIds.some((id) => !p.skills.some((s) => s.id === id)))
    throw Error("Unknown approved skill");
  for (const e of c.experience) {
    const source = p.experience.find((s) => s.id === e.experienceId);
    if (!source) throw Error("Unknown approved experience");
    unique(e.bullets.flatMap((b) => b.sourceAchievementIds));
    if (
      e.bullets.some((b) =>
        b.sourceAchievementIds.some(
          (id) => !source.achievements.some((a) => a.id === id),
        ),
      )
    )
      throw Error("Achievement does not belong to approved experience");
  }
  if (c.projects.some((v) => !p.projects.some((s) => s.id === v.projectId)))
    throw Error("Unknown approved project");
  return c;
}
export function baseContent(p: ProfessionalProfile): ResumeContent {
  return {
    summary: p.summary,
    skillIds: p.skills.map((s) => s.id),
    experience: p.experience.map((e) => ({
      experienceId: e.id,
      bullets: e.achievements.map((a) => ({
        sourceAchievementIds: [a.id],
        text: a.text,
      })),
    })),
    projects: p.projects.map((v) => ({
      projectId: v.id,
      description:
        [v.description, ...v.achievements.map((a) => a.text)]
          .filter(Boolean)
          .join(" ") || v.name,
    })),
  };
}
// High-signal checks, not a semantic proof of arbitrary English paraphrases.
export function checkRewrite(text: string, source: string): boolean {
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .match(
        /\b\d+(?:[.,]\d+)*(?:\s*(?:%|years?|months?|ms|seconds?|hours?|million|billion))?/g,
      ) || [];
  const normalize = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  const allowed = new Set(tokens(source).map(normalize));
  if (tokens(text).some((v) => !allowed.has(normalize(v)))) return false;
  const entities =
    text.match(/https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
  if (entities.some((v) => !source.includes(v))) return false;
  const protectedTerms =
    text.match(
      /\b(?:PhD|MBA|MSc|BSc|certified|certification|senior|led|managed|director|chief|CTO|CEO)\b/gi,
    ) || [];
  if (
    protectedTerms.some((v) => !new RegExp("\\b" + v + "\\b", "i").test(source))
  )
    return false;
  return !/<\/?[a-z][^>]*>/i.test(text);
}
export function guardContent(raw: unknown, p: ProfessionalProfile) {
  const c = validateContent(raw, p);
  const warnings: string[] = [];
  const guard = (
    text: string,
    source: string,
    fallback: string,
    label: string,
  ) => {
    if (checkRewrite(text, source)) return text;
    warnings.push(
      `${label}: original approved wording retained because the rewrite failed a focused factuality check. Review before approving.`,
    );
    return fallback;
  };
  const professionalSource = JSON.stringify({
    headline: p.headline,
    summary: p.summary,
    skills: p.skills,
    experience: p.experience,
    projects: p.projects,
    education: p.education,
    certifications: p.certifications,
    languages: p.languages,
    achievements: p.achievements,
  });
  c.summary = guard(c.summary, professionalSource, p.summary, "Summary");
  c.experience.forEach((e, i) => {
    const source = p.experience.find((v) => v.id === e.experienceId)!;
    e.bullets.forEach((b, k) => {
      const original = source.achievements.find(
        (a) => a.id === b.sourceAchievementIds[0],
      )!.text;
      b.text = guard(
        b.text,
        original,
        original,
        `Experience ${i + 1} bullet ${k + 1}`,
      );
    });
  });
  c.projects.forEach((v, i) => {
    const source = p.projects.find((s) => s.id === v.projectId)!;
    const original =
      [source.description, ...source.achievements.map((a) => a.text)]
        .filter(Boolean)
        .join(" ") || source.name;
    v.description = guard(
      v.description,
      JSON.stringify(source),
      original,
      `Project ${i + 1}`,
    );
  });
  return { content: c, warnings };
}
export async function contentDigest(p: ProfessionalProfile, c: ResumeContent) {
  const data = new TextEncoder().encode(
    JSON.stringify({
      profile: verifiedProfileSchema.parse(p),
      content: validateContent(c, p),
    }),
  );
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    (v) => v.toString(16).padStart(2, "0"),
  ).join("");
}
