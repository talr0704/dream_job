# Job-specific rewriting in the one-call tailoring workflow

## Evidence and root cause

The normal generation path already sends the exact job description to the Worker and provider. `resumeContentSchema` permits freely rewritten text (up to the existing text limit) for summary, bullets and projects; its one-approved-achievement-per-bullet rule restricts factual scope, not sentence structure. `contentToJournal` uses returned bullet/summary/project text directly. Generation replaces the active content and clears review, and saved content is stored separately by resume ID. No stale-text cache was found in those paths.

Three issues were identified:

1. The old prompt allowed rewriting but did not explicitly require interpreting target responsibilities or restructuring facts around their relevance. Its generic concision/original-wording fallback can favor selection over substantive rewriting. This is a prompt weakness, not a measured claim about every production response.
2. A reproducible guard false positive restored original text for an accurate `25%` → `25 percent` rewrite. The source and output represented the same quantity, but the tokenizer treated them differently. Before the fix, the focused regression failed. Guards really can replace returned model wording; existing warnings identified the section but not the failed rule. No production raw responses were accessed, so the frequency of copying versus guard restoration remains unknown.
3. Refinement did not receive the original job description. The frontend omitted it and the strict refinement schema rejected that field. A second pre-fix regression reproduced the rejection. Refining or requesting a concise version could therefore lose the explicit targeting context, even though normal generation had it.

## Smallest correction

The prompt now asks the same single provider call to use actual responsibilities/priorities, choose supported evidence, and restructure relevant action, audience, method, deliverable or result. It explicitly covers summary and project descriptions as well as experience bullets. A short contrasting example demonstrates focusing the same approved fact on implementation versus training delivery. There is no separate analysis call, audit, retry, synonym quota, lexical-difference threshold or forced rewrite when the original is already best.

The response shape remains v2. Schema descriptions communicate the intended writing behavior without relaxing IDs, structure, length or one-source-per-bullet constraints. Metadata, titles, employers, dates, education, certifications and links still come from approved facts through the existing renderer adapter.

Refinement accepts an optional validated `jobDescription` for compatibility. The frontend sends the current resume's original `sourceJob`, including after reopening a saved resume, rather than an unsent job in the Match editor. Older callers without a description remain supported. No storage migration or rewrite of historical resumes occurs.

Quantity checks recognize only equivalent `%`, `percent` and `per cent` notation. The actual returned wording is preserved exactly. Quantities are not changed or converted. Percentage points are distinct from percentages and remain rejected when unsupported. Invalid references, changed metrics/units, introduced protected credentials/seniority/responsibility terms, new links and HTML remain blocked or restored with a review warning as before. Warnings now include a static rule code and section position, never sensitive source text. No new content logging was introduced.

## Comparative regression examples

All three examples use the same approved learning-technology profile, with React portal development (25% load-time reduction), four onboarding modules, and workshops for 60 employees.

| Target                       | Primary emphasis                                 | Example rewritten achievement                                                                         |
| ---------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Frontend Developer           | Accessible React interfaces and page performance | Reduced training-portal page load time by 25 percent while building accessible React interfaces.      |
| Learning Experience Designer | Scenario-based activities and assessments        | Structured 4 onboarding modules around scenario-based learning activities and assessments.            |
| Technical Trainer            | Audience delivery and facilitator materials      | Delivered practical software workshops for 60 employees and authored accompanying facilitator guides. |

The learning-design example also rewrites the **same** portal achievement used in the frontend example as “Created accessible React interfaces for a training portal, with page load time reduced by 25%.” Summaries, project descriptions, skill selections and bullet ordering differ by role. The same approved project is described from each role's supported perspective. GraphQL, Articulate/SCORM and AWS certification requirements in the jobs do not become qualifications in these examples.

These are authored synthetic model-response fixtures, not live provider measurements. Tests send each real request through the typed client, Worker, mocked provider, structural/factuality guards, renderer adapter and Dexie storage. They verify the description and writing instructions reach the provider, rewrites survive without fallback, immutable fields stay unchanged, and exactly one call occurs. Negative fixtures verify unsupported certification wording is restored with a reason and job-only skill IDs reject the response without retry. Browser coverage generates/saves three distinct drafts, reopens an older role after another generation, and checks refinement retains the reopened job even when Match contains a different unsent description.

## Limits and validation

A prompt and deterministic guards cannot prove arbitrary semantic entailment or guarantee a live model always chooses the best emphasis. Unsupported free-text claims outside the focused guards can still escape; users must compare every rewrite against the approved source and explicitly review the resume. Sparse source evidence can legitimately limit how much two role versions differ. No paid provider evaluation was run or implied by the synthetic tests.

Run `npm test -- --maxWorkers=1`, `npm run test:ui`, `npm run test:legacy`, `npm run test:integration`, `npm run build:same-origin` and `npm run worker:check:same-origin`. No deployment or Cloudflare setting changes are part of this PR.
