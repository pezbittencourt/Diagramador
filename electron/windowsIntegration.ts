import path from "node:path";

const OPENABLE_PROJECT_EXTENSIONS = new Set([".livro", ".json"]);

export interface RuntimeResourcePaths {
  preload: string;
  renderer: string;
  windowIcon: string;
}

const PACKAGED_SMOKE_ARGUMENT = "--livro-studio-packaged-smoke=";

export function isOpenableProjectPath(filePath: string): boolean {
  return OPENABLE_PROJECT_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function findProjectPathInArguments(argv: readonly string[], workingDirectory: string): string | undefined {
  for (const rawArgument of argv.slice(1)) {
    if (typeof rawArgument !== "string" || rawArgument.startsWith("--")) continue;
    const argument = rawArgument.length >= 2
      && ((rawArgument.startsWith('"') && rawArgument.endsWith('"'))
        || (rawArgument.startsWith("'") && rawArgument.endsWith("'")))
      ? rawArgument.slice(1, -1)
      : rawArgument;
    if (!isOpenableProjectPath(argument)) continue;
    return path.resolve(workingDirectory, argument);
  }
  return undefined;
}

export function findPackagedSmokeRoot(argv: readonly string[], temporaryDirectory: string): string | undefined {
  const argument = argv.find((value) => value.startsWith(PACKAGED_SMOKE_ARGUMENT));
  if (!argument) return undefined;
  const value = argument.slice(PACKAGED_SMOKE_ARGUMENT.length);
  if (!value) return undefined;
  const resolved = path.resolve(value);
  const relative = path.relative(path.resolve(temporaryDirectory), resolved);
  if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return undefined;
  return resolved;
}

export function resolveRuntimeResourcePaths(
  mainDirectory: string,
  resourcesDirectory: string,
  packaged: boolean,
): RuntimeResourcePaths {
  return {
    preload: path.join(mainDirectory, "preload.js"),
    renderer: path.resolve(mainDirectory, "../dist/index.html"),
    windowIcon: packaged
      ? path.join(resourcesDirectory, "app.ico")
      : path.resolve(mainDirectory, "../build/app.ico"),
  };
}
