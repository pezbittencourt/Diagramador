import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findProjectPathInArguments,
  findPackagedSmokeRoot,
  isOpenableProjectPath,
  resolveRuntimeResourcePaths,
} from "./windowsIntegration";

describe("Windows distribution integration", () => {
  it("preserves spaces and Unicode when parsing an associated project", () => {
    const cwd = path.resolve("C:/Users/Teste/Documents");
    const relative = path.join("Meus Livros", "História São Paulo", "Meu livro 01.livro");
    expect(findProjectPathInArguments(["Livro Studio.exe", relative], cwd))
      .toBe(path.resolve(cwd, relative));
  });

  it("ignores switches and non-project arguments without splitting command lines", () => {
    const cwd = path.resolve("C:/work");
    expect(findProjectPathInArguments([
      "Livro Studio.exe",
      "--remote-debugging-port=0",
      "texto com espaços.txt",
      "Projeto.LIVRO",
    ], cwd)).toBe(path.resolve(cwd, "Projeto.LIVRO"));
    expect(isOpenableProjectPath("projeto.exe")).toBe(false);
  });

  it("resolves packaged resources inside ASAR and mutable icons outside it", () => {
    const mainDirectory = path.resolve("C:/Program Files/Livro Studio/resources/app.asar/dist-electron");
    const resources = path.resolve("C:/Program Files/Livro Studio/resources");
    const resolved = resolveRuntimeResourcePaths(mainDirectory, resources, true);
    expect(resolved.preload).toBe(path.join(mainDirectory, "preload.js"));
    expect(resolved.renderer).toContain(path.join("app.asar", "dist", "index.html"));
    expect(resolved.windowIcon).toBe(path.join(resources, "app.ico"));
    expect(resolved.sRgbIccProfile).toBe(path.join(resources, "sRGB.icc"));
    expect(Object.values(resolved).join(" ")).not.toMatch(/src[\\/]|OneDrive|zefer/i);
  });

  it("limits the packaged smoke workspace to the operating system temp directory", () => {
    const temporaryDirectory = path.resolve("C:/Users/Teste/AppData/Local/Temp");
    const safe = path.join(temporaryDirectory, "livro-studio-packaged-123");
    expect(findPackagedSmokeRoot(["Livro Studio.exe", `--livro-studio-packaged-smoke=${safe}`], temporaryDirectory))
      .toBe(safe);
    expect(findPackagedSmokeRoot([
      "Livro Studio.exe",
      "--livro-studio-packaged-smoke=C:/Users/Teste/Documents",
    ], temporaryDirectory)).toBeUndefined();
  });
});
