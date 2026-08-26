const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const releaseDirectory = path.resolve(root, "release");
if (path.dirname(releaseDirectory) !== root || path.basename(releaseDirectory) !== "release") {
  throw new Error(`Diretório de release inseguro: ${releaseDirectory}`);
}
fs.rm(releaseDirectory, { recursive: true, force: true }).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
