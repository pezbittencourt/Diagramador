import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFileAtomic } from "./atomicFiles";

describe("gravação atômica genérica", () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it("mantém o arquivo anterior quando a gravação é interrompida antes do commit", async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "livro-atomic-"));
    const destination = path.join(directory, "projeto.livro");
    await writeFile(destination, "versão anterior");
    await expect(writeFileAtomic(destination, Buffer.from("nova versão"), {
      beforeCommit: () => { throw new Error("falha simulada"); },
    })).rejects.toThrow("falha simulada");
    expect(await readFile(destination, "utf8")).toBe("versão anterior");
  });
});
