import { spawnSync } from "node:child_process";
const result = spawnSync("npm", ["run", "build"], {
  stdio: "inherit",
  env: { ...process.env, VITE_API_URL: "", VITE_BASE_PATH: "/" },
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
