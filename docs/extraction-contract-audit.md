# Complete AI extraction contract audit

## Production evidence

Worker version `6d8f6bb9-2575-4fd7-8951-c96df047eee4`, request `f5e9c61c-d864-48a9-9f91-e542a44a8a19`, failed `POST /api/extract-profile` with `INVALID_AI_RESPONSE`: provider HTTP 200, finish reason `stop`, phase `zod_validation`, two issues at `profile.links.[].url` (`invalid_format`, `custom`). The evidence identifies a malformed non-null general link candidate failing local URL format/public HTTPS checks. The private candidate value is unknown and is not logged. A synthetic `N/A` reproduces both canonical issue codes.

PR #11 treated project links as optional extraction candidates but explicitly left general links strict. Both collections allow an empty array, so general links can safely use the same candidate treatment. This fix shares the candidate schema and normalization across both collections rather than leaving another URL path untreated.

## Pipeline and consistency

1. Browser PDF/DOCX or pasted text extraction and typed request validation remain unchanged. Source text is preserved for user review.
2. The prompt instructs the model to copy valid supplied URLs/labels exactly, never infer/repair/fabricate URLs, return empty link arrays when none are available, and preserve professional facts in records rather than only in link labels.
3. `structuredSchema(extractionSchema)` generates `extractionCandidateSchema` for the provider. Both `profile.links[]` and `projects[].links[]` share the same strict record schema and required nullable candidate URL property. Scalar URL fields use their shared extraction validators. The supported schema guard remains enforced. HTTPS/domain/placeholder refinements that cannot be represented in Structured Outputs remain enforced locally.
4. After parsing JSON, normalize only the six URL paths inventoried below. No missing profile/record/array containers are created. Invalid scalar optional URLs become null; unusable optional collection URL values become null temporarily.
5. Validate the **entire candidate** before removing links. IDs, labels, non-URL facts, unknown-field rejection, global duplicate IDs (including discarded candidates), original array bounds and original warning bounds remain strict. Null/primitive link records, missing IDs/labels and malformed containers still reject.
6. Remove only validated optional link candidates whose URL is null. Preserve all valid link IDs, labels, URLs and ordering exactly; preserve all unrelated profile/project/certification facts and provenance. No destination is fetched, expanded or repaired. Input objects are not mutated.
7. Prioritize a static general-link removal warning and one ordinal warning per affected project within the original fifty-warning limit. Existing scalar review warnings are also retained. System warnings never include rejected URLs, labels, names, IDs or source quotes. Existing privacy-safe logs remain unchanged.
8. Validate the full cleaned draft with strict `extractResponseSchema`, then run the independent factuality audit on that draft. Unsupported surviving claims or fabricated valid-looking URLs still reject. An invalid raw response cannot bypass the typed client's final schema.
9. The Worker sets its server-owned profile metadata after successful validation/audit and returns `verified:false`. It adds scalar/missing-personal review warnings and revalidates the final response. Extraction does not modify IndexedDB. Saving requires explicit approval and strict canonical/verified-profile validation.

Canonical `professionalProfileSchema`, saved/imported profile rules, generation/refinement/analysis contracts, Access JWT validation, CORS, quotas, timeouts, diagnostic privacy and secrets are unchanged. Only extraction candidate handling is tolerant. Canonical storage retains its previous label trimming; extraction response schemas preserve valid original link labels verbatim.

## Exhaustive URL inventory

| Path | Safe extraction recovery | What remains strict |
| --- | --- | --- |
| `personal.linkedin` | Absent/invalid/placeholder/unsupported URL -> null plus review warning | Existing HTTPS, LinkedIn domain and personal-profile path rules; no inference |
| `personal.portfolio` | Absent/invalid/placeholder/unsupported URL -> null plus review warning | Shared extraction HTTPS/placeholder rules |
| `personal.github` | Same | Shared rules, no new hostname whitelist |
| `certifications[].url` | Same; retain entire certification record | Certification ID/name/issuer/dates/provenance and array limits |
| `projects[].links[].url` | Remove only validated candidate with unusable URL; warn by project position | All project/link metadata and original limits checked before removal |
| `links[].url` | Same shared filtering; warn that general candidates were discarded | All general link metadata/IDs checked before removal |

These are every URL field in the extraction profile; inventory regressions enforce the list. The separate analyze-job request's optional `jobUrl` is not an extraction field and remains strict. Every retained canonical/final link URL remains required, non-null and valid.

## Every profile field, array and optional value

Every object is strict (unknown fields fail); every listed property is required in the schema, even when its value may be blank or null. The pipeline never fills missing required professional information or invents record metadata.

| Structure / fields | Bounds and behavior | Recovery decision |
| --- | --- | --- |
| Response `profile`, `warnings` | Both required. Warnings are nonempty trimmed strings, max 3000 characters each, max 50 items | Malformed/blank/excessive original warnings reject before adding bounded system warnings |
| Profile `id`, record/fact/link IDs | Strings length 1–120; globally unique, including reserved personal/headline/summary IDs | Missing, wrong type, empty, oversized or duplicate IDs reject; never regenerate record IDs to hide errors |
| Profile `version`, `verified`, `updatedAt` | Positive integer, literal false for extraction, valid UTC minute/second/fractional timestamp | Reject invalid candidate metadata even though the server replaces it after audit; never turn true into approved data |
| `personal` | Required strict object: `fullName`, `email`, `phone`, `location`, `linkedin`, `portfolio`, `github` | Only three URL values recover; absent containers and other missing properties reject |
| `fullName`, `phone`, `location`, `headline`, `summary` | Existing trimmed text, max 3000; blanks allowed in unapproved drafts | Preserve blanks as unknown, not fabricated replacements. Missing personal fields receive review warnings. Approval still requires name/headline/summary/skills |
| `email` | Valid email string or explicit empty string | Invalid nonempty email rejects; no deletion, email guessing or repair |
| `experience[]` (max 10) | Each record: ID, title, employer, dates, achievements, provenance | Wrong structures/types/bounds reject; missing title/employer/date facts remain explicit blank text only when supplied as such |
| `experience[].achievements[]` (max 20 each) | Fact ID, nonempty text, provenance | Never drop invalid achievements or truncate text to make validation pass |
| `education[]` (max 10) | ID, degree, school, dates, provenance | Strict types/text bounds; no inferred degree/school/date |
| `skills[]` (max 100), `achievements[]` (max 30) | Fact ID, nonempty text, provenance | Strict; no dropping unsupported skills or metrics |
| `projects[]` (max 10) | ID, nonempty name, description, achievements (max 20), links (max 10), provenance | Only unusable optional link candidates recover; project facts/technologies in descriptions/achievements remain intact |
| General/project `links[]` (max 10 per collection) | Each record: ID, nonempty string label (max 3000), URL | Shared URL recovery after full candidate validation. Missing arrays, null records, invalid labels/IDs, excessive arrays and unknown fields reject |
| `certifications[]` (max 30) | ID, nonempty name, issuer, dates, nullable URL, provenance | Only URL recovery; retain certification facts and record |
| `languages[]` (max 30) | ID, nonempty name, proficiency, provenance | Strict types, nonempty name, text bounds; no inferred proficiency |
| Every `provenance` | Explicit null or strict object with source enum manual/document/legacy and quote text max 3000 | Preserve explicit null. Missing required provenance property, invalid source/shape/quote rejects; never invent quotes |
| All other text fields | Existing trimming and max 3000; required nonempty where specified above | Trimming surrounding whitespace is existing behavior. No coercion, truncation, generic placeholder erasure or fact deletion |

All twelve array locations, including nested achievement/link arrays and warnings, are required arrays with the original bounds. Empty arrays are allowed when explicitly returned. Missing/null/wrong-type arrays never become empty automatically. There are no other omittable optional fields in the extraction profile; nullable fields are the six URL paths and provenance. Personal/email and text blank values are explicitly defined schema alternatives, not missing properties.

## Other plausible failures and limits

Safe recovery is limited to unusable **optional URL values/candidates**, existing whitespace trimming, and bounded deterministic review warnings after original warnings have passed validation. Explicit null provenance and already-allowed blank draft strings are preserved. There is no professional evidence in a missing URL that permits inventing a destination.

A whitespace-padded email, invalid date metadata, empty fact/record name, ambiguous source enum, extra field, null array, missing required property, oversized text/array, malformed label or duplicate ID can still plausibly be returned by a model. They intentionally reject extraction: silently fixing, deleting, filling or truncating them could change facts, hide structural defects or lose information. Free-form employment/education dates remain source text rather than guessed normalized dates. Server-owned version/timestamp/profile-ID generation could be removed from a future provider contract by an explicit API change; this PR does not relax their existing validation. Professional record/fact IDs always remain strict.

Provider refusal, incomplete/truncated completion, malformed envelope/JSON, unsupported claims, invalid final response and failed authentication likewise reject with the existing safe errors. Successful mock tests do not guarantee every real model output passes; preserving these rejection paths is intentional. No paid model calls or production log access were needed.

## Complete sequence regression fixture

`tests/cloudflare/fixtures/extraction-url-sequence.json` contains synthetic source text, one complete raw candidate and the expected cleaned profile. It includes all six previously problematic URL locations, missing/placeholder values, mixed valid/invalid links, every record family and provenance. Valid links deliberately contain URL casing/query/fragments and label whitespace to catch accidental repair/normalization.

The same fixture passes through mocked OpenAI envelope parsing, supported schema generation, URL normalization, candidate validation, filtering, strict final draft validation, independent audit invocation, Worker review-warning generation, final response validation and typed client parsing. The test checks exact expected facts, every warning category, unchanged approved IndexedDB data/history and `verified:false`. A rejected factuality audit remains a failure even when every URL error is recoverable. An incomplete name stays blank and approval still fails.

Additional contract tests exercise wrong types and missing properties at every populated field/record path, every nested array bound, unknown fields on every record, all declared non-URL text bounds, semantic metadata/email/provenance failures and global duplicate IDs before filtering. URL inventory tests guard against another unreviewed path entering the contract.

No deployment, merge, Cloudflare setting change or secret change is included.

Local validation passed: 444 Vitest tests, 7 legacy tests, 3 PDF integration tests, 5 Playwright workflows, strict TypeScript/Vite same-origin production build, same-origin Wrangler dry-run, and local workerd routing checks (HTML 200, two root assets, unauthenticated API 401, unknown API 404, wrong origin 403). Existing canonical compatibility, privacy, Access and Windows subprocess regressions remain passing. `git diff --check` passed.
