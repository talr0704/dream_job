import { it, expect, vi } from "vitest";
import {
  toolInvocation,
  runTool,
  validateThenDeploy,
} from "../../scripts/run-tool.mjs";
import { deploymentPlan } from "../../scripts/deployment-plan.mjs";
it("bypasses Windows npm.cmd/npx.cmd using Node and JS CLI arguments without a shell", () => {
  const execPath = "C:\\Program Files\\nodejs\\node.exe";
  const cli = "C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js";
  const wranglerCli =
    "C:\\Users\\Example & User\\dream job\\node_modules\\wrangler\\bin\\wrangler.js";
  const env = { npm_execpath: cli, PATH: "C:\\Program Files\\nodejs" };
  const spawn = vi.fn(() => ({ status: 0 }));
  runTool("npm", ["run", "build"], {
    env,
    execPath,
    wranglerCli,
    exists: () => true,
    spawn,
  });
  expect(spawn.mock.calls[0]).toEqual([
    execPath,
    [cli, "run", "build"],
    { stdio: "inherit", shell: false, env },
  ]);
  runTool(
    "npx",
    [
      "wrangler",
      "deploy",
      "--dry-run",
      "--config",
      "folder & echo injected/config.jsonc",
    ],
    { env, execPath, wranglerCli, exists: () => true, spawn },
  );
  expect(spawn.mock.calls[1][0]).toBe(execPath);
  expect(spawn.mock.calls[1][1]).toEqual([
    wranglerCli,
    "deploy",
    "--dry-run",
    "--config",
    "folder & echo injected/config.jsonc",
  ]);
  expect(spawn.mock.calls[1][2].shell).toBe(false);
});
it("never launches a .cmd file as an executable or Node script", () => {
  expect(() =>
    toolInvocation("npm", [], {
      env: { npm_execpath: "C:\\npm.cmd" },
      exists: () => false,
    }),
  ).toThrow(/npm JavaScript CLI/);
  expect(() => toolInvocation("cmd.exe", ["/c", "npm run build"])).toThrow(
    /Unsupported/,
  );
});
it("completes all checks and matching dry-run before approval, and only deploys after exact approval", async () => {
  const p = deploymentPlan(true);
  const events: any[] = [];
  await validateThenDeploy(p, {
    run: (...args: any[]) => events.push(args),
    approve: async () => {
      events.push("approval");
      return "DEPLOY dream-job-api";
    },
  });
  expect(events.slice(0, 5)).toEqual(
    [
      "test",
      "test:legacy",
      "test:integration",
      "test:ui",
      "build:same-origin",
    ].map((s) => ["npm", ["run", s]]),
  );
  expect(events[5]).toEqual(["npx", p.checkArgs]);
  expect(events[6]).toBe("approval");
  expect(events[7]).toEqual(["npx", p.deployArgs]);
});
it("stops before approval on a failed check, and never deploys after cancellation", async () => {
  const p = deploymentPlan(true);
  const approve = vi.fn();
  await expect(
    validateThenDeploy(p, {
      run: () => {
        throw Error("failed");
      },
      approve,
    }),
  ).rejects.toThrow("failed");
  expect(approve).not.toHaveBeenCalled();
  const run = vi.fn();
  await expect(
    validateThenDeploy(p, { run, approve: async () => "no" }),
  ).rejects.toThrow("cancelled");
  expect(run).toHaveBeenCalledTimes(6);
});
it("propagates subprocess errors, failed exit codes and signals", () => {
  const env = { npm_execpath: "/npm-cli.js" };
  expect(() =>
    runTool("npm", [], {
      env,
      exists: () => true,
      spawn: () => ({ error: Error("ENOENT") }),
    }),
  ).toThrow("ENOENT");
  try {
    runTool("npm", [], {
      env,
      exists: () => true,
      spawn: () => ({ status: 7 }),
    });
    throw Error("did not fail");
  } catch (e: any) {
    expect(e.exitCode).toBe(7);
  }
  expect(() =>
    runTool("npm", [], {
      env,
      exists: () => true,
      spawn: () => ({ status: null, signal: "SIGTERM" }),
    }),
  ).toThrow("SIGTERM");
});
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
it("executes installed npm and Wrangler JS CLIs with real Node subprocesses", () => {
  const dir = mkdtempSync(join(tmpdir(), "dream-job-tools-"));
  const env = {
    ...process.env,
    XDG_CONFIG_HOME: dir,
    WRANGLER_SEND_METRICS: "false",
    npm_config_cache: join(dir, "npm-cache"),
  };
  try {
    const spawn = (file: string, args: string[], options: any) => {
      const result = spawnSync(file, args, {
        ...options,
        stdio: "pipe",
        encoding: "utf8",
        timeout: 15000,
      });
      expect(result.error).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
      return result;
    };
    runTool("npm", ["--version"], { env, spawn });
    runTool("npx", ["wrangler", "--version"], { env, spawn });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
