// Never run automatically from CI. This targets the existing Worker only.
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
const sameOrigin = process.argv.includes("--same-origin");
const configFile = sameOrigin ? "wrangler.same-origin.jsonc" : "wrangler.jsonc";
const config = JSON.parse(
  await readFile(new URL("../" + configFile, import.meta.url), "utf8"),
);
if (config.name !== "dream-job-api")
  throw Error("Refusing to deploy to a different Worker.");
for (const key of [
  "OPENAI_MODEL",
  "ALLOWED_ORIGIN",
  "ACCESS_AUD",
  "ACCESS_TEAM_DOMAIN",
])
  if (!config.vars[key]?.trim())
    throw Error(
      `Set ${key} from the existing application configuration before deployment.`,
    );
const origin = new URL(config.vars.ALLOWED_ORIGIN);
if (
  origin.origin !== config.vars.ALLOWED_ORIGIN ||
  origin.protocol !== "https:"
)
  throw Error("Production ALLOWED_ORIGIN must be an exact HTTPS origin.");
if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(config.vars.ACCESS_TEAM_DOMAIN))
  throw Error("Use the existing Access team hostname without https://.");
if (!process.stdin.isTTY)
  throw Error("Deployment requires interactive, explicit approval.");
for (const script of [
  "test",
  "test:legacy",
  "test:integration",
  "test:ui",
  "build",
  "worker:check",
]) {
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    env: {
      ...process.env,
      ...(sameOrigin ? { VITE_API_URL: "", VITE_BASE_PATH: "/" } : {}),
    },
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const answer = await prompt.question(
  "Tests passed. Deploy to the existing dream-job-api Worker, replacing its Hello World version? Type DEPLOY dream-job-api: ",
);
prompt.close();
if (answer !== "DEPLOY dream-job-api") throw Error("Deployment cancelled.");
const result = spawnSync(
  "npx",
  ["wrangler", "deploy", "--keep-vars", "--config", configFile],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
