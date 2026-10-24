import {
  endpoints,
  type Endpoint,
  type ApiInput,
  type ApiOutput,
} from "../../shared/contracts";
function safeRequestId(value: unknown): string | undefined {
  return typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value,
    )
    ? value
    : undefined;
}
export class ClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 0,
    public retryAfter?: number,
    public requestId?: string,
  ) {
    super(message + (requestId ? ` Reference: ${requestId}` : ""));
  }
}
export class DreamJobClient {
  constructor(
    public baseUrl: string,
    private fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
    private timeoutMs = 60000,
  ) {
    if (
      baseUrl &&
      !/^https:\/\//.test(baseUrl) &&
      !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)
    )
      throw Error("Use an HTTPS API origin");
    if (baseUrl && new URL(baseUrl).origin !== baseUrl)
      throw Error("API URL must be an origin without a path");
  }
  async call<K extends Endpoint>(
    endpoint: K,
    input: ApiInput<K>,
  ): Promise<ApiOutput<K>> {
    const parsed = endpoints[endpoint].request.safeParse(input);
    if (!parsed.success)
      throw new ClientError(
        "INVALID_INPUT",
        parsed.error.issues
          .map((i) => i.path.join(".") + ": " + i.message)
          .join("; "),
      );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.baseUrl}/api/${endpoint}`, {
        method: "POST",
        credentials: "include",
        redirect: "error",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!response.headers.get("Content-Type")?.includes("application/json"))
        throw new ClientError(
          response.status === 403 ? "ACCESS_DENIED" : "AUTH_REQUIRED",
          "Cloudflare Access returned a sign-in or denied page. Open the API sign-in link, then retry. If cookies are blocked, use the same-origin hosting option.",
          response.status,
        );
      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new ClientError(
          "INVALID_RESPONSE",
          "The server returned invalid JSON.",
          response.status,
        );
      }
      if (!response.ok)
        throw new ClientError(
          data.error?.code ||
            (response.status === 403
              ? "ACCESS_DENIED"
              : response.status === 401
                ? "AUTH_REQUIRED"
                : "API_ERROR"),
          data.error?.message || "API request failed.",
          response.status,
          Number(response.headers.get("Retry-After")) || undefined,
          safeRequestId(data.error?.requestId) ||
            safeRequestId(response.headers.get("X-Request-ID")),
        );
      const output = endpoints[endpoint].response.safeParse(data);
      if (!output.success)
        throw new ClientError(
          "INVALID_RESPONSE",
          "The response did not match the expected schema. No changes were applied.",
          502,
        );
      return output.data as ApiOutput<K>;
    } catch (e) {
      if (e instanceof ClientError) throw e;
      throw new ClientError(
        controller.signal.aborted ? "TIMEOUT" : "NETWORK_OR_ACCESS",
        controller.signal.aborted
          ? "The request timed out. Your input is unchanged."
          : "Could not reach the API. Check your connection and Cloudflare Access session. Cross-site cookies or an Access redirect may be blocked. Your input is unchanged.",
      );
    } finally {
      clearTimeout(timer);
    }
  }
  extractProfile(input: ApiInput<"extract-profile">) {
    return this.call("extract-profile", input);
  }
  analyzeJob(input: ApiInput<"analyze-job">) {
    return this.call("analyze-job", input);
  }
  generateResume(input: ApiInput<"generate-resume">) {
    return this.call("generate-resume", input);
  }
  refineResume(input: ApiInput<"refine-resume">) {
    return this.call("refine-resume", input);
  }
  signInUrl() {
    return `${this.baseUrl}/api/analyze-job`;
  }
}
