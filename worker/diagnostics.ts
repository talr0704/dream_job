import type { Endpoint } from "../shared/contracts";
import type { z } from "zod";
export type Phase =
  | "schema_generation"
  | "provider_http"
  | "provider_envelope"
  | "completion"
  | "json_parse"
  | "zod_validation"
  | "validation_exception"
  | "response_validation"
  | "factuality"
  | "request";
export interface DiagnosticEvent {
  event: "ai_failure" | "request_failure";
  requestId: string;
  endpoint: Endpoint | "unknown";
  operation:
    "extract" | "analyze" | "generate" | "refine" | "audit" | "request";
  phase: Phase;
  code: string;
  providerStatus?: number;
  providerRequestId?: string;
  providerResponseId?: string;
  refused?: boolean;
  finishReason?:
    | "stop"
    | "length"
    | "content_filter"
    | "tool_calls"
    | "function_call"
    | "other";
  issues?: { path: string; code: string }[];
  issueCount?: number;
}
export interface DiagnosticContext {
  requestId: string;
  endpoint: Endpoint | "unknown";
  operation: DiagnosticEvent["operation"];
  log: (event: DiagnosticEvent) => void;
}
export function recordFailure(
  context: DiagnosticContext | undefined,
  phase: Phase,
  code: string,
  details: Pick<
    DiagnosticEvent,
    | "providerStatus"
    | "providerRequestId"
    | "providerResponseId"
    | "refused"
    | "finishReason"
    | "issues"
    | "issueCount"
  > = {},
) {
  if (!context) return;
  try {
    context.log({
      event: phase === "request" ? "request_failure" : "ai_failure",
      requestId: context.requestId,
      endpoint: context.endpoint,
      operation: context.operation,
      phase,
      code,
      ...details,
    });
  } catch {
    /* Logging must never change validation or request behavior. */
  }
}
export function safeProviderRequestId(
  value: string | null,
): string | undefined {
  return value && /^req_[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : undefined;
}
export function safeIssues(error: z.ZodError, knownFields: Set<string>) {
  const codes = new Set([
    "invalid_type",
    "too_big",
    "too_small",
    "invalid_format",
    "not_multiple_of",
    "unrecognized_keys",
    "invalid_union",
    "invalid_key",
    "invalid_element",
    "invalid_value",
    "custom",
  ]);
  return {
    issueCount: error.issues.length,
    issues: error.issues.slice(0, 12).map((i) => ({
      code: codes.has(i.code) ? i.code : "validation",
      path: i.path.length
        ? i.path
            .map((p) =>
              typeof p === "number"
                ? "[]"
                : typeof p === "string" && knownFields.has(p)
                  ? p
                  : "<field>",
            )
            .join(".")
        : "$",
    })),
  };
}
export function schemaFields(schema: unknown): Set<string> {
  const fields = new Set<string>();
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.properties)
      for (const key of Object.keys(node.properties)) fields.add(key);
    Object.values(node).forEach((v) => {
      if (Array.isArray(v)) v.forEach(visit);
      else visit(v);
    });
  };
  visit(schema);
  return fields;
}

export function safeProviderResponseId(value: unknown): string | undefined {
  return typeof value === "string" &&
    /^chatcmpl-[a-zA-Z0-9_-]{1,100}$/.test(value)
    ? value
    : undefined;
}
