import { createWriteStream, chmodSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { get } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const TECTONIC_URL =
  "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%400.16.9/tectonic-0.16.9-x86_64-unknown-linux-musl.tar.gz";

const rootDir = process.cwd();
const vendorBinDir = path.join(rootDir, "vendor", "bin");
const tectonicPath = path.join(vendorBinDir, "tectonic");

if (existsSync(tectonicPath)) {
  console.log("Tectonic already installed");
  process.exit(0);
}

const workDir = path.join(tmpdir(), `latex-viewer-tectonic-${Date.now()}`);
const archivePath = path.join(workDir, "tectonic.tar.gz");

mkdirSync(workDir, { recursive: true });
mkdirSync(vendorBinDir, { recursive: true });

try {
  await download(TECTONIC_URL, archivePath);
  execFileSync("tar", ["-xzf", archivePath, "-C", vendorBinDir, "tectonic"], { stdio: "inherit" });
  chmodSync(tectonicPath, 0o755);
  console.log(`Installed ${tectonicPath}`);
} finally {
  rmSync(workDir, { force: true, recursive: true });
}

function download(url, destination) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0) && response.headers.location) {
        response.resume();
        download(response.headers.location, destination).then(resolve, reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed with status ${response.statusCode}: ${url}`));
        return;
      }

      const file = createWriteStream(destination);
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
      file.on("error", reject);
    });

    request.on("error", reject);
  });
}
