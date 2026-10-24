// Preparation and checks never deploy. Only the interactive final step can publish.
import { validateThenDeploy } from "./run-tool.mjs";
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
try {
  await validateThenDeploy(plan, {
    approve: async () => {
      const prompt = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        return await prompt.question(
          `Update existing dream-job-api using ${plan.configFile}? Type DEPLOY dream-job-api: `,
        );
      } finally {
        prompt.close();
      }
    },
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode ?? 1;
}
