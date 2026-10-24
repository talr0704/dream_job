import { parse } from "jsonc-parser";
import { readFileSync } from "node:fs";
export const productionOrigin = "https://dream-job-api.tal070498.workers.dev";
export function deploymentPlan(sameOrigin = false) {
  const configFile = sameOrigin
    ? "wrangler.same-origin.jsonc"
    : "wrangler.jsonc";
  const errors = [];
  const config = parse(
    readFileSync(new URL("../" + configFile, import.meta.url), "utf8"),
    errors,
    { allowTrailingComma: true },
  );
  if (errors.length) throw Error("Invalid Wrangler JSONC configuration");
  if (config.name !== "dream-job-api")
    throw Error("Refusing to deploy a different Worker");
  if (!config.keep_vars)
    throw Error("Existing dashboard variables must be preserved");
  if ("OPENAI_API_KEY" in config.vars)
    throw Error("The existing secret must not be defined in vars");
  if (!config.vars.OPENAI_MODEL?.trim())
    throw Error("OPENAI_MODEL is required");
  if (sameOrigin) {
    if (config.vars.ALLOWED_ORIGIN !== productionOrigin)
      throw Error("Wrong same-origin production URL");
    if ("ACCESS_AUD" in config.vars || "ACCESS_TEAM_DOMAIN" in config.vars)
      throw Error(
        "Same-origin deployment must retain the existing Access bindings",
      );
    if (
      config.assets?.directory !== "./dist" ||
      !config.assets.run_worker_first.includes("/api/*")
    )
      throw Error("Static/API routing must be configured");
  } else {
    if (
      !config.vars.ACCESS_AUD?.trim() ||
      !config.vars.ACCESS_TEAM_DOMAIN?.endsWith(".cloudflareaccess.com")
    )
      throw Error(
        "Set the existing Access configuration before API-only deployment",
      );
    const u = new URL(config.vars.ALLOWED_ORIGIN);
    if (u.origin !== config.vars.ALLOWED_ORIGIN || u.protocol !== "https:")
      throw Error("Exact HTTPS origin required");
  }
  return {
    configFile,
    config,
    buildScript: sameOrigin ? "build:same-origin" : "build",
    checkArgs: [
      "wrangler",
      "deploy",
      "--dry-run",
      "--config",
      configFile,
      "--outdir",
      "work/worker-build",
    ],
    deployArgs: ["wrangler", "deploy", "--keep-vars", "--config", configFile],
  };
}
