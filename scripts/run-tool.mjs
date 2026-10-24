import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Node 24 cannot directly execute Windows .cmd shims without cmd.exe. Invoke
// the JS CLIs through Node instead, on every platform: no shell/quoting layer.
export function toolInvocation(
  command,
  args,
  {
    env = process.env,
    execPath = process.execPath,
    exists = existsSync,
    wranglerCli = resolve(
      dirname(require.resolve("wrangler/package.json")),
      require("wrangler/package.json").bin.wrangler,
    ),
  } = {},
) {
  if (command === "npm") {
    const candidates = [
      env.npm_execpath,
      join(dirname(execPath), "node_modules/npm/bin/npm-cli.js"),
      resolve(dirname(execPath), "../lib/node_modules/npm/bin/npm-cli.js"),
      "/usr/share/nodejs/npm/bin/npm-cli.js",
    ];
    const cli = candidates.find(
      (p) => p && /\.(?:c?js|mjs)$/i.test(p) && exists(p),
    );
    if (!cli)
      throw Error(
        "Cannot locate npm JavaScript CLI. Run this script using npm run worker:deploy; npm.cmd is not executed directly.",
      );
    return { file: execPath, args: [cli, ...args] };
  }
  if (command === "npx" && args[0] === "wrangler")
    return { file: execPath, args: [wranglerCli, ...args.slice(1)] };
  throw Error("Unsupported deployment tool");
}
export function runTool(
  command,
  args,
  { env = process.env, spawn = spawnSync, ...options } = {},
) {
  const invocation = toolInvocation(command, args, { env, ...options });
  const result = spawn(invocation.file, invocation.args, {
    stdio: "inherit",
    shell: false,
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(
      `${command} failed (${result.signal || result.status || "no exit status"})`,
    );
    error.exitCode = result.status ?? 1;
    throw error;
  }
}
export async function validateThenDeploy(plan, { run = runTool, approve }) {
  for (const script of [
    "test",
    "test:legacy",
    "test:integration",
    "test:ui",
    plan.buildScript,
  ])
    run("npm", ["run", script]);
  run("npx", plan.checkArgs);
  if ((await approve()) !== "DEPLOY dream-job-api")
    throw Error("Deployment cancelled");
  run("npx", plan.deployArgs);
}
