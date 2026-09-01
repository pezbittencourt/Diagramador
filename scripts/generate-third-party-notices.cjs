const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const packages = Object.entries(lock.packages)
  .filter(([location, metadata]) => location.startsWith("node_modules/") && metadata.dev !== true)
  .map(([location, metadata]) => {
    const packageDirectory = path.join(root, ...location.split("/"));
    const manifest = JSON.parse(fs.readFileSync(path.join(packageDirectory, "package.json"), "utf8"));
    const noticeNames = fs.readdirSync(packageDirectory)
      .filter((name) => /^(license|copying|notice)(\..*)?$/iu.test(name))
      .sort();
    const notices = noticeNames.map((name) => ({
      name,
      text: fs.readFileSync(path.join(packageDirectory, name), "utf8").trim(),
    }));
    return {
      name: manifest.name ?? location.replace(/^node_modules\//u, ""),
      version: manifest.version ?? metadata.version,
      license: typeof manifest.license === "string" ? manifest.license : "Não declarada no package.json",
      notices,
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));

const sections = packages.map((item) => {
  const heading = `${item.name} ${item.version}\nLicença declarada: ${item.license}`;
  const text = item.notices.length
    ? item.notices.map((notice) => `\n--- ${notice.name} ---\n${notice.text}`).join("\n")
    : "\nNenhum arquivo LICENSE/COPYING/NOTICE foi localizado no pacote instalado.";
  return `${heading}${text}`;
});

// Recursos binários empacotados que não vêm do npm (ex.: perfis ICC), com sua
// própria licença lida diretamente do arquivo redistribuído junto ao asset.
const bundledAssets = [
  {
    name: "sRGB.icc (perfil de cor sRGB IEC61966-2.1, littleCMS)",
    licenseFile: "build/sRGB.icc.LICENSE-ZLIB",
    readmeFile: "build/sRGB.icc.README",
  },
];
const bundledSections = bundledAssets.map((asset) => {
  const license = fs.readFileSync(path.join(root, asset.licenseFile), "utf8").trim();
  const readme = fs.readFileSync(path.join(root, asset.readmeFile), "utf8").trim();
  return `${asset.name}\nUsado em: output intent PDF/X-4 da exportação de PDF.`
    + `\n\n--- ${path.basename(asset.readmeFile)} ---\n${readme}`
    + `\n\n--- ${path.basename(asset.licenseFile)} ---\n${license}`;
});

const output = [
  "LIVRO STUDIO — AVISOS DE TERCEIROS",
  "",
  "Gerado a partir das dependências de produção instaladas. Este arquivo não define uma licença pública para o Livro Studio, que permanece um projeto pessoal sem licença pública declarada.",
  "",
  ...sections.map((section) => `${"=".repeat(78)}\n${section}`),
  `${"=".repeat(78)}\nRECURSOS BINÁRIOS EMPACOTADOS (NÃO NPM)`,
  ...bundledSections.map((section) => `${"=".repeat(78)}\n${section}`),
  "",
].join("\n");
fs.writeFileSync(path.join(root, "THIRD_PARTY_NOTICES.txt"), output, "utf8");
console.log(`Avisos gerados para ${packages.length} pacotes de produção.`);
