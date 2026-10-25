import {
  extractedOptionalUrlFields,
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
