// O CLI `multishell` que vive dentro do espaço.
//
// É um arquivo gerado, igual aos rc files: o `materialize` grava em
// `<espaço>/bin`. Fica em CommonJS (`.cjs`) e só usa `node:net`, então roda
// tanto no node do usuário quanto no binário do Electron em modo node.
//
// Não há rede: o socket é local e o endereço vem do ambiente da sessão.

/** Nome do atalho no PATH do espaço. */
export const CLI_SHIM = "multishell";
/** Nome do arquivo gerado com o código do CLI. */
export const CLI_FILE = "multishell-notify.cjs";

/** O `#!/bin/sh` que chama o Electron em modo node. O espaço pode não ter node. */
export function shimSource(nodeBin: string, cliJs: string): string {
  return [
    "#!/bin/sh",
    "# Gerado pelo Multishell. Não edite: é reescrito a cada abertura de terminal.",
    `ELECTRON_RUN_AS_NODE=1 exec "${nodeBin}" "${cliJs}" "$@"`,
    "",
  ].join("\n");
}

/** O código do CLI. String porque o arquivo nasce dentro do espaço, não no bundle. */
export function cliSource(): string {
  return `#!/usr/bin/env node
// Gerado pelo Multishell. Não edite: é reescrito a cada abertura de terminal.
"use strict";
const net = require("node:net");

const USO = [
  "uso: multishell notify <titulo> [--body texto] [--level info|warn|urgent]",
  "     multishell ask <pergunta> [--body texto] [--option X]... [--placeholder texto] [--timeout segundos]",
  "     multishell hook <evento>   (chamado pelo Claude Code; le o JSON do evento no stdin)",
  "",
  "ask escreve a resposta no stdout. Sai com 2 quando ninguem responde.",
  "",
].join("\\n");

function morre(msg, code) {
  process.stderr.write("multishell: " + msg + "\\n");
  process.exit(code === undefined ? 1 : code);
}

const argv = process.argv.slice(2);
const op = argv.shift();
if (op !== "notify" && op !== "ask" && op !== "hook") {
  process.stderr.write(USO);
  process.exit(1);
}

const sock = process.env.MULTISHELL_NOTIFY_SOCK || "";
const token = process.env.MULTISHELL_NOTIFY_TOKEN || "";
// Hook que reclama polui a saida do agente. Fora do Multishell ele so some.
if (!sock || !token) { if (op === "hook") process.exit(0); morre("fora de um terminal do Multishell"); }

// Texto de cada evento do Claude Code. Evento desconhecido vira aviso generico.
const EVENTOS = {
  Notification: { title: "Claude precisa de você", level: "warn", campo: "message" },
  Stop: { title: "Claude terminou o turno", level: "info", campo: "" },
};

if (op === "hook") {
  const evento = argv[0] || "";
  const texto = EVENTOS[evento] || { title: "Claude: " + (evento || "evento"), level: "info", campo: "message" };
  let entrada = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", function (c) { if (entrada.length < 64 * 1024) entrada += c; });
  process.stdin.on("end", function () {
    let dados = {};
    try { dados = JSON.parse(entrada) || {}; } catch (e) { dados = {}; }
    const body = texto.campo ? dados[texto.campo] : null;
    enviaEsai({ op: "notify", token: token, title: texto.title, body: body ? String(body) : undefined, level: texto.level }, true);
  });
  // Hook chamado sem stdin ligado: nao espera para sempre.
  process.stdin.resume();
} else {

const req = { op: op, token: token, title: "", options: [] };
const palavras = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === "--body") { req.body = argv[++i]; continue; }
  if (a === "--level") { req.level = argv[++i]; continue; }
  if (a === "--option" || a === "-o") { req.options.push(argv[++i]); continue; }
  if (a === "--placeholder") { req.placeholder = argv[++i]; continue; }
  if (a === "--timeout") { req.timeout_ms = Number(argv[++i]) * 1000; continue; }
  if (a === "--help" || a === "-h") { process.stdout.write(USO); process.exit(0); }
  palavras.push(a);
}
  req.title = palavras.join(" ").trim();
  if (!req.title) morre("falta o titulo");
  enviaEsai(req, false);
}

/** Manda a requisicao e sai. calado = hook: falha nao vira erro do agente. */
function enviaEsai(req, calado) {
  const falha = function (msg) { if (calado) process.exit(0); morre(msg); };
  const cliente = net.createConnection(sock);
  let buf = "";
  let respondeu = false;
  cliente.setEncoding("utf8");
  cliente.on("error", function () { falha("servidor de notificacoes indisponivel"); });
  cliente.on("connect", function () { cliente.write(JSON.stringify(req) + "\\n"); });
  cliente.on("data", function (chunk) {
    buf += chunk;
    const corte = buf.indexOf("\\n");
    if (corte < 0) return;
    respondeu = true;
    cliente.end();
    let resp;
    try { resp = JSON.parse(buf.slice(0, corte)); } catch (e) { falha("resposta invalida"); return; }
    if (!resp.ok) { falha(resp.error || "falhou"); return; }
    if (req.op === "ask") {
      if (resp.answer === null || resp.answer === undefined) process.exit(2);
      process.stdout.write(String(resp.answer) + "\\n");
    }
    process.exit(0);
  });
  cliente.on("close", function () { if (!respondeu) falha("conexao fechada sem resposta"); });
}
`;
}
