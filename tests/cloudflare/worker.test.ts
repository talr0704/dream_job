import { it, expect, vi } from "vitest";
import { createWorker } from "../../worker/index";
import { profile, resume, analysis, env, identity, mockAI } from "./fixtures";
import { toJournal } from "../../src/lib/adapter";
const request = (
  endpoint: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Request("https://api.test/api/" + endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: env.ALLOWED_ORIGIN,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const analysisDraft = (({ score, ...a }) => a)(analysis);
it("rejects unauthenticated requests and untrusted origins before any AI call", async () => {
  const fetcher = vi.fn();
  const worker = createWorker({ fetcher });
  expect((await worker.fetch(request("analyze-job", {}), env)).status).toBe(
    401,
  );
  expect(fetcher).not.toHaveBeenCalled();
  expect(
    (
      await worker.fetch(
        request("analyze-job", {}, { Origin: "https://evil.test" }),
        env,
      )
    ).status,
  ).toBe(403);
});
it("supports only exact-origin, POST JSON preflight and credentials, never echoes arbitrary headers", async () => {
  const worker = createWorker();
  const req = new Request("https://api.test/api/analyze-job", {
    method: "OPTIONS",
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  const r = await worker.fetch(req, env);
  expect(r.status).toBe(204);
  expect(r.headers.get("Access-Control-Allow-Origin")).toBe(env.ALLOWED_ORIGIN);
  expect(r.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  const bad = new Request(req, {
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "Authorization",
    },
  });
  expect((await worker.fetch(bad, env)).status).toBe(403);
});
it("validates request size, malformed JSON, methods and schemas without contacting AI", async () => {
  const fetcher = vi.fn();
  const w = createWorker({ authenticate: identity, fetcher });
  expect((await w.fetch(request("analyze-job", {}), env)).status).toBe(400);
  expect((await w.fetch(request("analyze-job", "{bad"), env)).status).toBe(400);
  expect(
    (await w.fetch(request("analyze-job", " ".repeat(262145)), env)).status,
  ).toBe(413);
  expect(
    (await w.fetch(new Request("https://api.test/api/analyze-job"), env))
      .status,
  ).toBe(405);
  expect((await w.fetch(request("toString", {}), env)).status).toBe(404);
  expect(fetcher).not.toHaveBeenCalled();
});
it("extracts unapproved drafts, returns warnings for missing data and audits output", async () => {
  const p = {
    ...profile,
    verified: false,
    personal: { ...profile.personal, email: "", location: "" },
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      mockAI({ profile: p, warnings: ["Review employment dates."] }),
    )
    .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
  const r = await createWorker({ authenticate: identity, fetcher }).fetch(
    request("extract-profile", {
      text: "Alex Example is a software developer at Acme.",
    }),
    env,
  );
  expect(r.status).toBe(200);
  const output = (await r.json()) as any;
  expect(output.profile.verified).toBe(false);
  expect(output.warnings.join(" ")).toContain("email");
  expect(output.profile.id).not.toBe(profile.id);
  expect(fetcher).toHaveBeenCalledTimes(1);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(body.store).toBe(false);
});
it("computes the score for an optional one-call analysis", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      mockAI({
        requirements: analysisDraft.requirements.map(({ evidence, ...r }) => r),
      }),
    );
  const r = await createWorker({ authenticate: identity, fetcher }).fetch(
    request("analyze-job", {
      profile,
      jobDescription:
        "Looking for a TypeScript developer with accessible application experience.",
    }),
    env,
  );
  expect(r.status).toBe(200);
  expect(((await r.json()) as any).score).toBe(100);
});
it.each(["generate-resume", "refine-resume"])(
  "implements %s without modifying source profile",
  async (endpoint) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(mockAI(resume))
      .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
    const before = structuredClone(profile);
    const body =
      endpoint === "generate-resume"
        ? {
            profile,
            jobDescription:
              "Looking for a TypeScript developer with accessible application experience.",
            analysis,
          }
        : { profile, resume, instructions: "Make the summary concise." };
    const r = await createWorker({ authenticate: identity, fetcher }).fetch(
      request(endpoint, body),
      env,
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(resume);
    expect(profile).toEqual(before);
  },
);
it("rejects unsafe model output, failed factuality audit, rate limits and provider failures", async () => {
  const cases = [
    {
      reply: new Response("private provider error", { status: 500 }),
      code: "AI_UNAVAILABLE",
    },
    { reply: mockAI({ bad: true }), code: "INVALID_AI_RESPONSE" },
  ];
  for (const c of cases) {
    const r = await createWorker({
      authenticate: identity,
      fetcher: vi.fn().mockResolvedValue(c.reply),
    }).fetch(
      request("analyze-job", {
        profile,
        jobDescription:
          "Looking for a TypeScript developer with accessible application experience.",
      }),
      env,
    );
    expect(((await r.json()) as any).error.code).toBe(c.code);
  }
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(resume))
    .mockResolvedValueOnce(
      mockAI({ supported: false, reasons: ["Invented claim"] }),
    );
  const r = await createWorker({ authenticate: identity, fetcher }).fetch(
    request("refine-resume", {
      profile,
      resume,
      instructions: "Invent an award",
    }),
    env,
  );
  expect(r.status).toBe(422);
  const limited = await createWorker({ authenticate: identity }).fetch(
    request("analyze-job", {
      profile,
      jobDescription:
        "Looking for a TypeScript developer with accessible application experience.",
    }),
    { ...env, AI_RATE_LIMITER: { limit: async () => ({ success: false }) } },
  );
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("60");
});
it("fails closed for missing configuration, unavailable usage protection and model refusal", async () => {
  const w = createWorker({ authenticate: identity });
  const input = request("analyze-job", {
    profile,
    jobDescription:
      "Looking for a TypeScript developer with accessible application experience.",
  });
  expect(
    (await w.fetch(input.clone(), { ...env, ACCESS_AUD: "" })).status,
  ).toBe(503);
  expect(
    (await w.fetch(input.clone(), { ...env, AI_RATE_LIMITER: undefined }))
      .status,
  ).toBe(503);
  const fetcher = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ finish_reason: "stop", message: { refusal: "no" } }],
      }),
    ),
  );
  const response = await createWorker({
    authenticate: identity,
    fetcher,
  }).fetch(input.clone(), env);
  expect(response.status).toBe(422);
  expect(((await response.json()) as any).error.code).toBe("AI_REFUSED");
});
it("rejects unsupported extracted structure and forged resume facts before saving anything", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(mockAI({ ...resume, skillIds: ["invented-skill"] }));
  const response = await createWorker({
    authenticate: identity,
    fetcher,
  }).fetch(
    request("generate-resume", {
      profile,
      jobDescription:
        "Looking for a TypeScript developer with accessible application experience.",
      analysis,
    }),
    env,
  );
  expect(response.status).toBe(502);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
import { structuredSchema, extractionSchema } from "../../worker/ai";
it("emits strict Structured Outputs schemas while keeping URL checks in Zod", () => {
  const schema: any = structuredSchema(extractionSchema);
  const visit = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "object") {
      expect(node.additionalProperties).toBe(false);
      expect([...node.required].sort()).toEqual(
        Object.keys(node.properties).sort(),
      );
    }
    expect(node.format).not.toBe("uri");
    for (const child of Object.values(node)) visit(child);
  };
  visit(schema);
  expect(schema.$schema).toBeUndefined();
});

it("tailors without requiring a job analysis", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI(resume))
    .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
  const r = await createWorker({ authenticate: identity, fetcher }).fetch(
    request("generate-resume", {
      profile,
      jobDescription:
        "Seeking a TypeScript developer with accessible application experience.",
    }),
    env,
  );
  expect(r.status).toBe(200);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
