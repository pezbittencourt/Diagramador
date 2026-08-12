const { spawn } = require("node:child_process");
const electron = require("electron");

// Alguns ambientes de automação definem esta variável globalmente, o que faz
// o binário do Electron se comportar como Node em vez de abrir a aplicação.
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, process.argv.slice(2), {
  env: environment,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});

