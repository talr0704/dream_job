import type { ProfessionalProfile } from "./contracts";
// Capability labels describe evidence, never an invented employment title.
export const dimensions = [
  {
    id: "requirements",
    label: "Requirements Analysis",
    terms: [
      "requirements",
      "user needs",
      "customer needs",
      "customer requests",
      "user stories",
      "acceptance criteria",
      "priorit*",
      "roadmap",
      "stakeholder needs",
    ],
  },
  {
    id: "feedback",
    label: "User Feedback",
    terms: [
      "user feedback",
      "customer feedback",
      "usability issues",
      "product iteration",
      "customer discovery",
      "user research",
    ],
  },
  {
    id: "interfaces",
    label: "Web Interfaces",
    terms: [
      "react",
      "javascript",
      "typescript",
      "frontend",
      "front end",
      "html",
      "html5",
      "css",
      "css3",
      "responsive",
      "ui components",
      "web interfaces",
    ],
  },
  {
    id: "learning",
    label: "Learning Design",
    terms: [
      "learning design",
      "learning objectives",
      "scenario",
      "assessment",
      "instructional",
      "storyboard",
      "learning activities",
      "onboarding modules",
    ],
  },
  {
    id: "training",
    label: "Training Delivery",
    terms: [
      "workshop",
      "facilitator",
      "training delivery",
      "instructor",
      "hands on training",
    ],
  },
  {
    id: "web",
    label: "Web Platforms",
    terms: [
      "website",
      "web application",
      "web app",
      "web platform",
      "wordpress",
      "seo",
      "cms",
      "page speed",
      "page load",
      "web performance",
      "conversion",
      "cro",
      "a b testing",
    ],
  },
  {
    id: "quality",
    label: "Testing & Validation",
    terms: ["qa", "testing", "debug*", "quality assurance", "validation"],
  },
  {
    id: "ai",
    label: "AI Applications",
    terms: [
      "llm",
      "ai powered",
      "ai integration",
      "ai ml",
      "ai capabilities",
      "ai features",
      "artificial intelligence",
      "openai api",
      "language model",
    ],
  },
  {
    id: "delivery",
    label: "Project Delivery",
    terms: [
      "end to end",
      "delivery",
      "deploy*",
      "ship*",
      "release",
      "cross functional",
    ],
  },
] as const;
export type Evidence = {
  id: string;
  text: string;
  kind: "achievement" | "project" | "skill" | "general" | "context";
  parentId?: string;
};
export const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function hits(text: string, terms: readonly string[]) {
  const clean = normalize(text);
  return terms.reduce((sum, term) => {
    const escaped = normalize(term.replaceAll("*", "")).replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    return (
      sum +
      Number(
        new RegExp(
          `\\b${escaped}${term.endsWith("*") ? "[a-z]*" : term.endsWith("s") ? "" : "s?"}\\b`,
        ).test(clean),
      )
    );
  }, 0);
}
export function evidenceCatalog(p: ProfessionalProfile): Evidence[] {
  const values: Evidence[] = [];
  for (const e of p.experience) {
    values.push({
      id: e.id,
      text: `${e.title}; ${e.employer}; ${e.dates}`,
      kind: "context",
    });
    values.push(
      ...e.achievements.map((a) => ({
        id: a.id,
        text: a.text,
        kind: "achievement" as const,
        parentId: e.id,
      })),
    );
  }
  values.push(
    ...p.skills.map((a) => ({
      id: a.id,
      text: a.text,
      kind: "skill" as const,
    })),
  );
  values.push(
    ...p.education.map((e) => ({
      id: e.id,
      text: e.degree,
      kind: "general" as const,
    })),
  );
  values.push(
    ...p.certifications.map((e) => ({
      id: e.id,
      text: e.name,
      kind: "general" as const,
    })),
  );
  values.push(
    ...p.achievements.map((a) => ({
      id: a.id,
      text: a.text,
      kind: "general" as const,
    })),
  );
  const canonical = new Set([
    ...values.map((v) => v.id),
    ...p.projects.flatMap((v) => [v.id, ...v.achievements.map((a) => a.id)]),
  ]);
  let prefix = "@detail/";
  while ([...canonical].some((id) => id.startsWith(prefix)))
    prefix = "@" + prefix;
  for (const project of p.projects) {
    // Exact approved spans; IDs are stable within the immutable source snapshot.
    // Existing master records are never split, rewritten or migrated.
    const parts = project.description
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length <= 1)
      values.push({
        id: project.id,
        text: project.description || project.name,
        kind: "project",
        parentId: project.id,
      });
    else
      parts.forEach((text, i) =>
        values.push({
          id: `${prefix}${encodeURIComponent(project.id)}/${i}`,
          text,
          kind: "project",
          parentId: project.id,
        }),
      );
    values.push(
      ...project.achievements.map((a) => ({
        id: a.id,
        text: a.text,
        kind: "project" as const,
        parentId: project.id,
      })),
    );
  }
  if (
    !values.some((v) => ["achievement", "project", "general"].includes(v.kind))
  )
    values.push({ id: "summary", text: p.summary, kind: "general" });
  return values;
}
export function planTailoring(p: ProfessionalProfile, jobDescription: string) {
  const catalog = evidenceCatalog(p);
  const start = jobDescription.search(
    /(?:^|\n|[.!?]\s+)\s*(?:key\s+responsibilities|responsibilities|about\s+the\s+role|the\s+role|requirements|what\s+you.ll\s+do)\s*(?::|\n)/i,
  );
  const job = start >= 0 ? jobDescription.slice(start) : jobDescription;
  const priorities = dimensions
    .map((dimension) => ({
      ...dimension,
      weight: job
        .split(/[\n.!?]+/)
        .reduce(
          (sum, section) =>
            sum +
            hits(section, dimension.terms) *
              (/preferred|nice to have|bonus/i.test(section) ? 0.3 : 1),
          0,
        ),
    }))
    .filter((d) => d.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);
  const stop = new Set(
    "the and with for from your our are this that will have has role years experience required preferred company work working strong skills responsibilities requirements ability must you their using about what into through across including seeking manager developer designer".split(
      " ",
    ),
  );
  const query = new Set(
    normalize(job)
      .split(" ")
      .filter((w) => w.length > 2 && !stop.has(w)),
  );
  const ranked = catalog
    .filter((e) => e.kind !== "context")
    .map((e, order) => {
      const words = new Set(normalize(e.text).split(" "));
      const overlap =
        [...query].filter((w) => words.has(w)).length /
        Math.sqrt(Math.max(1, words.size));
      const coverage = priorities.filter((d) => hits(e.text, d.terms) > 0);
      const score =
        overlap +
        coverage.reduce(
          (sum, d) => sum + d.weight * Math.min(2, hits(e.text, d.terms)),
          0,
        );
      return {
        ...e,
        score,
        overlap,
        order,
        dimensions: coverage.map((d) => d.id),
      };
    })
    .sort((a, b) => b.score - a.score || a.order - b.order);
  const positive = ranked.filter(
    (e) =>
      e.score > 0 &&
      (e.dimensions.length || !priorities.length || e.overlap >= 1),
  );
  const warnings: string[] = [];
  const professional = catalog.map((e) => e.text).join(" ");
  for (const term of ["WordPress", "SEO"])
    if (
      new RegExp(`\\b${term}\\b`, "i").test(job) &&
      !new RegExp(`\\b${term}\\b`, "i").test(professional)
    )
      warnings.push(
        `${term} is requested but not evidenced in approved facts; it was not added as a qualification.`,
      );
  if (
    /\bproduct manager\b/i.test(job) &&
    !p.experience.some((e) => /\bproduct manager\b/i.test(e.title))
  )
    warnings.push(
      "No approved employment record has a Product Manager title. Transferable evidence does not establish formal Product Manager employment.",
    );
  if (!priorities.length)
    warnings.push(
      "No supported capability category matched this job; exact-word evidence ranking was used. Review targeting carefully.",
    );
  const skills = positive.filter((e) => e.kind === "skill").slice(0, 8);
  if (!skills.length) {
    skills.push(...ranked.filter((e) => e.kind === "skill").slice(0, 3));
    warnings.push(
      "No approved skill directly matched the job; a small general skill selection was retained for review.",
    );
  }
  const experience = p.experience.map((e) => ({
    experienceId: e.id,
    facts: positive
      .filter((v) => v.kind === "achievement" && v.parentId === e.id)
      .slice(0, 3),
  }));
  const projectRank = p.projects
    .map((project, order) => ({
      projectId: project.id,
      name: project.name,
      order,
      facts: positive
        .filter((v) => v.kind === "project" && v.parentId === project.id)
        .slice(0, 3),
    }))
    .filter((v) => v.facts.length)
    .sort((a, b) => b.facts[0].score - a.facts[0].score || a.order - b.order)
    .slice(0, 3);
  const evidence = [
    ...experience.flatMap((e) => e.facts),
    ...projectRank.flatMap((e) => e.facts),
    ...skills,
    ...positive.filter((e) => e.kind === "general").slice(0, 2),
  ];
  if (!evidence.some((e) => e.kind !== "skill"))
    warnings.push(
      "The approved profile contains little job-relevant achievement evidence. No missing qualifications were invented.",
    );
  for (const dimension of priorities)
    if (!positive.some((e) => hits(e.text, dimension.terms)))
      warnings.push(
        `Not evidenced in approved facts: ${dimension.label}. This is missing evidence, not proof of missing experience.`,
      );
  const focus = priorities
    .map((d) => ({
      dimension: d,
      fact: [...evidence]
        .filter((e) => e.kind !== "skill")
        .find((e) => hits(e.text, d.terms)),
    }))
    .filter((v) => v.fact)
    .slice(0, 2);
  const fallbackSkills = skills.slice(0, 2).filter(
    (skill, index, candidates) =>
      candidates
        .slice(0, index + 1)
        .map((s) => s.text)
        .join(" | ").length <= 3000,
  );
  const headline = focus.length
    ? {
        text: focus.map((v) => v.dimension.label).join(" | "),
        sourceFactIds: [...new Set(focus.map((v) => v.fact!.id))],
      }
    : {
        text: fallbackSkills.map((s) => s.text).join(" | "),
        sourceFactIds: fallbackSkills.map((s) => s.id),
      };
  return {
    priorities: priorities.map(({ id, label, weight }) => ({
      id,
      label,
      weight,
    })),
    ranked,
    experience,
    projects: projectRank,
    skillIds: skills.map((s) => s.id),
    evidence,
    headline,
    warnings,
  };
}
