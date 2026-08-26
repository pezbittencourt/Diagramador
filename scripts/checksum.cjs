const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const releaseDirectory = path.resolve(__dirname, "../release");
const installers = fs.readdirSync(releaseDirectory)
  .filter((name) => /^Livro Studio Setup .+\.exe$/u.test(name))
  .sort((left, right) => left.localeCompare(right));
if (installers.length !== 1) {
  throw new Error(`Era esperado um instalador final; encontrados: ${installers.join(", ") || "nenhum"}.`);
}
const installerName = installers[0];
const installerPath = path.join(releaseDirectory, installerName);
const hash = crypto.createHash("sha256").update(fs.readFileSync(installerPath)).digest("hex");
const checksumPath = `${installerPath}.sha256`;
fs.writeFileSync(checksumPath, `${hash}  ${installerName}\n`, "utf8");
console.log(JSON.stringify({ installerPath, checksumPath, sha256: hash }, null, 2));

