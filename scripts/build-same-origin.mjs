import { runTool } from "./run-tool.mjs";
try {
  runTool("npm", ["run", "build"], {
    env: { ...process.env, VITE_API_URL: "", VITE_BASE_PATH: "/" },
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = error.exitCode ?? 1;
}
