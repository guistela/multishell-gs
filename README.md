# Multishell

Terminais isolados por espaço de credenciais. Mac e Windows. PT-BR e EN.

- App atual: **Electron + React + TypeScript**, em [`app/`](app/README.md).
- Comandos rápidos: `make dev`, `make test`, `make typecheck`, `make dist`, `make install-mac`.
- Release: crie uma tag `v*`. O CI gera `.dmg` e `.exe` num GitHub Release em draft.
- Arquitetura: [`docs/ARQUITETURA-ISOLAMENTO.md`](docs/ARQUITETURA-ISOLAMENTO.md). Contrato IPC: [`docs/CONTRATO-API.md`](docs/CONTRATO-API.md).

## Por que Electron e não Tauri

O Tauri depende do WKWebView do sistema. Nesta máquina ele não renderiza.
O Chromium do Electron renderiza. O backend Rust virou TypeScript em `app/electron/`.

## `MultiShell/` (Swift)

Código do app antigo, só macOS. Está **congelado**: sem novas features.
Ainda compila com `make swift-build` e `make swift-install`.
