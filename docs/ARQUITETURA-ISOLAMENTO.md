# Multishell — Proposta: Providers × Espaços × Terminais

Data: 2026-09-06. Estado: **aprovado**. Decisões: Tauri 2; espaços existentes migram com `loadUserZshrc` e `shareKeychain` = true; Cursor usa `cursor-agent`.

## 1. Diagnóstico do código atual

### 1.1 Agentes estão hardcoded
- `AgentType` (ShellSession.swift) fixa 5 combinações: "Claude Peers", "Claude Pessoal", "Antigravity Gemini", "Antigravity Claude", "Codex Pessoal".
- O comando de cada agente existe em 2 lugares: `ShellSession.agentStartCommand` e o menu em `SessionView.swift:170-240`. Mudança em um lugar não reflete no outro.
- Os comandos dependem de `switch-claude`, `switch-agy`, `switch-codex`. Essas funções não existem em `~/.zshrc` nem em `~/.multishell/scripts`. O menu hoje quebra.
- "Claude Peers" e "Claude Pessoal" misturam dois conceitos: o agente (Claude) e o espaço de credenciais (Peers ou Pessoal).

### 1.2 O isolamento vaza credenciais
O objetivo é impedir que o agente veja credenciais fora do seu espaço. Hoje o isolamento troca `HOME`, mas abre 3 portas:

| Porta | Onde | Efeito |
|---|---|---|
| `ZDOTDIR = HOME real` | SessionManager.swift:120 | O `.zshrc` real carrega no shell isolado. Todo `export TOKEN=...` do seu zshrc entra no ambiente do agente. |
| Symlink `Library/Keychains` | SessionManager.swift:95-110 | O agente enxerga o Keychain inteiro do usuário, não só o do espaço. |
| `~/.ssh` e `.gitconfig` copiados por perfil | `~/.multishell/profiles/*` | Cada perfil hoje tem chaves SSH próprias. Isso é bom. Mas não há política definida; é acidente de uso. |

Outros pontos:
- O ambiente é injetado 2 vezes: no `spawn` (PTYHelper.c) e depois digitado como `export ...` após 0,4 s (SessionManager.swift:200). O segundo é corrida com o prompt e aparece no histórico do shell.
- `customEnv` do perfil salva em `UserDefaults` em texto puro. Se você põe `ANTHROPIC_API_KEY` ali, ela fica legível em `~/Library/Preferences`.
- Bypass é por sessão. Correto. Mas as flags de bypass de cada CLI estão hardcoded no Swift.

### 1.3 O que já está certo e fica
- `ShellProfile` com `directoryName` estável e `XDG_*` por perfil.
- `PTYHelper.c` recebe env no spawn. Este é o único canal de env que deve existir.
- Migração por `profileId` com IDs fixos.

## 2. Modelo proposto: 3 conceitos

```
Provider  (o que roda)      claude, codex, agy, cursor-agent, ... N
Espaço    (com quais credenciais)   Pessoal, Peers, Cliente X, ... N
Terminal  (onde roda)        sessão = 1 Espaço + 0..1 Provider + bypass on/off
```

Vários terminais no mesmo Espaço compartilham HOME, env, logins e Keychain do espaço. Isso atende "agrupar N terminais no mesmo espaço de sessão".

### 2.1 Provider (agnóstico)
```swift
struct Provider: Identifiable, Codable {
    let id: UUID
    var name: String            // "Claude Code"
    var executable: String      // "claude"
    var args: [String]          // []
    var bypassArgs: [String]    // ["--dangerously-skip-permissions"]
    var configEnvKey: String?   // "CLAUDE_CONFIG_DIR" → app aponta para <espaço>/providers/claude
    var extraEnv: [EnvVariable]
    var icon: String            // SF Symbol
}
```
**Harness genérico.** O usuário instala qualquer IDE/CLI na máquina e cadastra no app: nome do harness, caminho do executável, args normais, args de bypass. Nada é fixo no código. Os presets abaixo são só atalhos que preenchem o formulário; o usuário edita ou apaga.

Presets embutidos (editáveis, não fixos):

| Provider | executable | bypassArgs | configEnvKey |
|---|---|---|---|
| Claude Code | `claude` | `--dangerously-skip-permissions` | `CLAUDE_CONFIG_DIR` |
| Codex | `codex` | `--dangerously-bypass-approvals-and-sandbox` | `CODEX_HOME` |
| Antigravity | `agy` | `--dangerously-skip-permissions` | nenhum (usa `HOME`) |
| Cursor | `cursor-agent` | `--force` | nenhum (usa `HOME/.cursor`) |

Variante de modelo ("Antigravity Claude") vira um Provider a mais com `args: ["--model", "..."]`. Sem enum.

Comando final = `executable + args + (bypass ? bypassArgs : [])`. Montado em um só lugar: `Provider.command(bypass:)`.

### 2.2 Espaço (rename de `ShellProfile`)
Mantém `directoryName`, `customEnv` e cor. Adiciona política de segurança explícita:

```swift
struct SpaceSecurity: Codable {
    var loadUserZshrc: Bool      = false  // ZDOTDIR = espaço; opcional "source ~/.zshrc"
    var shareKeychain: Bool      = false  // symlink Library/Keychains só se true
    var shareSSH: Bool           = false  // symlink ~/.ssh só se true
    var shareGitConfig: Bool     = false
    var inheritProcessEnv: Bool  = false  // se false, env do app não passa para o shell
}
```
Padrão: tudo `false`. Espaço novo nasce fechado. Você abre porta por porta.

`ZDOTDIR` passa a ser `<espaço>/.zsh`. O app gera um `.zshrc` mínimo:
```zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
[[ -f "$HOME/.zshrc.local" ]] && source "$HOME/.zshrc.local"   # do próprio espaço
# se loadUserZshrc: source ~/.zshrc (ex.: /Users/<user>/.zshrc)
```

Segredos em `customEnv`: campo `isSecret`. Valor secreto vai para o Keychain do app (service `multishell.<espaço>.<KEY>`). `UserDefaults` guarda só a chave.

### 2.3 Terminal (sessão)
```swift
struct ShellSession {
    var spaceId: UUID          // rename de profileId
    var providerId: UUID?      // rename de activeAgent
    var bypassMode: Bool
    ...
}
```
Sem `cleaningAgentSuffix`. O título não carrega mais o nome do agente; a UI mostra o ícone do Provider ao lado.

## 3. Settings: 3 abas novas + Terminal

| Aba | Conteúdo |
|---|---|
| **Providers** | Lista N providers. Editor: nome, executável, args, bypass args, config env key, env extra. Botão "Restaurar presets". |
| **Espaços** | Lista N espaços. Editor: nome, cor, pasta, variáveis (com toggle segredo), política de segurança (5 toggles). Botão "Abrir pasta". |
| **Terminal** | Shell, fonte, tema, pasta inicial. (junta Aparência + Shell atuais) |
| **Favoritos** | Como hoje, referenciando `spaceId` + `providerId`. |

Barra da sessão: `[Espaço ▾] [Provider ▾] [⚡ bypass] [★] [🎨] [🗑]`.
Trocar Espaço reinicia o shell (HOME muda). Trocar Provider só envia o comando.

## 4. Segurança: o que muda de fato

1. `.zshrc` real não carrega por padrão. Tokens do seu zshrc não chegam ao agente.
2. Keychain não é compartilhado por padrão. Claude Code guarda OAuth no Keychain; com `CLAUDE_CONFIG_DIR` por espaço ele isola a entrada. **Ponto a validar**: confirmar na versão instalada do `claude` que o nome da entrada no Keychain inclui o config dir. Se não incluir, o toggle `shareKeychain` do espaço fica ligado só para Claude e o doc registra a limitação.
3. Env entra só pelo `spawn`. Remove o `export` digitado.
4. Segredos saem do `UserDefaults`.
5. Bypass continua 1 clique, por terminal, e agora funciona para qualquer provider.

## 5. Migração
- `ShellProfile` → `Space`: mesma pasta, mesmo `id`. Zero perda de login.
- `AgentType` → `providerId`: `claudePeers`/`claudePersonal` → preset Claude; `agyGemini` → Antigravity; `agyClaude` → "Antigravity (Claude)"; `codexPersonal` → Codex.
- Espaços existentes recebem `loadUserZshrc = true` e `shareKeychain = true` na migração, para não quebrar nada no dia 1. Você desliga depois, espaço por espaço.

## 6. Fases (TDD: teste antes de cada fase)
Hoje não há target de testes. Fase 0 cria `MultiShellTests` no `Package.swift` e separa `Models` em target `MultiShellCore` (sem SwiftUI) para testar sem app.

| Fase | Entrega | Teste vermelho primeiro |
|---|---|---|
| 0 | Target de testes + `MultiShellCore` | build passa |
| 1 | `Provider` + presets + `command(bypass:)` | comando gerado por provider/bypass |
| 2 | `Space` + `SpaceSecurity` + `shellEnvironment` puro | env não contém `ZDOTDIR` real quando `loadUserZshrc == false` |
| 3 | Migração `ShellProfile`/`AgentType` → novos ids | JSON antigo decodifica para novo modelo |
| 4 | Settings: abas Providers / Espaços / Terminal | manual |
| 5 | Segredos no Keychain | round-trip set/get/delete |
| 6 | Remover `export` digitado e symlink incondicional | env vem só do spawn |

## 7. Decisões que precisam do seu OK
1. Nome: "Espaço" (vs manter "Perfil").
2. Espaços existentes migram com portas abertas (`loadUserZshrc`, `shareKeychain` = true). Alternativa: migrar fechado e você reautentica.
3. Cursor: preset com `cursor-agent`. Confirmar o binário que você usa.

## 8. Mac + Windows + PT/EN: nova base técnica

Requisito novo (2026-09-06): client instalável em macOS e Windows, com português e inglês. A UI pode ser refeita.

O código Swift atual não serve para Windows. SwiftUI, SwiftTerm e `openpty` são só macOS. O que sobrevive é o **modelo** das seções 2 a 5 (Provider, Espaço, Terminal, segurança, migração). A implementação muda.

### 8.1 Stack recomendada: Tauri 2 + React/TypeScript + xterm.js

| Camada | Tecnologia | Por quê |
|---|---|---|
| UI | React + TypeScript + xterm.js | Sua stack dominante. xterm.js é o terminal do VS Code. |
| i18n | `i18next` + `react-i18next`, arquivos `pt-BR.json` e `en.json` | Padrão de mercado. Troca de idioma sem reload. |
| Backend | Rust (Tauri 2) com crate `portable-pty` | Um só código para PTY: `openpty` no Mac, ConPTY no Windows. |
| Segredos | crate `keyring` | Keychain no Mac, Credential Manager no Windows. Mesma API. |
| Instalador | `tauri build` | Gera `.dmg` (Mac) e `.msi`/`.exe` NSIS (Windows). Assinatura opcional depois. |
| Estado | JSON em `appDataDir` | `~/Library/Application Support/Multishell` no Mac, `%APPDATA%\Multishell` no Windows. |

Alternativa: **Electron + node-pty**. Tudo em TypeScript, sem Rust. Custo: 150 MB por instalador e mais RAM. Só vale se você não quiser tocar Rust. O backend Rust aqui tem ~500 linhas: spawn PTY, env, keyring, arquivos.

Recomendação: **Tauri**. Motivo: instalador de ~10 MB, isolamento de env fica no processo nativo (mais seguro que no renderer), e `portable-pty` já resolve ConPTY.

### 8.2 Isolamento por sistema operacional
O Espaço tem uma pasta raiz por SO. O backend traduz a política de segurança:

| Conceito | macOS | Windows |
|---|---|---|
| HOME do espaço | `HOME=<raiz>` | `USERPROFILE=<raiz>`, `HOME=<raiz>`, `APPDATA=<raiz>\AppData\Roaming`, `LOCALAPPDATA=<raiz>\AppData\Local` |
| Shell padrão | `/bin/zsh` | `pwsh.exe` ou `powershell.exe` |
| Perfil do shell | `ZDOTDIR=<raiz>/.zsh` com `.zshrc` gerado | `pwsh -NoProfile` + `$PROFILE` gerado em `<raiz>\Documents\PowerShell\` |
| `loadUserZshrc` | `source ~/.zshrc` | `. $HOME\Documents\PowerShell\profile.ps1` do usuário |
| `shareKeychain` | symlink `Library/Keychains` | não existe equivalente; Credential Manager é sempre do usuário. Toggle fica oculto no Windows. |
| `shareSSH` | symlink `~/.ssh` | junction `%USERPROFILE%\.ssh` |
| Segredos do espaço | Keychain via `keyring` | Credential Manager via `keyring` |

`CLAUDE_CONFIG_DIR`, `CODEX_HOME` e demais `configEnvKey` funcionam igual nos dois sistemas. O preset de Provider ganha `executable` por SO (`claude` vs `claude.cmd` quando instalado via npm no Windows).

### 8.3 Estrutura do novo projeto
```
multishell/
├── src/                     # React + TS
│   ├── i18n/{pt-BR,en}.json
│   ├── features/providers/  # aba Providers
│   ├── features/spaces/     # aba Espaços
│   ├── features/terminal/   # xterm.js + barra da sessão
│   └── features/settings/
├── src-tauri/src/
│   ├── pty.rs               # portable-pty: spawn, read, write, resize
│   ├── space_env.rs         # política de segurança → env + arquivos gerados
│   ├── secrets.rs           # keyring
│   └── store.rs             # providers.json, spaces.json, sessions.json
└── tests/
    ├── src-tauri (cargo test)   # env, migração, comando por provider
    └── vitest                   # componentes e i18n
```

### 8.4 Fases revisadas
| Fase | Entrega | Teste vermelho primeiro |
|---|---|---|
| 0 | Scaffold Tauri + React + i18n com 2 idiomas; 1 terminal xterm.js funcionando no Mac e no Windows | e2e: abrir shell, rodar `echo ok` |
| 1 | `Provider` + presets + `command(bypass)` em Rust | cargo test: comando gerado |
| 2 | `Space` + `SpaceSecurity` + `space_env` por SO | cargo test: env fechado não contém ZDOTDIR real |
| 3 | Migração do JSON do app Swift (`UserDefaults` export) | JSON antigo → novo modelo |
| 4 | UI: abas Providers / Espaços / Terminal / Favoritos, barra da sessão | vitest + snapshot PT/EN |
| 5 | Segredos via `keyring` | round-trip nos 2 SOs |
| 6 | Instaladores `.dmg` e `.msi`, CI com GitHub Actions (matrix mac + windows) | build verde nos 2 |

### 8.5 O que fica do app Swift
- Pastas `~/.multishell/profiles/*` viram raiz dos Espaços. Nenhum login se perde no Mac.
- O app Swift continua funcionando até a Fase 4. Sem big-bang.

### 8.6 Decisões adicionais
4. Tauri (Rust fino) ou Electron (só TS).
5. Shell padrão no Windows: `pwsh` (PowerShell 7) ou `powershell.exe` 5.1.
