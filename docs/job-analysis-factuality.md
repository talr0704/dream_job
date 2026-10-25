# Job analysis factuality investigation

## What the production evidence establishes

Worker version `4759449e-34d1-4bbc-bdbf-e6ecb2cad18e`, request `22f612f3-66db-456c-b001-0a0ad6a22b8a`, returned HTTP 422 / `UNSUPPORTED_CLAIM` for `POST /api/analyze-job`. Reported provider status is 200; operation is `audit`, phase is `factuality`.

In the inspected implementation, that precise audit-phase rejection happens after the analysis model response passes Zod, local candidate-reference/status validation and weighted scoring, then the independent audit returns `supported:false`. It is not a request validation, authentication, malformed model JSON or provider HTTP failure. Existing code discards the audit's free-text reasons without logging them, so the supplied metadata cannot identify the actual statement or establish whether this was a correct rejection or false positive. No private model output, source text, production logs or deployed Git SHA were supplied. The Worker version alone does not establish its source commit.

The code reveals two concrete weaknesses: one generic factuality policy is used across extraction, resume writing and job comparison, and its broad candidate-fact/citation wording never explicitly distinguishes role requirements, candidate evidence, comparisons, uncertainty or prospective advice. It can also imply citations are required in narrative fields whose public schema has no citation property. Analysis requirement statements have no locally checked job-description source proof. Candidate fact IDs are checked for existence but existence does not prove the claim follows from those facts. The old boolean/free-text audit result cannot safely explain which rule/field failed.

These weaknesses plausibly produce both legitimate rejections and false positives. They do **not** prove that the particular production response was a false positive. Mocked regressions validate the contract, source routing and rejection behavior; they do not establish how a live model would judge unseen production text.

## Full pipeline before and after

The browser submits a verified professional profile, job description and optional company/title/URL through the typed client. Shared Zod request validation, Worker Access JWT verification, CORS, request size/time limits and the rate-limit binding remain unchanged. A failed call leaves the user's inputs and approved profile intact.

Previously, the first model returned `analysisDraftSchema`. `validateAnalysis` checked unique requirement IDs, that met/partial rows cite existing candidate facts, and that missing rows cite no matches. Application code computed the 0–100 score (mandatory weight 3, preferred weight 1; met=1, partial=0.5, missing=0). The generic independent audit received mixed source material and the completed analysis with its score. Any `supported:false` aborted the request; the client received only a safe error/request ID.

Now the first model uses a private `jobAnalysisCandidateSchema` with the same public fields plus one required exact `jobDescriptionQuote` per requirement. Candidate/profile facts and role/job input are explicitly separated. The quote may normalize whitespace for source matching, but cannot be repaired, inferred or taken from the profile. It must occur in the submitted job description. The quotation is only source proof; the independent audit must still verify that it entails the requirement and its mandatory/preferred classification. An unrelated exact quote cannot justify an invented requirement.

Application checks fail closed on invented quotations, duplicate requirement IDs, unknown candidate references, matches with no evidence, or missing statuses citing matches. Diagnostics identify the particular requirement index and source rule. The unchanged shared validator still enforces references/status consistency and computes the weighted score. Quote-only fields are stripped; public `JobAnalysis`, client schemas, saved analyses, backup/import formats and resume-generation inputs are unchanged.

A dedicated independent analysis audit then receives separate `job`, `candidate`, `jobRequirementSources` and `analysis` sections. Candidate fact IDs resolve through the same application-generated fact map. The deterministically computed score is omitted from this semantic audit: its formula is enforced in application logic, and it must not be judged as a candidate achievement percentage. All substantive analysis fields, statuses and recommendations remain audited. Narrative fields are checked directly against the verified profile, without demanding citation properties that their schema does not contain; mandatory requirement citations and resume claim citations remain strict.

The audit returns only a verdict and allowlisted rule/field/index violations. Supported output requires no violations; unsupported output requires at least one. Field names and rules are enums. Array indexes must exist in the corresponding analysis array; scalar fields require null indexes. Unknown fields, explanations, impossible indexes and contradictory verdicts fail closed as `INVALID_AI_RESPONSE`. A valid unsupported result remains HTTP 422 with `UNSUPPORTED_CLAIM`; no partial analysis is returned.

Final shared response validation still runs before a successful JSON response. No master profile or analysis is saved by the stateless Worker. The typed client accepts only the unchanged response contract, and browser storage occurs only after a successful call. Profile changes still require the existing explicit approval workflow.

## Source roles and strict rules

| Analysis content | Required source / interpretation | Rejection examples |
| --- | --- | --- |
| Job requirements and classifications | Job description, exact supporting quotation and audited entailment | Invented PhD requirement; preferred Python made mandatory; real unrelated quotation used as proof |
| Job title/company context | Supplied role metadata or the job description | Target company treated as candidate's employer; invented senior job title |
| Candidate skills/employment/education/certifications/achievements | Verified profile facts | AWS certification, a different employer, PhD or revenue achievement absent from the profile |
| Candidate experience duration / quantitative claims | Source-supported candidate evidence; no guesses from vague/overlapping dates | Claiming ten years of distributed systems experience from an unrelated developer record |
| Confirmed/partial matches and evidence | Cited existing candidate facts that actually support the claimed subset of the job requirement | Citing TypeScript to claim AWS certification; treating a valid ID as semantic proof |
| Missing requirements and gaps | Missing evidence means unknown; explicit documented shortfalls can be stated accurately | "No evidence of Python" is legitimate; "has never used Python" needs explicit evidence |
| Strengths and experience alignment | Candidate facts, with honest comparisons to sourced role requirements | Invented seniority, employer, skill, degree or achievement in an unreferenced narrative field |
| Recommendations | Prospective learning/clarification advice or emphasis of verified facts | "Consider AWS training" is legitimate advice; "highlight your AWS certification" is unsupported without that certification |
| Weighted score | Application's unchanged rubric over validated statuses | No model-supplied arbitrary score accepted |

A job requirement may legitimately contain a skill, degree or numeric duration absent from the profile: it describes the role, not the candidate. The new prompt explicitly allows that distinction. It equally requires that job material never become evidence of candidate qualifications. Legitimate English comparisons, evidence gaps, sourced explicit shortfalls and conditional recommendations are allowed; unsupported claims remain rejected everywhere, including narrative fields.

## Privacy-safe diagnostics

Factuality events now include `factualitySource` (`application` or `model`), `factualityIssueCount`, and at most twelve `{rule,path}` entries, linked to the server-generated request ID and existing endpoint/operation/phase/error code. Paths are constructed only from enum field names plus checked zero-based array indexes, for example `requirements.1.status` or `recommendations.0`.

Rules cover unsupported candidate facts, unsupported role requirements/matches/metadata, missing evidence asserted as absence, unsupported quantities, misleading advice, invalid references/classification/language and duplicate requirement IDs. No free-text audit reason, model statement, source quote, personal name, profile/job text, API credential or token is logged. Application-generated local failures use the same allowlisted format. Malformed model attempts to put private content in rules, fields or explanation keys fail validation and do not reach these logs. Existing diagnostic sanitization and logging-failure handling remain intact. Logging failures never permit an unsupported analysis to pass.

No Cloudflare observability, Access or other settings are changed. The metadata improves diagnosis after an explicitly approved deployment; it cannot retroactively recover the production audit's discarded reason.

## Can individual claims be corrected or omitted?

There is no automatic rewrite, retry, score adjustment or silent omission after an audit failure in this change. Dropping a requirement or changing its status changes the weighting and the job decision; changing a candidate statement can invent or erase evidence. Removing a recommendation/strength may appear harmless, but without trustworthy claim-level evidence it can leave contradictions or conceal a material gap elsewhere. A generic boolean rejection was not sufficient authorization for such repair.

The first-generation prompt now prevents the known source-role ambiguities, while the independent audit continues to reject any remaining unsupported claim. Future repair would require an explicit bounded repair policy, preserving job requirements and candidate facts, rechecking references, recomputing the score and independently auditing the entire repaired result. It would also need transparent user-visible reporting. This PR implements none of those implicit changes: a failed claim remains a failed request, with safe rule/path diagnostics for investigation and user review.

## Regression evidence and limitations

Synthetic tests cover supported TypeScript/accessibility evidence, role-only AWS/Python/five-year requirements, genuine partial comparisons, missing-evidence gaps and prospective training advice. They also exercise invented skills/employers/degrees/certifications/durations/achievements, unsupported matches despite valid IDs, fabricated role requirements despite real unrelated quotes, incorrect mandatory/preferred classification, definitive absence claims and misleading recommendations. Source-quote membership and reference/status failures are enforced by application logic before the second model call.

Other cases verify malformed/contradictory audit results, unknown/private rule or path values, extra free-text reasons, invalid indexes, diagnostic count limits, schema support, unchanged API contracts and scoring, logging failure behavior, safe client errors/request IDs and unchanged IndexedDB master/history/analyses after rejection. The mocked supported/unsupported semantic verdicts test enforcement and prompt/source routing; actual semantic judgment still depends on the independent model. No paid model calls or production data were used.

Generic extraction and resume audits remain strict and retain their original response format. No deployment, merge, credentials change, Cloudflare configuration change or persistent data modification is included.

Local validation passed: 481 Vitest tests (`npm test -- --maxWorkers=1`), 7 legacy tests, 3 PDF integration tests and all 6 browser workflows (the existing five-workflow run plus the new targeted rejection workflow). The browser rejection case confirms that HTTP 422 preserves the entered job description and all saved profile/version/analysis/resume data and does not call resume generation. Strict TypeScript/Vite same-origin production build, same-origin Wrangler dry-run and local workerd routing passed (HTML 200, two root assets, unauthenticated API 401, unknown API 404, wrong origin 403). `git diff --check` passed. Some earlier runs hit the existing 15-second Wrangler `--version` subprocess timeout; the complete sequential test run and standalone CLI invocation passed without changing deployment scripts or test timeouts.
