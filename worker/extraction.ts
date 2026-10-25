import {
  extractedOptionalUrlFields,
  extractionCandidateSchema,
  extractResponseSchema,
  type ProfessionalProfile,
} from "../shared/contracts";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function optionalUrl(
  value: unknown,
  schema: (typeof extractedOptionalUrlFields)[keyof typeof extractedOptionalUrlFields],
): unknown {
  return schema.safeParse(value).success ? value : null;
}
// Only the AI extraction boundary is tolerant. Never mutate input, coerce other
// fields, remove records, or create missing containers: full validation follows.
export function normalizeExtractedOptionalUrls(value: unknown): unknown {
  if (!record(value) || !record(value.profile)) return value;
  const profile = value.profile;
  const personal = profile.personal;
  return {
    ...value,
    profile: {
      ...profile,
      ...(record(personal)
        ? {
            personal: {
              ...personal,
              ...Object.fromEntries(
                (["linkedin", "portfolio", "github"] as const).map((key) => [
                  key,
                  optionalUrl(personal[key], extractedOptionalUrlFields[key]),
                ]),
              ),
            },
          }
        : {}),
      ...(Array.isArray(profile.certifications)
        ? {
            certifications: profile.certifications.map((cert) =>
              record(cert)
                ? {
                    ...cert,
                    url: optionalUrl(
                      cert.url,
                      extractedOptionalUrlFields.certification,
                    ),
                  }
                : cert,
            ),
          }
        : {}),
    },
  };
}
export const linkedinReviewWarning =
  "LinkedIn URL was missing or invalid and was left blank. Review it before saving.";
// Static field names only, never rejected values, record names, IDs or quotes.
// Aggregate certification warnings so every optional location fits within the
// response's warning limit even with the maximum number of certification records.
export function optionalUrlReviewWarnings(
  profile: ProfessionalProfile,
): string[] {
  return [
    ...(profile.personal.linkedin === null ? [linkedinReviewWarning] : []),
    ...(profile.personal.portfolio === null
      ? [
          "Portfolio URL was missing or invalid and was left blank. Review it before saving.",
        ]
      : []),
    ...(profile.personal.github === null
      ? [
          "GitHub URL was missing or invalid and was left blank. Review it before saving.",
        ]
      : []),
    ...(profile.certifications.some((cert) => cert.url === null)
      ? [
          "One or more certification URLs were missing or invalid and were left blank. Certification facts were retained; review their URLs against your source before saving.",
        ]
      : []),
  ];
}

// Optional project link candidates are distinct from required standalone links.
// First normalize only candidate URLs to null, preserving record shapes/fields.
export function parseExtractedProfile(value: unknown) {
  const normalized = normalizeExtractedOptionalUrls(value);
  let candidate = normalized;
  if (
    record(normalized) &&
    record(normalized.profile) &&
    Array.isArray(normalized.profile.projects)
  ) {
    candidate = {
      ...normalized,
      profile: {
        ...normalized.profile,
        projects: normalized.profile.projects.map((project) => {
          if (!record(project) || !Array.isArray(project.links)) return project;
          return {
            ...project,
            links: project.links.map((link) =>
              record(link)
                ? {
                    ...link,
                    url: optionalUrl(
                      link.url,
                      extractedOptionalUrlFields.portfolio,
                    ),
                  }
                : link,
            ),
          };
        }),
      },
    };
  }
  const checked = extractionCandidateSchema.safeParse(candidate);
  if (!checked.success) return checked;
  const warnings: string[] = [];
  const projects = checked.data.profile.projects.map((project, index) => {
    const links = project.links.filter((link) => link.url !== null);
    if (links.length !== project.links.length)
      warnings.push(
        `Project ${index + 1}: invalid or missing optional links were removed. Project facts were retained; review its links against your source before saving.`,
      );
    return { ...project, links };
  });
  // Revalidate the final response: no null URL escapes into the client/profile.
  // Original warnings and candidate limits have already been validated above.
  return extractResponseSchema.safeParse({
    ...checked.data,
    profile: { ...checked.data.profile, projects },
    warnings: [...warnings, ...checked.data.warnings].slice(0, 50),
  });
}
