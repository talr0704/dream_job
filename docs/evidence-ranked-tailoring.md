# Evidence-ranked resume composition

## Investigation and architectural change

The previous generator received nearly the full approved profile, its generic headline/summary and a job description. It was responsible for discovering relevance and writing in the same unstructured selection task. The schema permitted rewriting, but did not require source references for summary or granular project details. Skills could include the complete inventory. The renderer always copied the master headline. The guard could restore the broad master summary or complete project description. Prompt wording alone could not fix these boundaries.

The professional profile already stores stable-ID experience achievements, project achievements, skills and general facts, with provenance. It can represent adequate granularity; extraction was not explicitly asking for distinct project accomplishments. Existing project descriptions can contain multiple professional facts in one paragraph. We preserve all master records and build a read-only evidence catalog per approved snapshot. Future extraction explicitly asks for separate achievements under their owning record, still requiring approval. No existing profile is automatically re-extracted, split in storage or rewritten.

The new primary path is:

1. Parse job responsibilities and requirements into ranked capability priorities. Recognize a small, explicit vocabulary of requirements, feedback, interfaces, learning, training, web platforms, quality, AI integration and delivery. Preferred clauses receive lower weight. Unknown areas use an exact-word fallback with a warning.
2. Index approved achievements, skills, project details and general facts. Project paragraphs are split into exact sentence/newline spans with deterministic snapshot-local references; the original record and canonical IDs remain untouched. References use the owning project ID, survive project reordering, avoid reserved-prefix collisions and support non-ASCII IDs. Parent context remains available to the writer for negation, qualifiers and pronouns.
3. Rank by capability alignment plus normalized lexical overlap. Retrieve at most three achievements per employment record, three projects with up to three details each, eight relevant skills and two general facts. Weak incidental word overlap is filtered when capability evidence exists. These budgets bound the first draft and are explicit code, not an AI rewrite quota.
4. Assemble a truthful capability headline and skill order in application logic. Headline labels must be supported by retrieved evidence and do not assert a new job title. All employment headers remain in approved chronology, even if no achievement is relevant.
5. Make exactly one structured-output writing call. It sees ranked approved evidence, target priorities and protected employment context, not the generic master headline or the previous resume during generation. It writes a complete summary, selected/restructured bullets and project descriptions. It does not ask users what to include. Refinement can see an untrusted current draft and its still-approved source references; draft text is never indexed as a new fact.
6. Validate structure, ownership, retrieved scope, source references and focused claim guards. Render the existing HTML/PDF model from copied immutable facts plus generated content. User review is approval/correction of the completed draft.

Optional `/api/analyze-job` remains independent. There is no extra model call, semantic audit service, retry loop, embedding service, cloud database or framework.

## Contract and factuality

The public v2 content object gains optional reader/storage extensions:

```typescript
headline?: { text: string; sourceFactIds: string[] };
summarySourceFactIds?: string[];
// each selected project:
sourceFactIds?: string[];
```

Old records retain their original headline fallback and project behavior. The new provider schema requires summary/project references and does not contain headline or skill fields; application logic supplies those. Its fields are all required as OpenAI Structured Outputs expects. The compatibility provider has its own original shape so optional storage fields do not produce invalid provider schemas.

New frontend generation/refinement sends `formatVersion:2, strategy:"evidence"`. Clients omitting the strategy retain the previous v2 one-call writer for compatibility; unversioned legacy resume writes retain their existing protection. Responses carry `X-Dream-Job-Engine: evidence-v1` for same-origin Network inspection after deployment.

Unknown, duplicate, non-retrieved or cross-record references reject the AI response without repair/retry. Experience bullets still cite exactly one approved achievement in their own experience; the array shape remains ready for a separately validated same-experience combination feature. Project descriptions may combine selected facts of the same project, with explicit references.

Numbers/units, new URLs, markup and selected qualification/responsibility terms remain guarded. WordPress and SEO cannot be introduced unless present in the cited approved evidence. Formal Product Manager claims are conservatively blocked when approved employment titles do not establish that role. Job-only requirements are reported as missing evidence. These focused rules are not universal semantic entailment checks.

A failed summary/project rewrite restores complete cited approved facts with a warning, rather than the generic master resume/entire unrelated project. Fallback never cuts a fact mid-word or mid-number. Headline corrections, source changes and manual edits invalidate review. Users can correct cited evidence using approved-source controls; those controls are optional corrections, not prerequisites for the first draft. Identity, contacts, employers, factual employment titles/dates, education, certifications, languages and URLs remain application-owned.

## Semantic evaluation and honest limits

`node scripts/evaluate-tailoring.mjs` performs a zero-provider-call evaluation and writes `artifacts/evidence-evaluation.json`. One synthetic approved profile contains independently labelled product, interface and learning achievements. The metric is precision of the top three selected facts against those capability labels, not edit distance or changed-word counts. Renaming a role while retaining its responsibilities must not change retrieval.

The current fixture scores 1.00 for each role. The actual selected fact groups are different, as are source details of the same project, headlines and ordered skills:

| Role                         | Top evidence  | Capability headline                      | Ordered skills                             |
| ---------------------------- | ------------- | ---------------------------------------- | ------------------------------------------ |
| Product Manager              | pm2, pm1, pm3 | Requirements Analysis / Project Delivery | Requirements Analysis, User Feedback       |
| Frontend Developer           | fe3, fe1, fe2 | Web Interfaces / Web Platforms           | React, TypeScript, HTML, CSS, QA & Testing |
| Learning Experience Designer | lx1, lx3, lx2 | Learning Design                          | Learning Design, Assessment Design         |

The table is a small deterministic fixture result, not a general accuracy claim. Wording tests use authored provider fixtures and full Worker/client/storage/browser paths; they verify substantial supported rewrites survive, not that a live model always writes well. Regression tests also verify actual new-strategy request routing, completed drafts before review, source comparison, immutable prior employment, saved drafts, backup/digest roundtrips, unsupported claims, quotas/authentication and real one-page PDF annotations.

For an explicitly authorized small live writing evaluation, set OPENAI_API_KEY securely and allow api.openai.com, then run `node scripts/evaluate-tailoring.mjs --live`. It uses only the fixed synthetic fixture and configured model, at most three sequential calls, no retries, and a 2,000-output-token cap per call (evaluation only; production limits are unchanged). It records generated wording, guard-restored/copied/rewritten counts and returned token usage in ignored local artifacts. Partial usage is retained if a later response fails. No price is assumed; account-specific cost must be calculated from usage/current rates. The current environment has no key, so live mode has not been run and live writing quality remains unmeasured.

The capability vocabulary is deliberately limited and English-specific. Sparse or compound approved facts, unfamiliar job domains, ambiguous priorities, qualifier interpretation and unsupported claims outside focused patterns remain limitations. Exact project spans are syntactic retrieval units, not proof of independent factual entailment; the writer sees parent context and the user must review. More source detail should be added/extracted and approved, never fabricated. The supplied CVTRY1/2 outputs motivated the negative baseline (fixed developer headline, full inventory, broad project copy); they were not promoted into approved source facts or committed as private test fixtures.

## Data, rollout and deployment

No Dexie store/index version changes or destructive migration occurs. Source snapshots, canonical IDs, history, manual overlays and old backups remain. New cited content uses existing v2 resume/backup containers with validated optional extensions; review digests bind the extended content to its exact profile snapshot. Older strict readers may reject these new extensions: rollback must retain updated readers, or disable the evidence strategy while keeping those readers. Export a backup before upgrading; never clear IndexedDB.

Deploy frontend and Worker together from the reviewed branch/main with the existing `wrangler.same-origin.jsonc`, after approval. The normal wrapper reruns tests, same-origin build and dry-run before its interactive deployment confirmation. The existing Worker, Access configuration, secret, rate limit, CORS and PDF template are unchanged. Hard-refresh without clearing local data, generate fresh drafts, and verify `/api/generate-resume` requests include strategy evidence and responses identify engine evidence-v1. No merge, deployment or Cloudflare change is performed by this implementation.
