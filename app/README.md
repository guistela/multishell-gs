# Multishell

Um terminal por espaço isolado. Cada espaço tem seu próprio HOME, perfil de shell e segredos.
Assim, contas diferentes da mesma CLI (Claude Code, Codex, GitHub) nunca se misturam.

Roda em macOS e Windows. Interface em PT-BR e EN.

## Conceitos

- **Provider**: uma CLI que você usa (ex.: `claude`, `codex`, `gh`). Define executável e variável de config (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`).
- **Espaço**: uma pasta raiz com credenciais próprias. Vira `HOME` do terminal. Tem política de segurança (compartilhar SSH, Keychain, `.zshrc`).
- **Terminal**: uma sessão de shell dentro de um Espaço. Abre com o Provider escolhido já configurado.

## Organização dos terminais

Clique no nome do espaço na lateral e escolha **Visualização**: Individual, Lista, Grade, Vertical ou Horizontal. Cada espaço lembra sua escolha. **+ Terminal** cria uma sessão no espaço aberto.

Arraste a alça **⠿** na lateral ou o título acima do terminal e solte fora da janela para destacar. Na janela destacada, arraste a alça/título para fora dela e solte sobre uma parte visível da janela principal para devolver ao espaço de origem. **Esc** cancela. Os botões Destacar/Devolver continuam disponíveis.

Os terminais continuam executando ao trocar o layout ou mover entre janelas.

## Por que Electron e não Tauri

O Tauri usa o WKWebView do sistema. Nesta máquina (Intel 2019, macOS 26.6) o WKWebView não pinta nada.
O Chromium do Electron renderiza. O backend Rust virou TypeScript em `electron/`. Os commands IPC mantêm os mesmos nomes.

## Requisitos

- Node 22
- pnpm 11
- Windows: Visual Studio Build Tools (C++) só se o prebuild do `node-pty` faltar para a sua versão do Node.
- macOS: Xcode Command Line Tools (mesmo motivo).

## Comandos

Rode dentro de `app/`. Ou use o `Makefile` da raiz (`make dev`, `make dist`).

| Comando | O que faz |
|---|---|
| `pnpm install` | Instala dependências |
| `pnpm dev` | Abre o app em modo dev (electron-vite) |
| `pnpm test` | Testes (vitest): React e `electron/__tests__/` |
| `pnpm typecheck` | Checa tipos |
| `pnpm build` | Compila main, preload e renderer em `out/` |
| `pnpm dist` | Gera instaladores em `release/` |

Instaladores: `release/*.dmg` (Mac x64 e arm64) e `release/*.exe` (Windows NSIS).
Config do empacotamento: `electron-builder.yml`. Ícones: `build/`.

## Estrutura

```
app/
├── src/        # React (renderer)
├── electron/   # main, preload, IPC, pty, store, provider, space, secrets, migration
├── build/      # icon.icns, icon.ico, icon.png
├── out/        # saída do electron-vite (ignorado no git)
└── release/    # saída do electron-builder (ignorado no git)
```

Contrato IPC: [`../docs/CONTRATO-API.md`](../docs/CONTRATO-API.md), seção "Electron".

## Onde ficam os dados

Configuração (`providers.json`, `spaces.json`, `sessions.json`) fica no `userData` do Electron:

- macOS: `~/Library/Application Support/Multishell`
- Windows: `%APPDATA%\Multishell`

Raiz dos Espaços:

- macOS: `~/.multishell/profiles/<espaco>`
- Windows: `%USERPROFILE%\.multishell\profiles\<espaco>`

Segredos ficam no Keychain (Mac) ou Credential Manager (Windows), via `@napi-rs/keyring`.

## Como adicionar um harness novo

Um harness é um preset de Provider.

1. Escreva o teste em `electron/__tests__/provider.test.ts` antes do código.
2. Abra `electron/provider.ts`.
3. Adicione um preset: nome, executável por SO, `config_env_key`, flag de bypass.
4. Rode `pnpm test` até passar.
5. Adicione as strings em `src/i18n/pt-BR.json` e `src/i18n/en.json`.

## Como criar um release

1. Atualize `version` em `package.json`.
2. Faça commit na `main`.
3. Crie a tag e envie:

```sh
git tag v0.2.0
git push origin v0.2.0
```

O workflow `release.yml` roda `pnpm dist` no Mac e no Windows.
Os arquivos vão para um GitHub Release em **draft**. Revise e publique.

Sem assinatura por enquanto. No Mac, abra com botão direito > Abrir na primeira vez.
Onde entra a assinatura: comentários em `electron-builder.yml` e `.github/workflows/release.yml`.
