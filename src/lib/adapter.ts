import {
  professionalProfileSchema,
  validateResume,
  allFactEntries,
  type ProfessionalProfile,
  type TailoredResume,
  type JobAnalysis,
} from "../../shared/contracts";
// The approved journal and renderer retain their original field names at this boundary.
export function fromJournal(
  p: any,
  previous?: ProfessionalProfile,
): ProfessionalProfile {
  const prior = previous;
  const fact = (
    text: string,
    old?: { id: string; text?: string; provenance?: unknown },
  ) => ({
    id: old?.id || crypto.randomUUID(),
    text,
    provenance: old?.text === text ? old.provenance || null : null,
  });
  const facts = (
    texts: string[],
    old: ProfessionalProfile["achievements"] = [],
  ) => {
    const reserved = new Set(
      texts.flatMap((text) =>
        old.filter((f) => f.text === text).map((f) => f.id),
      ),
    );
    const used = new Set<string>();
    return texts.map((text, i) => {
      const exact = old.find((f) => f.text === text && !used.has(f.id));
      const positional =
        old[i] && !reserved.has(old[i].id) && !used.has(old[i].id)
          ? old[i]
          : undefined;
      const next = fact(text, exact || positional);
      used.add(next.id);
      return next;
    });
  };
  const personalUrl = (key: "linkedin" | "portfolio" | "github") =>
    p.links.find((l: any) => l.label.toLowerCase() === key)?.url ||
    (prior?.personal[key] &&
    p.links.some((l: any) => l.url === prior.personal[key])
      ? prior.personal[key]
      : null);
  const personalURLs = [
    personalUrl("linkedin"),
    personalUrl("portfolio"),
    personalUrl("github"),
  ];
  return professionalProfileSchema.parse({
    id: prior?.id || crypto.randomUUID(),
    version: prior?.version || 1,
    verified: !!p.confirmed,
    personal: {
      fullName: p.name,
      email: p.email,
      phone: p.phone,
      location: p.location || "",
      linkedin: personalUrl("linkedin"),
      portfolio: personalUrl("portfolio"),
      github: personalUrl("github"),
    },
    headline: p.headline,
    summary: p.summary,
    skills: facts(p.skills, prior?.skills),
    experience: p.employment.map((e: any) => ({
      id: e.id,
      title: e.title,
      employer: e.company,
      dates: e.dates,
      achievements: facts(
        e.bullets,
        prior?.experience.find((v) => v.id === e.id)?.achievements,
      ),
      provenance: (() => {
        const old = prior?.experience.find((v) => v.id === e.id);
        return old &&
          old.title === e.title &&
          old.employer === e.company &&
          old.dates === e.dates
          ? old.provenance
          : null;
      })(),
    })),
    projects: p.projects.map((e: any) => {
      const old = prior?.projects.find((v) => v.id === e.id);
      const unchanged =
        old &&
        [old.description, ...old.achievements.map((a) => a.text)]
          .filter(Boolean)
          .join(" ") === e.description;
      return {
        id: e.id,
        name: e.name,
        description: unchanged ? old.description : e.description,
        achievements: unchanged ? old.achievements : [],
        links: e.links.map((l: any, i: number) => ({
          id: old?.links[i]?.id || crypto.randomUUID(),
          ...l,
        })),
        provenance: unchanged && old.name === e.name ? old.provenance : null,
      };
    }),
    education: p.education.map((e: any) => ({
      ...e,
      provenance: (() => {
        const old = prior?.education.find((v) => v.id === e.id);
        return old &&
          old.degree === e.degree &&
          old.school === e.school &&
          old.dates === e.dates
          ? old.provenance
          : null;
      })(),
    })),
    achievements: facts(p.achievements, prior?.achievements),
    links: p.links
      .filter((l: any) => !personalURLs.includes(l.url))
      .map((l: any) => ({
        id:
          prior?.links.find((v) => v.url === l.url)?.id || crypto.randomUUID(),
        ...l,
      })),
    certifications: p.certifications || prior?.certifications || [],
    languages: p.languages || prior?.languages || [],
    updatedAt: new Date().toISOString(),
  });
}
export function toJournal(p: ProfessionalProfile): any {
  const personalLinks = ["linkedin", "portfolio", "github"].flatMap((k) => {
    const url = p.personal[k as "linkedin"];
    return url ? [{ label: k, url }] : [];
  });
  return {
    confirmed: p.verified,
    name: p.personal.fullName,
    email: p.personal.email,
    phone: p.personal.phone,
    location: p.personal.location,
    headline: p.headline,
    summary: p.summary,
    skills: p.skills.map((s) => s.text),
    employment: p.experience.map((e) => ({
      id: e.id,
      title: e.title,
      company: e.employer,
      dates: e.dates,
      bullets: e.achievements.map((a) => a.text),
    })),
    projects: p.projects.map((e) => ({
      id: e.id,
      name: e.name,
      description: [e.description, ...e.achievements.map((a) => a.text)]
        .filter(Boolean)
        .join(" "),
      links: e.links.map(({ id, ...l }) => l),
    })),
    education: p.education.map(({ provenance, ...e }) => e),
    achievements: p.achievements.map((a) => a.text),
    links: [
      ...p.links.map(({ id, ...l }) => l),
      ...personalLinks.filter((l) => !p.links.some((x) => x.url === l.url)),
    ],
    certifications: p.certifications,
    languages: p.languages,
  };
}
export function baseResume(p: ProfessionalProfile): TailoredResume {
  return {
    headline: { text: p.headline, sourceFactIds: ["headline"] },
    summary: { text: p.summary, sourceFactIds: ["summary"] },
    skillIds: p.skills.map((s) => s.id),
    experience: p.experience.map((e) => ({
      sourceId: e.id,
      achievements: e.achievements.map((a) => ({
        text: a.text,
        sourceFactIds: [a.id],
      })),
    })),
    projects: p.projects.map((e) => ({
      sourceId: e.id,
      description: { text: e.description || e.name, sourceFactIds: [e.id] },
      achievements: e.achievements.map((a) => ({
        text: a.text,
        sourceFactIds: [a.id],
      })),
    })),
    educationIds: p.education.map((e) => e.id),
    certificationIds: p.certifications.map((e) => e.id),
    linkIds: p.links.map((e) => e.id),
  };
}
export function resumeToJournal(
  p: ProfessionalProfile,
  input: TailoredResume,
): any {
  const r = validateResume(input, p);
  const j = toJournal(p);
  return {
    ...j,
    headline: r.headline.text,
    summary: r.summary.text,
    skills: r.skillIds.map((id) => p.skills.find((s) => s.id === id)!.text),
    employment: r.experience.map((e) => ({
      ...j.employment.find((x: any) => x.id === e.sourceId),
      bullets: e.achievements.map((a) => a.text),
    })),
    projects: r.projects.map((e) => ({
      ...j.projects.find((x: any) => x.id === e.sourceId),
      description: [
        e.description.text,
        ...e.achievements.map((a) => a.text),
      ].join(" "),
    })),
    education: j.education.filter((e: any) => r.educationIds.includes(e.id)),
    certifications: p.certifications.filter((e) =>
      r.certificationIds.includes(e.id),
    ),
    links: j.links.filter(
      (l: any) =>
        !p.links.some((e) => e.url === l.url) ||
        r.linkIds.includes(p.links.find((e) => e.url === l.url)!.id),
    ),
  };
}
export function displayAnalysis(a: JobAnalysis, p: ProfessionalProfile): any {
  return {
    ...a,
    requirements: a.requirements.map((r) => ({
      ...r,
      evidence:
        r.evidence +
        (r.sourceFactIds.length
          ? " Approved source: " +
            r.sourceFactIds
              .map((id) => {
                const fact = new Map(allFactEntries(p)).get(id) || "";
                try {
                  const record = JSON.parse(fact);
                  return Object.entries(record)
                    .filter(
                      ([key, value]) =>
                        key !== "id" &&
                        key !== "provenance" &&
                        typeof value === "string",
                    )
                    .map(([, value]) => value)
                    .join(" · ");
                } catch {
                  return fact;
                }
              })
              .join("; ")
          : ""),
    })),
    relevantSkills: p.skills
      .filter((s) => a.requirements.some((r) => r.sourceFactIds.includes(s.id)))
      .map((s) => s.text),
    demo: false,
  };
}
// Manual text retains the generated claim references, then passes the same grounding gates.
export function applyManualText(
  p: ProfessionalProfile,
  r: TailoredResume,
  j: any,
): TailoredResume {
  const updated: TailoredResume = {
    ...r,
    headline: { ...r.headline, text: j.headline },
    summary: { ...r.summary, text: j.summary },
    skillIds: j.skills.map((text: string) => {
      const skill = p.skills.find((s) => s.text === text);
      if (!skill)
        throw Error(
          "A manually added skill is not in the approved profile. Update the journal first.",
        );
      return skill.id;
    }),
    experience: r.experience.map((e) => {
      const edit = j.employment.find((x: any) => x.id === e.sourceId);
      return {
        ...e,
        achievements: e.achievements.map((c, i) => ({
          ...c,
          text: edit?.bullets[i] ?? c.text,
        })),
      };
    }),
    projects: r.projects.map((e) => {
      const edit = j.projects.find((x: any) => x.id === e.sourceId);
      return {
        ...e,
        description: {
          text: edit?.description ?? e.description.text,
          sourceFactIds: [
            ...new Set([
              ...e.description.sourceFactIds,
              ...e.achievements.flatMap((c) => c.sourceFactIds),
            ]),
          ],
        },
        achievements: [],
      };
    }),
  };
  return validateResume(updated, p);
}
