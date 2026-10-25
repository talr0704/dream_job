import { it, expect, vi } from "vitest";
import { z } from "zod";
import { createWorker } from "../../worker/index";
import {
  structuredSchema,
  extractionSchema,
  assertStructuredSchema,
} from "../../worker/ai";
import { extractResponseSchema } from "../../shared/contracts";
import { profile, env, identity, mockAI } from "./fixtures";
import { DreamJobClient } from "../../src/lib/api";
import { DreamJobDB } from "../../src/lib/storage";
const text =
  "Private resume text: secret-person@example.test sk-do-not-log bearer-token-private";
const draft = { ...profile, verified: false };
const envelope = (content: unknown, finish = "stop", refusal: unknown = null) =>
  Response.json(
    {
      id: "chatcmpl-mock123",
      choices: [{ finish_reason: finish, message: { content, refusal } }],
    },
    { headers: { "x-request-id": "req_mock123" } },
  );
const request = () =>
  new Request("https://api.test/api/extract-profile", {
    method: "POST",
    headers: {
      Origin: env.ALLOWED_ORIGIN,
      "Content-Type": "application/json",
      "X-Request-ID": "attacker-controlled-id",
    },
    body: JSON.stringify({ text }),
  });
it.each([
  [
    "length",
    () => envelope('{"private":"' + text, "length"),
    502,
    "AI_INCOMPLETE",
    "completion",
  ],
  [
    "refusal",
    () => envelope(null, "stop", text),
    422,
    "AI_REFUSED",
    "completion",
  ],
  [
    "filter",
    () => envelope(null, "content_filter"),
    422,
    "AI_REFUSED",
    "completion",
  ],
  [
    "outer JSON",
    () => new Response(text, { headers: { "x-request-id": text } }),
    502,
    "INVALID_AI_RESPONSE",
    "provider_envelope",
  ],
  [
    "missing choice",
    () => Response.json({ choices: [] }),
    502,
    "INVALID_AI_RESPONSE",
    "provider_envelope",
  ],
  [
    "inner JSON",
    () => envelope(text),
    502,
    "INVALID_AI_RESPONSE",
    "json_parse",
  ],
  [
    "Zod validation",
    () =>
      envelope(
        JSON.stringify({
          profile: { ...draft, personal: { ...draft.personal, email: text } },
          warnings: [],
        }),
      ),
    502,
    "INVALID_AI_RESPONSE",
    "zod_validation",
  ],
  [
    "semantic duplicate fact IDs",
    () =>
      envelope(
        JSON.stringify({
          profile: { ...draft, skills: [...draft.skills, ...draft.skills] },
          warnings: [],
        }),
      ),
    502,
    "INVALID_AI_RESPONSE",
    "zod_validation",
  ],
  [
    "invalid link metadata",
    () =>
      envelope(
        JSON.stringify({
          profile: {
            ...draft,
            links: [
              {
                id: "link-invalid",
                label: "",
                url: "not a URL",
              },
            ],
          },
          warnings: [],
        }),
      ),
    502,
    "INVALID_AI_RESPONSE",
    "zod_validation",
  ],
  [
    "unsupported verified flag",
    () => envelope(JSON.stringify({ profile, warnings: [] })),
    502,
    "INVALID_AI_RESPONSE",
    "zod_validation",
  ],
  [
    "upstream 400",
    () => new Response(text, { status: 400 }),
    502,
    "AI_UNAVAILABLE",
    "provider_http",
  ],
] as const)(
  "distinguishes %s without logging data or changing approved IndexedDB records",
  async (_name, reply, status, code, phase) => {
    const db = new DreamJobDB("diagnostics-" + crypto.randomUUID());
    try {
      await db.approveProfile(profile, true);
      const before = await db.exportBackup();
      const log = vi.fn();
      const fetcher = vi.fn().mockImplementation(async () => reply());
      const w = createWorker({ authenticate: identity, fetcher, log });
      let server: Response;
      const client = new DreamJobClient(
        "https://api.test",
        async (url, init) => {
          server = await w.fetch(new Request(url, init), env);
          return server;
        },
      );
      let caught: any;
      try {
        await client.extractProfile({ text });
      } catch (e) {
        caught = e;
      }
      expect(caught).toMatchObject({ code, status });
      expect(caught.requestId).toMatch(/^[a-f0-9-]{36}$/);
      expect(caught.message).toContain(caught.requestId);
      expect(server!.headers.get("X-Request-ID")).toBe(caught.requestId);
      const events = log.mock.calls.map((c) => c[0]);
      const event = events.find((e) => e.phase === phase);
      expect(event).toMatchObject({
        requestId: caught.requestId,
        operation: "extract",
        endpoint: "extract-profile",
        code,
      });
      if (_name === "refusal") expect(event.refused).toBe(true);
      if (
        _name !== "outer JSON" &&
        _name !== "missing choice" &&
        _name !== "upstream 400"
      )
        expect(event.providerResponseId).toBe("chatcmpl-mock123");
      if (_name === "Zod validation")
        expect(event.issues).toContainEqual({
          path: "profile.personal.email",
          code: "invalid_format",
        });
      const logs = JSON.stringify(events);
      for (const secret of [
        text,
        profile.personal.fullName,
        profile.personal.email,
        env.OPENAI_API_KEY,
        "attacker-controlled-id",
      ])
        expect(logs).not.toContain(secret);
      const after = await db.exportBackup();
      expect({ ...after, exportedAt: before.exportedAt }).toEqual(before);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      await db.delete();
    }
  },
);
it("distinguishes failure in the audit call from failure in extraction", async () => {
  const log = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI({ profile: draft, warnings: [] }))
    .mockResolvedValueOnce(envelope("{broken " + text));
  const r = await createWorker({ authenticate: identity, fetcher, log }).fetch(
    request(),
    env,
  );
  expect(r.status).toBe(502);
  expect(log.mock.calls.map((c) => c[0])).toContainEqual(
    expect.objectContaining({
      operation: "audit",
      phase: "json_parse",
      code: "INVALID_AI_RESPONSE",
    }),
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("uses one extraction schema, rejects unsupported schema keywords and keeps semantic checks", () => {
  expect(extractionSchema).toBe(extractResponseSchema);
  const schema: any = structuredSchema(extractionSchema);
  assertStructuredSchema(schema);
  expect(schema.properties.profile.properties.verified).toMatchObject({
    enum: [false],
  });
  expect(schema.properties.profile.properties.version).toMatchObject({
    type: "integer",
    minimum: 1,
  });
  expect(() =>
    assertStructuredSchema({
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
      allOf: [],
    }),
  ).toThrow();
  expect(() =>
    structuredSchema(z.object({ value: z.unknown() }).strict()),
  ).toThrow();
  expect(
    extractionSchema.safeParse({
      profile: { ...draft, skills: [...draft.skills, ...draft.skills] },
      warnings: [],
    }).success,
  ).toBe(false);
});
it("rejects whitespace warnings consistently and bounds application-generated warnings", async () => {
  expect(
    extractionSchema.safeParse({ profile: draft, warnings: [" "] }).success,
  ).toBe(false);
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      mockAI({
        profile: draft,
        warnings: Array.from({ length: 50 }, (_, i) => "Review field " + i),
      }),
    )
    .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
  const r = await createWorker({
    authenticate: identity,
    fetcher,
    log: () => {},
  }).fetch(request(), env);
  expect(r.status).toBe(200);
  const output = await r.json();
  expect(extractResponseSchema.safeParse(output).success).toBe(true);
  expect((output as any).warnings).toHaveLength(50);
});
it("retains safe diagnostics if validation rejects an unexpected field, and ignores logging failures", async () => {
  const log = vi.fn();
  const response = envelope(
    JSON.stringify({
      profile: { ...draft, personal: { ...draft.personal, [text]: text } },
      warnings: [],
    }),
  );
  await createWorker({
    authenticate: identity,
    fetcher: vi.fn().mockResolvedValue(response),
    log,
  }).fetch(request(), env);
  expect(JSON.stringify(log.mock.calls)).not.toContain(text);
  const good = vi
    .fn()
    .mockResolvedValueOnce(mockAI({ profile: draft, warnings: [] }))
    .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
  expect(
    (
      await createWorker({
        authenticate: identity,
        fetcher: good,
        log: () => {
          throw Error(text);
        },
      }).fetch(request(), env)
    ).status,
  ).toBe(200);
});
it("does not treat a valid proposed extraction as approval or save it automatically", async () => {
  const db = new DreamJobDB("proposed-" + crypto.randomUUID());
  try {
    await db.approveProfile(profile, true);
    const before = await db.professionalProfiles.toArray();
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(mockAI({ profile: draft, warnings: [] }))
      .mockResolvedValueOnce(mockAI({ supported: true, reasons: [] }));
    const w = createWorker({ authenticate: identity, fetcher, log: () => {} });
    const client = new DreamJobClient("https://api.test", async (url, init) =>
      w.fetch(new Request(url, init), env),
    );
    const output = await client.extractProfile({ text });
    expect(output.profile.verified).toBe(false);
    expect(await db.professionalProfiles.toArray()).toEqual(before);
    expect(await db.profileVersions.count()).toBe(1);
  } finally {
    await db.delete();
  }
});
it("correlates factuality audit rejection without logging audit reasons", async () => {
  const log = vi.fn();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(mockAI({ profile: draft, warnings: [] }))
    .mockResolvedValueOnce(mockAI({ supported: false, reasons: [text] }));
  const r = await createWorker({ authenticate: identity, fetcher, log }).fetch(
    request(),
    env,
  );
  expect(r.status).toBe(422);
  expect(log.mock.calls.map((c) => c[0])).toContainEqual(
    expect.objectContaining({
      operation: "audit",
      phase: "factuality",
      code: "UNSUPPORTED_CLAIM",
    }),
  );
  expect(JSON.stringify(log.mock.calls)).not.toContain(text);
});
