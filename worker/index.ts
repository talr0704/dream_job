import { z } from "zod";
import {
  endpoints,
  type Endpoint,
  validateAnalysis,
  validateResume,
  tailoredResumeSchema,
} from "../shared/contracts";
import { verifyAccess, accessIssuer, type AccessConfig } from "./auth";
import {
  structured,
  audit,
  extractionSchema,
  factsFor,
  type AIEnv,
} from "./ai";
import { analyzeJob } from "./job-analysis";
import { tailor } from "./tailoring";
import { tailorFromEvidence } from "./evidence-tailoring";
import { ApiError } from "./errors";
import { optionalUrlReviewWarnings, extractionInstruction } from "./extraction";
import {
  recordFailure,
  safeIssues,
  schemaFields,
  type DiagnosticContext,
  type DiagnosticEvent,
} from "./diagnostics";
import { structuredSchema } from "./ai";
export interface Env extends AccessConfig, AIEnv {
  ALLOWED_ORIGIN: string;
  AI_RATE_LIMITER?: {
    limit(input: { key: string }): Promise<{ success: boolean }>;
  };
}
const MAX_BODY = 256 * 1024;
async function readBody(request: Request, signal: AbortSignal) {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  )
    throw new ApiError("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  const length = request.headers.get("content-length");
  if (length && Number(length) > MAX_BODY)
    throw new ApiError(
      "BODY_TOO_LARGE",
      "Maximum request size is 256 KiB.",
      413,
    );
  if (!request.body)
    throw new ApiError("INVALID_JSON", "A JSON body is required.");
  const reader = request.body.getReader();
  const onAbort = () => {
    void reader.cancel();
  };
  signal.addEventListener("abort", onAbort, { once: true });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) {
        await reader.cancel();
        throw new ApiError(
          "BODY_TOO_LARGE",
          "Maximum request size is 256 KiB.",
          413,
        );
      }
      chunks.push(value);
    }
    if (signal.aborted)
      throw new ApiError("TIMEOUT", "Request body timed out.", 504);
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      bytes.set(c, offset);
      offset += c.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new ApiError("INVALID_JSON", "The request body is not valid JSON.");
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
export function createWorker(
  deps: {
    fetcher?: typeof fetch;
    authenticate?: typeof verifyAccess;
    log?: (event: DiagnosticEvent) => void;
  } = {},
) {
  return {
    async fetch(request: Request, env: Env): Promise<Response> {
      const requestId = crypto.randomUUID();
      const context: DiagnosticContext = {
        requestId,
        endpoint: "unknown",
        operation: "request",
        log: deps.log || ((event) => console.warn(JSON.stringify(event))),
      };
      const origin = request.headers.get("Origin");
      const headers: Record<string, string> = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        Vary: "Origin",
        "X-Content-Type-Options": "nosniff",
        "X-Request-ID": requestId,
      };
      const reply = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 55000);
      const abort = () => controller.abort();
      request.signal.addEventListener("abort", abort, { once: true });
      try {
        try {
          accessIssuer(env);
        } catch {
          throw new ApiError(
            "CONFIGURATION_ERROR",
            "Access configuration is incomplete.",
            503,
          );
        }
        let allowed: URL;
        try {
          allowed = new URL(env.ALLOWED_ORIGIN);
        } catch {
          throw new ApiError(
            "CONFIGURATION_ERROR",
            "Allowed origin is missing.",
            503,
          );
        }
        if (
          allowed.origin !== env.ALLOWED_ORIGIN ||
          (allowed.protocol !== "https:" &&
            !["localhost", "127.0.0.1"].includes(allowed.hostname))
        )
          throw new ApiError(
            "CONFIGURATION_ERROR",
            "Invalid allowed origin configuration.",
            503,
          );
        if (origin && origin !== env.ALLOWED_ORIGIN)
          throw new ApiError(
            "ORIGIN_DENIED",
            "This origin is not allowed.",
            403,
          );
        if (origin)
          Object.assign(headers, {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Expose-Headers": "Retry-After, X-Request-ID",
          });
        const path = new URL(request.url).pathname;
        const endpoint = path.replace(/^\/api\//, "") as Endpoint;
        if (
          !Object.prototype.hasOwnProperty.call(endpoints, endpoint) ||
          path !== `/api/${endpoint}`
        )
          throw new ApiError("NOT_FOUND", "Endpoint not found.", 404);
        context.endpoint = endpoint;
        if (request.method === "OPTIONS") {
          if (
            !origin ||
            request.headers.get("Access-Control-Request-Method") !== "POST" ||
            (request.headers.get("Access-Control-Request-Headers") || "")
              .split(",")
              .filter(Boolean)
              .some((h) => !["content-type"].includes(h.trim().toLowerCase()))
          )
            throw new ApiError(
              "PREFLIGHT_DENIED",
              "Unsupported preflight.",
              403,
            );
          return new Response(null, {
            status: 204,
            headers: {
              ...headers,
              "Access-Control-Allow-Methods": "POST, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type",
              "Access-Control-Max-Age": "600",
            },
          });
        }
        if (request.method !== "POST") {
          headers.Allow = "POST, OPTIONS";
          throw new ApiError("METHOD_NOT_ALLOWED", "Use POST.", 405);
        }
        const identity = await (deps.authenticate || verifyAccess)(
          request,
          env,
        ).catch(() => {
          throw new ApiError(
            "AUTH_REQUIRED",
            "Sign in with Cloudflare Access, then retry.",
            401,
          );
        });
        if (!env.OPENAI_API_KEY || !env.OPENAI_MODEL)
          throw new ApiError(
            "CONFIGURATION_ERROR",
            "AI configuration is incomplete.",
            503,
          );
        const raw = await readBody(request, controller.signal);
        const parsed = endpoints[endpoint].request.safeParse(raw);
        if (!parsed.success)
          throw new ApiError(
            "INVALID_INPUT",
            "Input validation failed: " +
              parsed.error.issues
                .slice(0, 5)
                .map((i) => i.path.join(".") + ": " + i.message)
                .join("; "),
            400,
          );
        if (env.AI_RATE_LIMITER) {
          let limit;
          try {
            limit = await env.AI_RATE_LIMITER.limit({ key: identity.sub });
          } catch {
            throw new ApiError(
              "RATE_LIMIT_UNAVAILABLE",
              "Usage protection unavailable.",
              503,
            );
          }
          if (!limit.success)
            throw new ApiError(
              "RATE_LIMITED",
              "Usage limit reached. Retry later.",
              429,
              60,
            );
        } else
          throw new ApiError(
            "RATE_LIMIT_UNAVAILABLE",
            "Configure the Cloudflare rate limit binding before enabling paid requests.",
            503,
          );
        const input: any = parsed.data;
        const fetcher = deps.fetcher || fetch;
        let output: unknown;
        if (endpoint === "extract-profile") {
          context.operation = "extract";
          const extracted = await structured(
            env,
            extractionSchema,
            extractionInstruction,
            input,
            controller.signal,
            fetcher,
            context,
          );
          extracted.profile = {
            ...extracted.profile,
            id: crypto.randomUUID(),
            version: 1,
            verified: false,
            updatedAt: new Date().toISOString(),
          };
          const missing = Object.entries(extracted.profile.personal)
            .filter(([, value]) => !value)
            .map(([key]) => `Missing ${key}; review before approval.`);
          extracted.warnings = [
            ...new Set([
              ...optionalUrlReviewWarnings(extracted.profile),
              ...extracted.warnings,
              ...missing,
            ]),
          ].slice(0, 50);
          output = extracted;
        } else if (endpoint === "analyze-job") {
          context.operation = "analyze";
          output = await analyzeJob(
            env,
            input,
            controller.signal,
            fetcher,
            context,
          );
        } else if (input.formatVersion === 2) {
          context.operation =
            endpoint === "generate-resume" ? "generate" : "refine";
          if (input.strategy === "evidence")
            headers["X-Dream-Job-Engine"] = "evidence-v1";
          output = await (
            input.strategy === "evidence" ? tailorFromEvidence : tailor
          )(
            env,
            input.profile,
            input.jobDescription,
            input.content,
            input.instructions,
            controller.signal,
            fetcher,
            context,
          );
        } else {
          context.operation =
            endpoint === "generate-resume" ? "generate" : "refine";
          if (endpoint === "generate-resume" && input.analysis) {
            const { score, ...draft } = input.analysis;
            const checked = validateAnalysis(draft, input.profile);
            if (score !== checked.score)
              throw new ApiError(
                "INVALID_INPUT",
                "Job analysis score is inconsistent.",
                400,
              );
          } else if (endpoint === "refine-resume")
            validateResume(input.resume, input.profile);
          const draft = await structured(
            env,
            tailoredResumeSchema,
            endpoint === "generate-resume"
              ? "Tailor a resume. Metadata is selected by IDs, never rewritten. Each achievement must cite only the achievements of its own record."
              : "Refine the current resume according to requested edits, within the master profile facts. Never modify the profile.",
            { ...input, ...factsFor(input.profile) },
            controller.signal,
            fetcher,
            context,
          );
          output = validateResume(draft, input.profile);
          await audit(env, input, output, controller.signal, fetcher, context);
        }
        const final = endpoints[endpoint].response.safeParse(output);
        if (!final.success) {
          recordFailure(
            context,
            "response_validation",
            "INVALID_AI_RESPONSE",
            safeIssues(
              final.error,
              schemaFields(structuredSchema(endpoints[endpoint].response)),
            ),
          );
          throw new ApiError(
            "INVALID_AI_RESPONSE",
            "AI output failed final validation. No changes were saved.",
            502,
          );
        }
        return reply(final.data);
      } catch (error) {
        const e =
          error instanceof ApiError
            ? error
            : error instanceof z.ZodError
              ? new ApiError(
                  "INVALID_AI_RESPONSE",
                  "AI output failed validation.",
                  502,
                )
              : new ApiError(
                  "REQUEST_FAILED",
                  "The request could not be completed safely.",
                  502,
                );
        recordFailure(context, "request", e.code);
        if (e.retryAfter) headers["Retry-After"] = String(e.retryAfter);
        return reply(
          { error: { code: e.code, message: e.message, requestId } },
          e.status,
        );
      } finally {
        clearTimeout(timeout);
        request.signal.removeEventListener("abort", abort);
      }
    },
  };
}
export default createWorker();
