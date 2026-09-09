# Contrato Rust ⇄ Front (Tauri commands)

Todos os tipos serializam em `snake_case`. Ids são UUID string. Erros: `Result<T, String>`.

## Tipos

```ts
interface EnvVar { key: string; value: string; is_secret: boolean }

interface Provider {            // já existe em src-tauri/src/provider.rs
  id: string; name: string; executable: string;
  args: string[]; bypass_args: string[];
  config_env_key: string | null; extra_env: EnvVar[]; icon: string;
}

interface SpaceSecurity {
  load_user_shell_profile: boolean;  // mac: source ~/.zshrc | win: . $PROFILE do usuário
  share_keychain: boolean;           // só mac: symlink Library/Keychains
  share_ssh: boolean;                // symlink/junction ~/.ssh
  share_git_config: boolean;         // symlink ~/.gitconfig
  inherit_process_env: boolean;      // env do app passa para o shell
}

interface Space {
  id: string; name: string; color_hex: string;
  directory_name: string;            // pasta estável sob a raiz de espaços
  custom_env: EnvVar[];              // is_secret=true → value fica vazio; valor real no keyring
  security: SpaceSecurity;
  created_at: string;                // RFC3339
}

interface SpawnPlan {               // o que o front passa para pty_spawn
  shell: string; shell_args: string[]; cwd: string | null;
  env: Record<string,string>;        // SEM valores de segredo: o plano passa pelo renderer
  inherit_env: boolean;
  secret_keys: string[];             // só os nomes; o main resolve o valor no pty_spawn
}

interface TerminalSettings {
  shell: string | null; default_cwd: string | null;
  font_family: string; font_size: number; theme: string; language: "pt-BR" | "en";
}
```

Raiz dos espaços: mac `~/.multishell/profiles/<directory_name>` (HOME real, compatível com o app Swift); windows `%USERPROFILE%\.multishell\profiles\<directory_name>`.
Pasta de config do provider dentro do espaço: `<raiz>/providers/<slug do provider>`; exportada em `config_env_key` quando existir.

## Commands

| Command | Args | Retorno | Dono |
|---|---|---|---|
| `store_get` | `name: string` | `any \| null` (JSON de `<appDataDir>/<name>.json`) | rust-core |
| `store_set` | `name: string, value: any` | `void` | rust-core |
| `spaces_list` | | `Space[]` (cria os 2 padrão se vazio: Pessoal/personal, Trabalho/work) | rust-core |
| `space_save` | `space: Space` | `Space` | rust-core |
| `space_delete` | `space_id` | `void` (não apaga a pasta) | rust-core |
| `space_open_folder` | `space_id` | `void` | rust-core |
| `space_spawn_plan` | `space_id, provider_id: string \| null, cwd: string \| null` | `SpawnPlan` | rust-core |
| `providers_list` | | `Provider[]` (presets se vazio) | rust-core |
| `provider_save` | `provider: Provider` | `Provider` | rust-core |
| `provider_delete` | `provider_id` | `void` | rust-core |
| `provider_presets` | | `Provider[]` | existe |
| `provider_command_line` | `provider, bypass` | `string` | existe |
| `secret_set` | `space_id, key, value` | `void` | rust-secrets |
| `secret_get` | `space_id, key` | `string \| null` | rust-secrets |
| `secret_delete` | `space_id, key` | `void` | rust-secrets |
| `migrate_from_swift` | | `MigrationReport { spaces: number, providers: number, sessions: number, notes: string[] }` | rust-secrets |
| `pty_spawn/pty_write/pty_resize/pty_kill/default_shell` | | | existe |

`space_spawn_plan` monta o env (HOME/XDG/ZDOTDIR no mac; USERPROFILE/APPDATA/LOCALAPPDATA/`-NoProfile` no windows), gera o rc do shell no espaço, aplica `security`, injeta `custom_env` e, se `provider_id`, `config_env_key` + `extra_env` do provider.

Valor de segredo nunca entra no plano. As chaves marcadas como `is_secret` saem em `secret_keys`; `pty_spawn` recebe `space_id` (e `provider_id`) e lê o keyring no processo main, antes de criar o shell. Assim nenhum segredo trafega pelo renderer.

`path_open` só abre pasta existente com caminho absoluto. O `cwd` da sessão vem do OSC 7, que qualquer saída de terminal pode forjar; sem essa checagem um arquivo executável forjado abriria pelo LaunchServices.

## Eventos
`pty-output-<session_id>` (bytes), `pty-exit` ({session_id, code}), `pty-closed` (session_id).

## Front
- Estado global em `src/store.ts` (zustand): spaces, providers, sessions, settings. Persistência via `store_get/store_set("ui-state")`.
- i18n: um arquivo por feature em `src/i18n/locales/<lang>/<feature>.json`, carregado por glob. Namespace = nome do arquivo.

## Fase 7 — resiliência e resume (2026-09-06)

Tipos novos/alterados:
```ts
interface Provider { /* ... */ resume_args: string[] }   // ex.: ["--continue"]; vazio = sem resume
interface Session  { /* ... */ harness_running: boolean } // true entre "Iniciar harness" e o exit do PTY
```
Presets de `resume_args`: Claude Code `["--continue"]`, Codex `["resume","--last"]`, Cursor `["--resume"]`, Antigravity `[]`.

Commands novos:
| Command | Args | Retorno | Dono |
|---|---|---|---|
| `pty_cwd` | `session_id` | `string \| null` (cwd atual do processo filho; mac via libproc; windows null) | rust |
| `provider_resume_line` | `provider, bypass` | `string` = executable + args + resume_args + (bypass ? bypass_args : []) | rust |

Comportamento do front:
- A cada 5 s e ao fechar a janela: `pty_cwd` de cada sessão → `session.cwd` (persistido em ui-state).
- Ao carregar o app: para cada sessão, spawn no `cwd` salvo (fallback `default_cwd`). Se `harness_running && provider_id` e o provider tem `resume_args`, após o shell subir (primeiro output recebido, timeout 1,5 s) envia `provider_resume_line + "\n"`. Se `resume_args` vazio, envia o comando normal.
- `harness_running` vira false no `pty-exit` e quando o usuário fecha a sessão.

## Electron (2026-09-06) — substitui o Tauri

Motivo: WKWebView não pinta conteúdo nesta máquina (Intel 2019 + macOS 26.6); WKWebView puro em Swift reproduz. Chromium renderiza. Os commands acima continuam válidos; muda só o transporte.

### Layout do projeto `app/`
```
app/
├── src/                 # React (inalterado, exceto api.ts / features/terminal/pty.ts)
├── electron/
│   ├── main.ts          # BrowserWindow, registro dos handlers IPC
│   ├── preload.ts       # contextBridge.exposeInMainWorld("multishell", {...})
│   ├── ipc.ts           # nomes de canais = nomes dos commands (snake_case)
│   ├── pty.ts           # node-pty: spawn/write/resize/kill; eventos
│   ├── store.ts         # JSON em app.getPath("userData")/<name>.json
│   ├── provider.ts      # Provider, presets, command/resume lines, slug
│   ├── space.ts         # Space, SpaceSecurity, buildSpawnPlan (pura), materialize
│   ├── secrets.ts       # @napi-rs/keyring; service "multishell", account "<space_id>:<KEY>"
│   └── migration.ts     # plist do app Swift → JSONs
└── electron/__tests__/  # vitest (node), porta dos testes Rust
```

### Bridge no renderer (`window.multishell`)
Mesmos nomes de `api.ts` (camelCase) + `pty`:
```ts
interface MultishellBridge {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>; // canal = command
  onPtyOutput(sessionId: string, cb: (bytes: Uint8Array) => void): () => void;
  onPtyExit(cb: (exit: { session_id: string; code: number | null }) => void): () => void;
  platform: "darwin" | "win32" | "linux";
}
```
`api.ts` e `pty.ts` passam a chamar `window.multishell.invoke(command, args)` com os MESMOS nomes de command e args (`space_spawn_plan`, `{ spaceId, providerId, cwd }` etc.), para não mexer no resto do front. Args chegam ao main como um objeto único.

### Handlers IPC (main)
`ipcMain.handle(command, (_e, args) => ...)` para cada command da tabela. Erros: lançar `Error(mensagem)`; o renderer recebe rejeição.
Eventos: `webContents.send("pty-output", { session_id, data: Uint8Array })` e `("pty-exit", { session_id, code })`. O preload filtra por `session_id`.

### cwd sem polling (substitui `pty_cwd`)
O `.zshrc` gerado no espaço adiciona `precmd` que emite OSC 7: `printf '\e]7;file://%s%s\a' "$HOST" "$PWD"`. O `multishell-profile.ps1` faz o mesmo no `prompt`. O `Terminal.tsx` registra `term.parser.registerOscHandler(7, ...)` e atualiza `session.cwd`. `pty_cwd` continua existindo como fallback (mac: `lsof -a -p <pid> -d cwd -Fn`; win: null), chamado só no `beforeunload`.

### Segurança Electron
`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` no renderer. Nada de `remote`. CSP no `index.html` em produção.

### Build
`electron-vite` (main/preload/renderer) + `electron-builder`: `dmg` (mac, x64+arm64), `nsis` (win, PT-BR + EN). Ícones de `app/build/`.

## Fase 8 — terminal destacado em janela própria (2026-09-06)

Objetivo: arrastar um terminal para outro monitor e devolver ao stack do espaço. O PTY vive no main; janelas só se "anexam".

Tipos:
```ts
interface Session { /* ... */ detached: boolean }   // true enquanto vive numa janela própria
```

Commands novos (main):
| Command | Args | Retorno | Comportamento |
|---|---|---|---|
| `pty_attach` | `session_id` | `Uint8Array` (replay do ring buffer, últimos 256 KB) | Registra a janela chamadora como destino dos eventos daquela sessão. Não cria PTY. |
| `pty_spawn` | (igual) | `void` | Passa a ser **idempotente**: se a sessão já existe, comporta-se como `pty_attach` e devolve `{ attached: true, replay: Uint8Array }`; senão cria e devolve `{ attached: false }`. |
| `session_detach` | `session_id` | `void` | Abre `BrowserWindow` própria carregando o renderer com hash `#/detached/<session_id>`. Marca a janela como dona da sessão. |
| `session_reattach` | `session_id` | `void` | Fecha a janela destacada (se houver) e emite `session-reattached` para a janela principal. |
| `window_role` | | `"main" \| "detached"` + `session_id?` | Para o renderer saber o que renderizar (além do hash). |

Eventos (main → renderers): `pty-output`/`pty-exit` vão para **todas** as janelas anexadas àquela sessão; `session-reattached` `{ session_id }` para a janela principal; `store-changed` `{ name }` para todas as outras janelas quando qualquer janela faz `store_set` (sincroniza `ui-state` entre janelas).

Regras do front:
- `Terminal` NUNCA mata o PTY no unmount. Quem mata: `removeSession` (explícito) e `restartSession`. Fechar a janela destacada pelo botão do sistema = `session_reattach` (não mata).
- Janela principal: sessão com `detached=true` aparece na sidebar com ícone de "janela" e botão "Trazer de volta"; não renderiza o Terminal dela.
- Janela destacada: só barra da sessão (espaço fixo, provider, bypass, iniciar harness) + terminal + botão "Devolver ao espaço". Título da janela = título da sessão.
- Ao receber `store-changed` de `ui-state`, o store recarrega sessões (sem tocar nos Terminais montados cujo id não mudou).

## Arraste de terminais e layouts por espaço

- `session_drop({ sessionId })` retorna `"detach" | "reattach" | "none"`. O main valida a sessão e a janela de origem, consulta a posição atual do cursor e compara com os limites das janelas. Soltar fora da principal destaca; soltar fora da destacada e dentro da área da principal devolve ao espaço original. Soltar na própria janela ou fora de ambas ao devolver não altera nada.
- O arraste usa captura de ponteiro na alça/título, com limiar de 8 pixels. Esc, `pointercancel` e perda de captura cancelam. Texto do terminal continua selecionável.
- As coordenadas são DIP, obtidas por [`screen.getCursorScreenPoint`](https://www.electronjs.org/docs/latest/api/screen#screengetcursorscreenpoint). A nova janela é posicionada no monitor de destino, dentro da área útil.
- A alteração de `detached` é persistida antes de abrir a janela e notificada por `store-changed`. Falha ao abrir restaura o estado anterior. Devolução pelo arraste, botão ou fechamento nativo seleciona a sessão devolvida na principal.
- `workspace-layouts.json` guarda `Record<spaceId, "single" | "list" | "grid" | "vertical" | "horizontal">`. Valor ausente ou inválido usa `single`. O store é separado de `ui-state` para que atualizações de sessão não sobrescrevam os layouts.
- Individual: só o terminal selecionado. Lista: resumo selecionável acima do terminal. Grade: painéis responsivos. Vertical: painéis empilhados. Horizontal: painéis lado a lado. A área permite rolagem quando os tamanhos mínimos dos painéis não cabem.
- Mudanças de espaço/layout mantêm as instâncias de terminal montadas; só a visibilidade e a geometria mudam. `ResizeObserver` ajusta o PTY às dimensões do painel.

## Módulos de Suporte a Agentes de IA

| Módulo | Arquivo | Responsabilidade |
|---|---|---|
| **MCP Hub** | `app/electron/mcp.ts` | Carrega e salva `mcp.json` isolado por espaço; exporta configurações para Claude Desktop / Cursor. |
| **Git Worktrees** | `app/electron/worktree.ts` | Criação, listagem e remoção de worktrees git para sandboxing branch-per-terminal. |
| **Agent Bus** | `app/electron/agent-bus.ts` | Barramento pub/sub local desacoplado para comunicação e orquestração entre agentes. |
| **Guardrails** | `app/electron/guardrail.ts` | Sentinela regex que analisa e bloqueia comandos destrutivos (`rm -rf /`, `dd`, fork bombs, SQL DROP). |
| **Snapshots** | `app/electron/snapshot.ts` | Captura de snapshots de arquivos e cálculo de diffs para auditoria e rollback seguro. |
| **Token Meter** | `app/electron/token-meter.ts` | Telemetria de consumo de tokens e estimativa de custos em USD por modelo e sessão. |
| **Agent Contracts** | `app/electron/agent-contracts.ts` | Gestão de cartas de projeto, papéis especialistas, contratos de entregáveis e gates. |
| **Council & Handoff** | `app/electron/council.ts` | Protocolo de continuidade entre harnesses e arbitragem de consenso multi-modelo. |
| **Semantic Memory** | `app/electron/semantic-memory.ts` | Indexação lexical e busca semântica em histórico de comandos e erros de build. |
| **Context Filter** | `app/electron/context-filter.ts` | Truncador inteligente e monitor de saúde de contexto para economia de tokens. |
| **Port Manager** | `app/electron/port-manager.ts` | Alocação dinâmica de portas efêmeras e prevenção de conflitos de porta entre espaços. |
| **CI Daemon** | `app/electron/ci-daemon.ts` | Runner de testes em background que notifica agentes via Agent Bus. |
| **Voice Gateway** | `app/electron/voice-gateway.ts` | Gateway para transcrição e execução de comandos de voz no terminal ou harness. |
| **Task Sync (Azure/Jira)** | `app/electron/task-sync.ts` | Sincronizador de itens de trabalho do Azure DevOps e Jira com Kanban multiagente. |
| **PII Sanitizer** | `app/electron/pii-sanitizer.ts` | Mascaramento de CPFs, CNPJs, cartões, e-mails e chaves privadas em tempo real. |
| **Loop Watchdog** | `app/electron/loop-watchdog.ts` | Monitor de flapping e loops de erro consecutivos no shell para prevenir gasto de tokens. |
| **Mock Server** | `app/electron/mock-server.ts` | Servidor HTTP embutido zero-dep para endpoints de mock rápidos criados por agentes. |
| **Diff Viewer** | `app/electron/diff-viewer.ts` | Gerador e validador de diffs estruturados para aprovação bloco a bloco. |
| **Agent Eval** | `app/electron/agent-eval.ts` | Arena de benchmark comparando velocidade, custo e taxa de sucesso entre modelos. |
| **Scope Sentinel** | `app/electron/scope-sentinel.ts` | Validador de deriva de escopo contra arquivos protegidos e caminhos não autorizados. |
| **Env Sanitizer** | `app/electron/env-sanitizer.ts` | Interceptador e mascarador de variáveis sensíveis em dumps de ambiente (`env`/`printenv`). |
| **Session Recorder** | `app/electron/session-recorder.ts` | Gravador e reprodutor determinístico de sessões no formato padrão Asciinema v2 (`.cast`). |
| **Webhook Tunnel** | `app/electron/webhook-tunnel.ts` | Receptor e despachante local de webhooks com verificação criptográfica HMAC SHA-256. |




