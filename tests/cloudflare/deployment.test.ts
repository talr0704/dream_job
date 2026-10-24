import { it, expect } from "vitest";
import {
  deploymentPlan,
  productionOrigin,
} from "../../scripts/deployment-plan.mjs";
it("parses JSONC and targets the existing same-origin Worker for dry-run and deployment", () => {
  const p = deploymentPlan(true);
  expect(p.config.name).toBe("dream-job-api");
  expect(p.config.vars.ALLOWED_ORIGIN).toBe(productionOrigin);
  expect(p.config.vars).not.toHaveProperty("ACCESS_AUD");
  expect(p.config.vars).not.toHaveProperty("ACCESS_TEAM_DOMAIN");
  expect(p.config.vars).not.toHaveProperty("OPENAI_API_KEY");
  expect(p.config.keep_vars).toBe(true);
  expect(p.checkArgs).toContain("wrangler.same-origin.jsonc");
  expect(p.checkArgs).toContain("--dry-run");
  expect(p.deployArgs).toContain("wrangler.same-origin.jsonc");
  expect(p.deployArgs).toContain("--keep-vars");
  expect(p.buildScript).toBe("build:same-origin");
  expect(p.config.assets.run_worker_first).toContain("/api/*");
});
