// Local workerd smoke check only; never contacts or deploys the production Worker.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const origin = "http://127.0.0.1:8791";
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--local",
    "--config",
    "wrangler.same-origin.jsonc",
    "--port",
    "8791",
    "--ip",
    "127.0.0.1",
    "--var",
    "ACCESS_AUD:local-smoke-test",
    "--var",
    "ACCESS_TEAM_DOMAIN:local-test.cloudflareaccess.com",
  ],
  {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  },
);
let log = "";
child.stdout.on("data", (d) => {
  log = (log + d).slice(-4000);
});
child.stderr.on("data", (d) => {
  log = (log + d).slice(-4000);
});
try {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw Error("Local Wrangler failed: " + log);
    try {
      const r = await fetch(origin, { signal: AbortSignal.timeout(1000) });
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(ready, "Local Worker did not become ready");
  const html = await (await fetch(origin)).text();
  assert(html.includes('id="root"'));
  assert(html.includes("/assets/"));
  assert(!html.includes("/dream_job/"));
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(
    (m) => m[1],
  );
  assert(assets.length >= 2);
  for (const asset of assets) {
    const r = await fetch(origin + asset);
    assert.equal(r.status, 200);
    assert(!r.headers.get("content-type").includes("text/html"));
  }
  const api = await fetch(origin + "/api/analyze-job", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://dream-job-api.tal070498.workers.dev",
    },
    body: "{}",
  });
  assert.equal(api.status, 401);
  assert.equal((await api.json()).error.code, "AUTH_REQUIRED");
  const unknown = await fetch(origin + "/api/not-a-route", {
    headers: { Accept: "text/html" },
  });
  assert.equal(unknown.status, 404);
  assert(unknown.headers.get("content-type").includes("application/json"));
  const denied = await fetch(origin + "/api/analyze-job", {
    method: "POST",
    headers: {
      Origin: "https://wrong-origin.test",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  console.log(
    JSON.stringify({
      runtime: "local workerd",
      staticHtml: 200,
      rootAssets: assets.length,
      unauthenticatedApi: 401,
      unknownApi: 404,
      wrongOrigin: 403,
    }),
  );
} finally {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once("exit", resolve);
  });
}
