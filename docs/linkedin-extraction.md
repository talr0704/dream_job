# Optional LinkedIn extraction fix

## Confirmed cause

The new production diagnostics identify `operation:extract`, `phase:zod_validation`, provider HTTP 200, finish reason `stop`, no refusal, and two issues at `profile.personal.linkedin`: `invalid_format` and `custom`. This establishes that a non-null LinkedIn candidate failed the URL-format and custom public-HTTPS checks. It is not a method error, provider schema rejection, truncation, refusal or audit-call failure. The actual candidate was not supplied and must not be logged; it could be a missing-value string, placeholder or other malformed value. The regression uses a synthetic `N/A`, which reproduces those two issue codes without requiring the private response.

The field was nullable, but a missing-value string was not null. The extraction prompt's generic guidance to leave missing strings empty could be confused with the separate requirement to use null for missing URLs. Structured Outputs enforces representable schema constraints, while the HTTPS/domain/refinement checks remain local validation gates; a structurally returned string can still fail them.

## Narrow boundary behavior

Only the Worker extraction path normalizes `profile.personal.linkedin`, immediately after parsing model JSON and before running the full strict extraction schema. Missing, null or invalid values become `null` (the application's blank value). All other fields and warnings pass through unchanged for validation. Wrong profile/personal shapes, invalid email/portfolio/GitHub, duplicate IDs, invalid warnings, unknown fields, incorrect verification flags and all other profile errors remain rejected. The input object is not mutated.

A valid value is an exact supplied HTTPS personal LinkedIn profile URL on `linkedin.com` or one of its subdomains, with an `/in/` or legacy `/pub/` profile path. Credentials, nondefault ports, lookalike domains, homepage/redirect-only URLs and explicit template slugs such as `your-name`, `username` and `placeholder` are rejected. Shortened `lnkd.in` links are not followed or expanded. Valid accepted strings are preserved exactly, including case and query parameters. This does not prove ownership of the destination; the factuality audit and user review still apply. No scheme, hostname, path or username is inferred, repaired or fabricated.

The extraction response field uses a shared strict nullable LinkedIn validator with JSON Schema description directing the model to return `null` for absent/invalid/placeholder values. The prompt repeats that instruction and explicitly forbids constructing a URL from a name or company. The same response schema is used for provider schema generation, normalized output validation, final Worker response validation and the typed client. The provider must emit the required nullable property; normalization also tolerates an omitted property at this optional boundary. The generic master profile schema and other endpoint schemas are unchanged.

The factuality audit receives only the normalized draft. After it succeeds, the Worker adds a fixed, nonidentifying review warning when LinkedIn is blank. Warning insertion remains within the 50-warning limit, and malformed original warning arrays cannot be hidden by normalization. No raw rejected URL is added to warnings, diagnostics or errors. Existing logging privacy protections, Access, quotas and timeouts are unchanged.

The response remains `verified:false` and is only a proposed draft. The master profile and history are unchanged until the user explicitly reviews, confirms and saves. Normalization is not applied to arbitrary client responses or to generation/refinement/master profile validation; invalid unnormalized output remains rejected at those boundaries.

## Verification

Regression cases cover valid profile URLs (including regional/uppercase domains and query strings), omitted/null/empty values, malformed/partial URLs, non-LinkedIn URLs, deceptive hosts, embedded credentials, placeholders, wrong types and overlong candidates. Tests also check strict rejection of unrelated errors, prompt/JSON Schema agreement, null values reaching the audit, warning limits, no sensitive logging and unchanged saved profiles/history before approval.

No deployment or Cloudflare configuration/secret change is included. No paid model request was made.

Local validation passed: 154 Vitest tests, 7 legacy tests, 3 PDF integration tests, 5 Playwright workflows, strict TypeScript/Vite same-origin production build and Wrangler dry-run. Existing privacy, approval, grounding, Access and Windows subprocess regression checks remain passing.
