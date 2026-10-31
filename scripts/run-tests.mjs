import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vitestCli = path.join(repositoryRoot, "node_modules", "vitest", "vitest.mjs");
const tempDirectory = mkdtempSync(path.join(repositoryRoot, ".test-tmp-"));
const environment = {
  ...process.env,
  TEMP: tempDirectory,
  TMP: tempDirectory,
  TMPDIR: tempDirectory,
};

let exitCode = 0;

try {
  for (const app of ["campus-helpdesk-chat", "react-login-page", "Admin-Panel"]) {
    console.log(`\nRunning tests in ${app}`);
    const result = spawnSync(process.execPath, [vitestCli, "run"], {
      cwd: path.join(repositoryRoot, app),
      env: environment,
      stdio: "inherit",
    });

    if (result.error) {
      console.error(result.error.message);
      exitCode = 1;
      break;
    }

    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}

process.exitCode = exitCode;
