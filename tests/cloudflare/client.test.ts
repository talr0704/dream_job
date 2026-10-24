import { it, expect, vi } from "vitest";
import { DreamJobClient } from "../../src/lib/api";
import { profile, analysis } from "./fixtures";
const input = {
  profile,
  jobDescription:
    "Looking for a TypeScript developer with accessible application experience.",
};
it("validates both sides, includes cookies, rejects redirects and preserves caller input", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json(analysis));
  const client = new DreamJobClient("https://api.test", fetcher);
  expect((await client.analyzeJob(input)).score).toBe(100);
  expect(fetcher.mock.calls[0][1]).toMatchObject({
    credentials: "include",
    redirect: "error",
    method: "POST",
  });
  await expect(
    client.extractProfile({ text: "too short" }),
  ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  expect(input.profile).toEqual(profile);
});
it("handles HTML login, expired session, rate limit, invalid response, network and timeout", async () => {
  for (const [response, code] of [
    [
      new Response("<html>Access login</html>", {
        headers: { "Content-Type": "text/html" },
      }),
      "AUTH_REQUIRED",
    ],
    [
      Response.json(
        { error: { code: "AUTH_REQUIRED", message: "Sign in" } },
        { status: 401 },
      ),
      "AUTH_REQUIRED",
    ],
    [
      Response.json(
        { error: { code: "RATE_LIMITED", message: "Wait" } },
        { status: 429, headers: { "Retry-After": "60" } },
      ),
      "RATE_LIMITED",
    ],
    [Response.json({ bad: true }), "INVALID_RESPONSE"],
  ] as const) {
    await expect(
      new DreamJobClient(
        "https://api.test",
        vi.fn().mockResolvedValue(response),
      ).analyzeJob(input),
    ).rejects.toMatchObject({ code });
  }
  await expect(
    new DreamJobClient(
      "",
      vi.fn().mockRejectedValue(Error("offline")),
    ).analyzeJob(input),
  ).rejects.toMatchObject({ code: "NETWORK_OR_ACCESS" });
  const slow = vi.fn(
    (_url, init) =>
      new Promise<Response>((_, reject) =>
        init.signal.addEventListener("abort", () => reject(Error("aborted"))),
      ),
  );
  await expect(
    new DreamJobClient("", slow, 5).analyzeJob(input),
  ).rejects.toMatchObject({ code: "TIMEOUT" });
});
it("distinguishes an Access denied HTML response from an expired login", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      new Response("<html>Denied</html>", {
        status: 403,
        headers: { "Content-Type": "text/html" },
      }),
    );
  await expect(
    new DreamJobClient("https://api.test", fetcher).analyzeJob(input),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED", status: 403 });
});
