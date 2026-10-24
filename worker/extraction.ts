import { extractedLinkedinField } from "../shared/contracts";
export const linkedinReviewWarning =
  "LinkedIn URL was missing or invalid and was left blank. Review it before saving.";
// Only the extraction boundary tolerates an omitted/invalid optional LinkedIn.
// Copy the object: all other fields (including warnings) go through unchanged.
export function normalizeExtractedLinkedin(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const root = value as Record<string, unknown>;
  const profile = root.profile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile))
    return value;
  const p = profile as Record<string, unknown>;
  const personal = p.personal;
  if (!personal || typeof personal !== "object" || Array.isArray(personal))
    return value;
  const person = personal as Record<string, unknown>;
  const linkedin = person.linkedin;
  const valid = extractedLinkedinField.safeParse(linkedin).success;
  return {
    ...root,
    profile: {
      ...p,
      personal: { ...person, linkedin: valid ? linkedin : null },
    },
  };
}
