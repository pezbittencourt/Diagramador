import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { APP_NAME, APP_VERSION, PROJECT_FILE_DESCRIPTION } from "./appMetadata";

const root = process.cwd();

describe("Windows distribution configuration", () => {
  it("keeps product, runtime, package and installer versions consistent", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    expect(manifest.version).toBe(APP_VERSION);
    expect(manifest.build.productName).toBe(APP_NAME);
    expect(manifest.build.win.executableName).toBe(APP_NAME);
    expect(manifest.build.win.artifactName).toContain("${version}");
  });

  it("builds only Windows x64 with ASAR and production resources", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    expect(manifest.build.asar).toBe(true);
    expect(manifest.build.win.target).toEqual([{ target: "nsis", arch: ["x64"] }]);
    expect(manifest.build.files).toContain("dist/**/*");
    expect(manifest.build.files).toContain("dist-electron/**/*");
    expect(manifest.build.files.join(" ")).not.toMatch(/src|test-fixtures|\.tmp|\.tools/u);
    expect(manifest.build.nsis).toMatchObject({
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      createDesktopShortcut: false,
      createStartMenuShortcut: true,
      deleteAppDataOnUninstall: false,
    });
  });

  it("declares and registers the Livro document association per user", async () => {
    const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    expect(manifest.build.fileAssociations[0]).toMatchObject({
      ext: "livro",
      description: PROJECT_FILE_DESCRIPTION,
      icon: "livro.ico",
    });
    const nsis = await readFile(path.join(root, "build", "installer.nsh"), "utf8");
    expect(nsis).toContain('HKCU "Software\\Classes\\.livro"');
    expect(nsis).toContain('"$INSTDIR\\Livro Studio.exe$\\" $\\"%1$\\"');
    expect(nsis).not.toContain("HKLM");
    expect(nsis).toContain("customUnInstall");
  });

  it("ships multi-resolution provisional Windows icons and third-party notices", async () => {
    for (const name of ["app.ico", "livro.ico"]) {
      const icon = await readFile(path.join(root, "build", name));
      expect(icon.subarray(0, 4)).toEqual(Buffer.from([0, 0, 1, 0]));
      expect(icon.readUInt16LE(4)).toBeGreaterThanOrEqual(7);
    }
    const notices = await readFile(path.join(root, "THIRD_PARTY_NOTICES.txt"), "utf8");
    expect(notices).toContain("jszip 3.10.1");
    expect(notices).toContain("mammoth 1.12.1");
    expect(notices).toContain("pdf-lib 1.17.1");
  });
});
