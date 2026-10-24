// Preparation and checks never deploy. Only the interactive final step can publish.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { deploymentPlan } from "./deployment-plan.mjs";
const plan = deploymentPlan(process.argv.includes("--same-origin"));
if (process.argv.includes("--print-plan")) {
  console.log(
    JSON.stringify(
      {
        worker: plan.config.name,
        config: plan.configFile,
        build: plan.buildScript,
        dryRun: plan.checkArgs,
        deploy: plan.deployArgs,
        preservesDashboardVars: plan.config.keep_vars,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (!process.stdin.isTTY)
  throw Error("Deployment requires interactive explicit approval");
function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
for (const script of [
  "test",
  "test:legacy",
  "test:integration",
  "test:ui",
  plan.buildScript,
])
  run("npm", ["run", script]);
run("npx", plan.checkArgs);
const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const answer = await prompt.question(
  `Update existing dream-job-api using ${plan.configFile}? Type DEPLOY dream-job-api: `,
);
prompt.close();
if (answer !== "DEPLOY dream-job-api") throw Error("Deployment cancelled");
run("npx", plan.deployArgs);
