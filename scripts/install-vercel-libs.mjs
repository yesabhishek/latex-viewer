import { execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, realpathSync, rmSync, copyFileSync } from "node:fs";
import { get } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";

const GRAPHITE_DEB_URL =
  "https://deb.debian.org/debian/pool/main/g/graphite2/libgraphite2-3_1.3.14-1_amd64.deb";

const rootDir = process.cwd();
const vendorLibDir = path.join(rootDir, "vendor", "lib");
const outputPath = path.join(vendorLibDir, "libgraphite2.so.3");

if (existsSync(outputPath)) {
  console.log("libgraphite2 already installed");
  process.exit(0);
}

const workDir = path.join(tmpdir(), `latex-viewer-libs-${Date.now()}`);
const debPath = path.join(workDir, "libgraphite2.deb");

mkdirSync(workDir, { recursive: true });
mkdirSync(vendorLibDir, { recursive: true });

try {
  await download(GRAPHITE_DEB_URL, debPath);
  execFileSync("ar", ["x", debPath], { cwd: workDir, stdio: "inherit" });

  const dataArchive = readdirSync(workDir).find((file) => file.startsWith("data.tar."));
  if (!dataArchive) {
    throw new Error("Could not find data archive in libgraphite2 package.");
  }

  execFileSync("tar", ["-xf", path.join(workDir, dataArchive)], { cwd: workDir, stdio: "inherit" });

  const extractedLibrary = path.join(workDir, "usr", "lib", "x86_64-linux-gnu", "libgraphite2.so.3");
  copyFileSync(realpathSync(extractedLibrary), outputPath);
  console.log(`Installed ${outputPath}`);
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
