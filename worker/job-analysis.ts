import { z } from "zod";
import {
  analysisDraftSchema,
  analyzeRequestSchema,
  allFactEntries,
  validateAnalysis,
  type JobAnalysis,
} from "../shared/contracts";
import { structured, type AIEnv } from "./ai";
import { ApiError } from "./errors";
import { recordFailure, type DiagnosticContext } from "./diagnostics";
// Optional estimate only. Candidate evidence/narratives are assembled by code;
// this result is never a source for resume generation or profile changes.
export const optionalAnalysisSchema = z
  .object({
    requirements: z
      .array(
        analysisDraftSchema.shape.requirements.element.omit({ evidence: true }),
      )
      .min(1)
      .max(40),
  })
  .strict();
export async function analyzeJob(
  env: AIEnv,
  input: z.infer<typeof analyzeRequestSchema>,
  signal: AbortSignal,
  fetcher: typeof fetch,
  context?: DiagnosticContext,
): Promise<JobAnalysis> {
  const facts = Object.fromEntries(allFactEntries(input.profile));
  const draft = await structured(
    env,
    optionalAnalysisSchema,
    "Provide an optional job-fit estimate in English. Extract requirement as an exact substring of jobDescription, never invent a role requirement. Assign unique requirement IDs. Mandatory=true only for mandatory requirements; preferred=false. Candidate facts are exclusively keys/values of candidateFacts, not the job text. met means direct supporting evidence, partial means honest partial/transferable alignment, missing means not evidenced (not confirmed lack of experience). met/partial must cite supporting existing candidateFacts keys. missing MUST cite []. Never fabricate qualifications or facts, never cite job requirement IDs as candidate facts. This estimate is not approval of qualifications and will never be used to author the resume. Return only the requirement selections, no candidate narratives or score.",
    { jobDescription: input.jobDescription, candidateFacts: facts },
    signal,
    fetcher,
    context,
  );
  const normalized = (v: string) => v.replace(/\s+/g, " ").trim();
  try {
    if (
      draft.requirements.some(
        (r) =>
          !normalized(input.jobDescription).includes(normalized(r.requirement)),
      )
    )
      throw Error("Unsourced requirement");
    const requirements = draft.requirements.map((r) => ({
      ...r,
      evidence:
        r.status === "missing"
          ? "Not evidenced in the approved profile. This does not establish a lack of experience."
          : "Cited approved profile facts support this estimated alignment; review the original evidence.",
    }));
    const skillMatches = input.profile.skills.filter((s) =>
      requirements.some(
        (r) => r.status !== "missing" && r.sourceFactIds.includes(s.id),
      ),
    );
    return validateAnalysis(
      {
        jobTitle: input.jobTitle || "Job fit estimate",
        requirements,
        strengths: skillMatches.slice(0, 30).map((s) => s.text),
        gaps: requirements
          .filter((r) => r.status === "missing")
          .slice(0, 30)
          .map((r) => r.requirement),
        recommendations: [
          "Review the approved evidence and clarify missing qualifications before claiming them.",
          "Generate your resume independently using only approved professional information.",
        ],
        experienceAlignment:
          "This is an AI alignment estimate, not verification of qualifications or a prediction of hiring success. Missing evidence remains unknown. Resume generation is independent.",
      },
      input.profile,
    );
  } catch {
    recordFailure(context, "factuality", "INVALID_ANALYSIS_REFERENCE");
    throw new ApiError(
      "INVALID_AI_RESPONSE",
      "The optional analysis did not reference the supplied sources correctly. Resume generation is still available.",
      502,
    );
  }
}
