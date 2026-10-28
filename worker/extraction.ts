import {
  extractedOptionalUrlFields,
  extractionCandidateSchema,
  extractedLinkCandidateSchema,
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

// Both optional link collections share one URL policy. Missing containers and
// invalid non-URL fields remain untouched for candidate validation below.
function normalizeLinkCandidates(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((link) =>
    record(link)
      ? {
          ...link,
          url: extractedLinkCandidateSchema.shape.url.safeParse(link.url)
            .success
            ? link.url
            : null,
        }
      : link,
  );
}
export function parseExtractedProfile(value: unknown) {
  let input = value;
  if (
    record(value) &&
    record(value.profile) &&
    ["id", "version", "verified", "updatedAt"].every(
      (k) => !Object.hasOwn(value.profile as object, k),
    )
  ) {
    input = {
      ...value,
      profile: {
        ...value.profile,
        id: crypto.randomUUID(),
        version: 1,
        verified: false,
        updatedAt: new Date().toISOString(),
      },
    };
  }
  const normalized = normalizeExtractedOptionalUrls(input);
  let candidate = normalized;
  if (record(normalized) && record(normalized.profile)) {
    const profile = normalized.profile;
    candidate = {
      ...normalized,
      profile: {
        ...profile,
        // Do not manufacture required arrays/properties when absent.
        ...(Object.hasOwn(profile, "links")
          ? { links: normalizeLinkCandidates(profile.links) }
          : {}),
        ...(Array.isArray(profile.projects)
          ? {
              projects: profile.projects.map((project) =>
                record(project) && Object.hasOwn(project, "links")
                  ? {
                      ...project,
                      links: normalizeLinkCandidates(project.links),
                    }
                  : project,
              ),
            }
          : {}),
      },
    };
  }
  const checked = extractionCandidateSchema.safeParse(candidate);
  if (!checked.success) return checked;
  const warnings: string[] = [];
  const links = checked.data.profile.links.filter((link) => link.url !== null);
  if (links.length !== checked.data.profile.links.length)
    warnings.push(
      "General profile links: invalid or missing optional link candidates were removed. Review links against your source before saving.",
    );
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
    profile: { ...checked.data.profile, projects, links },
    warnings: [...warnings, ...checked.data.warnings].slice(0, 50),
  });
}

export const extractionInstruction = `Extract only facts from submitted professional text, in English. Store distinct professional actions/results as separate achievement records with unique stable IDs under their owning experience or project. Keep project descriptions as context; retain specific project methods, outcomes and accomplishments in their achievement records. Never invent detail to fill an array. Do not infer qualifications. Leave missing non-URL strings empty, missing optional URLs null, and include required arrays. Missing/malformed/placeholder/unsupported personal LinkedIn/portfolio/GitHub and certification URLs must be null; links arrays can be empty and unusable link candidates can have null URLs. For every optional field, never infer, repair, or fabricate any URL. personal.linkedin must be null for absent or unsupported LinkedIn values; personal.portfolio, personal.github and certifications[].url must also be null when unusable. General profile links and project links are optional collections. Preserve valid project links with their exact supplied labels and URLs. Never infer or repair URLs; LinkedIn must be a supplied personal HTTPS LinkedIn profile URL. Preserve exact valid URLs and labels. Preserve all professional facts even if an optional link is unusable. Do not put professional achievements only in link labels. Preserve existing record/fact IDs on updates; assign unique stable IDs to new records. Provenance uses document source and short exact quotes when available. Warn about missing/ambiguous facts. Never mark facts verified. Omit application-owned root profile id, version, updatedAt and verified fields; the application assigns them before review.`;
