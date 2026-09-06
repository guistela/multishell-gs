# Roadmap e Arquitetura de Funcionalidades para Agentes de IA

O **Multishell** foi projetado como uma estação de trabalho para fluxos modernos de desenvolvimento em par com agentes autônomos de Inteligência Artificial (Claude Code, Gemini CLI, Cursor, Aider, Devin, goose, etc.).

---

## 🚀 Funcionalidades Implementadas (Módulos Ativos no Core)

### 1. Model Context Protocol (MCP) Hub por Espaço (`app/electron/mcp.ts`)
- **Objetivo**: Fornecer configurações de ferramentas e recursos MCP isoladas por espaço.
- **Como funciona**:
  - Cada espaço pode declarar seus servidores MCP (filesystem, postgres, github, etc.) em seu diretório de perfil (`mcp.json`).
  - Permite materialização e sincronização transparente com clientes MCP externos (Claude Desktop, Cursor, Cline).
  - Impede que um agente no espaço de teste acesse credenciais ou ferramentas de produção.

### 2. Git Worktree Sandbox Manager (`app/electron/worktree.ts`)
- **Objetivo**: Permitir que agentes trabalhem em branches e diretórios separados simultaneamente sem lock e sem clonar repositórios do zero.
- **Como funciona**:
  - Gestão nativa de `git worktree add`, `git worktree list` e `git worktree remove`.
  - Agentes podem testar refatorações arriscadas em diretórios isolados sem interferir no workdir principal do desenvolvedor.

### 3. Agent-to-Agent Bus (`app/electron/agent-bus.ts`)
- **Objetivo**: Barramento de comunicação entre terminais e agentes com suporte duplo a Pipes diretos e Tópicos Pub/Sub.
- **Como funciona**:
  - Tópicos nomeados (ex.: `ci/status`, `code-review/request`).
  - Pipes de sessão para sessão com filtros regex e funções de transformação.
  - Suporta filtragem por espaço ou broadcast global.

### 4. Guardrail Sentinela de Comandos Destrutivos (`app/electron/guardrail.ts`)
- **Objetivo**: Barreira de segurança preventiva contra alucinações destrutivas de agentes de IA com modo bypass ativado.
- **Como funciona**:
  - Interceptação e análise de comandos via regex de segurança antes ou durante a execução no shell.
  - Bloqueia:
    - Remoção recursiva de diretórios raiz/home (`rm -rf /`, `rm -rf ~`, `rm -rf *`).
    - Ataques de negação de serviço tipo Fork Bomb (`:(){ :|:& };:`).
    - Formatação de discos ou gravação binária em blocos (`mkfs`, `fdisk`, `dd`).
    - Destruição de banco de dados (`DROP DATABASE`, `TRUNCATE TABLE`).
    - Rollbacks destrutivos não recuperáveis no git (`git reset --hard HEAD~N`).

### 5. Space Time Machine & Rollbacks (`app/electron/snapshot.ts`)
- **Objetivo**: Snapshots diferenciais do estado do espaço antes de execuções automatizadas de agentes.
- **Como funciona**:
  - Cria pontos de restauração (`createSnapshot`) registrando arquivos modificados e seus hashes SHA-256.
  - Calcula diferenças estruturadas (`diffSnapshots`) para auditar o que o agente alterou.
  - Permite rollback seletivo caso o agente introduza regressões.

### 6. Live Token & Cost Meter (`app/electron/token-meter.ts`)
- **Objetivo**: Visibilidade em tempo real do consumo de tokens e custos em dólares por sessão e por espaço.
- **Como funciona**:
  - Tabela de precificação de modelos líderes (Claude 3.5 Sonnet, Claude 3.7 Sonnet, GPT-4o, Gemini 1.5 Pro/Flash, Gemini 2.0 Flash, etc.).
  - Registro histórico de entradas/saídas por sessão.
  - Agregação de custos por espaço e detecção de picos de consumo anômalos.

### 7. Motor de Contratos e Papéis Especialistas Multiagente (`app/electron/agent-contracts.ts`)
- **Objetivo**: Formalização de cartas de projeto com especialização de papéis (Arquiteto, Implementador, QA, SecOps).
- **Como funciona**:
  - Define contratos estritos de entrada/saída e diretrizes de atuação por papel.
  - Portões de validação de entregáveis (*Deliverables Gates*) antes de permitir passagem de bastão.
  - Injeção de regras contratuais diretamente no prompt de inicialização do harness.
  - Veja o guia dedicado: [`docs/AGENT-CONTRACTS-GUIDE.md`](AGENT-CONTRACTS-GUIDE.md).

### 8. Conselho Multi-Modelo & Protocolo de Continuidade (`app/electron/council.ts`)
- **Objetivo**: Continuidade e handoff fluído entre modelos e CLIs distintos (Claude -> Gemini -> Codex) e arbitragem de divergências.
- **Como funciona**:
  - Empacotamento de estado (`HandoffPacket`) com resumo, arquivos tocados, status de testes e próximos passos.
  - Formatação customizada de prompts de continuidade para o harness de destino.
  - Mecanismo de votação ponderada entre múltiplos modelos para aprovação de planos arquiteturais críticos.

### 9. Memória Semântica de Terminal (`app/electron/semantic-memory.ts`)
- **Objetivo**: Indexação lexical e busca semântica em histórico de comandos, builds e logs.
- **Como funciona**:
  - Permite que o agente consulte erros passados sem consumir dezenas de milhares de tokens da janela de contexto.
  - Busca por relevância ponderada por comando, tags e snippets de código.

### 10. Monitor de Janela de Contexto & Truncador Inteligente (`app/electron/context-filter.ts`)
- **Objetivo**: Prevenção de estouro de contexto e redução dramática de custos de API ao lidar com saídas verbosas.
- **Como funciona**:
  - Remove códigos de escape ANSI.
  - Trunca logs mantendo cabeçalho, rodapé e extraindo blocos de stack traces e falhas.
  - Emite estimativa de tokens poupados em cada operação.

### 11. Isolamento de Portas Efêmeras & Service Tunneling (`app/electron/port-manager.ts`)
- **Objetivo**: Resolução automática de conflitos de porta (`EADDRINUSE`) entre espaços e worktrees.
- **Como funciona**:
  - Alocação dinâmica de portas para serviços locais (ex: 3000, 3001, 3002).
  - Injeção padronizada de variáveis de ambiente (`PORT`, `VITE_PORT`, `NEXT_PUBLIC_PORT`) no spawn plan do terminal.

### 12. Daemon de Verificação Contínua em Background (`app/electron/ci-daemon.ts`)
- **Objetivo**: Execução autônoma de linters e testes em background após modificações de agentes.
- **Como funciona**:
  - Registra jobs por espaço e worktree.
  - Publica resultados de compilação diretamente no `Agent Bus` (`ci/status`) para notificar o agente.

### 13. Gateway de Comandos por Voz (`app/electron/voice-gateway.ts`)
- **Objetivo**: Transformação de comandos falados em ações de terminal ou prompts diretos para o agente ativo.
- **Como funciona**:
  - Mapeia hotwords ("rodar testes", "revisar código", "criar snapshot") em comandos ou prompts estruturados.

### 14. Sincronizador de Tarefas Azure DevOps & Jira (`app/electron/task-sync.ts`)
- **Objetivo**: Conectar o Kanban multiagente aos backlogs do Azure Boards e Jira.
- **Como funciona**:
  - Zero dependências npm pesadas (usa Node.js `fetch` nativo).
  - Um agente especialista (`scrum_master` / `tech_lead`) pode consultar issues, atualizar status e gerar resumos em Markdown para os outros terminais.

### 15. Sanitizador e Mascarador de PII em Tempo Real (`app/electron/pii-sanitizer.ts`)
- **Objetivo**: Impedir que dados sensíveis de clientes ou segredos trafeguem para a tela ou para as APIs dos LLMs.
- **Como funciona**:
  - Mascara CPFs, CNPJs, cartões de crédito, e-mails de clientes reais, tokens Bearer e chaves privadas RSA/SSH antes do buffer ir para os logs ou prompts.

### 16. Watchdog de Loop Infinito do Shell (`app/electron/loop-watchdog.ts`)
- **Objetivo**: Detectar quando um agente entra em repetição cíclica improdutiva.
- **Como funciona**:
  - Rastreia execuções recentes de comandos; se o mesmo comando falha 3 vezes consecutivas sem sucesso, emite alerta e sugere intervenção.

### 17. Servidor de Mocks e Fixtures Local (`app/electron/mock-server.ts`)
- **Objetivo**: Subir endpoints HTTP simulados em milissegundos sem depender de bibliotecas externas.
- **Como funciona**:
  - O agente Arquiteto pode cadastrar rotas JSON em memória (`node:http`) para destravar o desenvolvimento do Front-end.

### 18. Arena de Benchmarks & Comparação de Agentes (`app/electron/agent-eval.ts`)
- **Objetivo**: Executar o mesmo teste com modelos diferentes (ex: Claude vs Gemini) e gerar relatório objetivo de velocidade, custo em dólares e taxa de sucesso.

### 20. Sentinela de Deriva de Escopo (`app/electron/scope-sentinel.ts`)
- **Objetivo**: Garantir que agentes modifiquem exclusivamente os arquivos permitidos pela tarefa/issue.
- **Como funciona**:
  - Regras de globs permitidos e caminhos estritamente proibidos (`package.json`, infraestrutura, etc.).
  - Calcula a taxa de deriva (drift percentage) e alerta o desenvolvedor se o agente tentar refatorar fora do escopo.

### 21. Sanitizador de Variáveis de Ambiente no Shell (`app/electron/env-sanitizer.ts`)
- **Objetivo**: Impedir que senhas e chaves de API secretas vazem na tela ao rodar `env`, `printenv` ou `export`.
- **Como funciona**:
  - Identifica chaves sensíveis por padrão (`*_SECRET`, `*_KEY`, `*_TOKEN`, `*_PASSWORD`, `*_PAT`).
  - Mascara os valores dinamicamente no fluxo de saída: `ANTHROPIC_API_KEY=[REDACTED_SECRET_ANTHROPIC_API_KEY]`.

### 22. Gravador e Reprodutor Determinístico de Sessões (`app/electron/session-recorder.ts`)
- **Objetivo**: Gravar o fluxo completo de I/O dos terminais para auditoria e análise de bugs.
- **Como funciona**:
  - Formato universal e compacto compatível com Asciinema v2 (`.cast` / NDJSON).
  - Permite reproduzir passo a passo o que o agente digitou e o que o terminal respondeu.

### 23. Receptor e Túnel de Webhooks Local (`app/electron/webhook-tunnel.ts`)
- **Objetivo**: Receber eventos externos (GitHub PRs, Azure DevOps Service Hooks, Stripe) e acionar agentes via barramento.
- **Como funciona**:
  - Verificação de integridade via HMAC SHA-256 contra adulterações.
  - Publicação automática no canal do `Agent Bus` (`webhook/github`, `webhook/azure_devops`).

---

## 🤔 Estamos colocando coisas demais no aplicativo? (Reflexão Arquitetural)

A preocupação com o chamado **"Feature Creep"** ou inchaço (bloatware) é muito saudável e legítima. Em projetos como o Multishell, seguir os princípios do **Unix & Microkernel Architecture** é o que garante que o software não perca performance nem confiabilidade:

### 1. O Princípio do Core Enxuto (Minimalist Kernel)
- O **coração** do Multishell é exclusivamente:
  - Sandboxing de `$HOME` e PTYs (`node-pty`).
  - Cofre seguro de credenciais (`@napi-rs/keyring`).
  - Janelas destacáveis e layouts em grade.
- Esse núcleo não depende de nenhuma dessas funcionalidades avançadas de IA para funcionar com velocidade máxima.

### 2. Módulos Isolados como Extensões Puras (Zero-Dependency Adapters)
- Todas as novas funcionalidades criadas são **módulos TypeScript puros**, usando exclusivamente a standard library do Node.js (`node:http`, `node:fs`, `node:crypto`) e `fetch` nativo.
- **Não adicionamos nenhum pacote npm pesado**.
- Se o usuário não ativar o Kanban ou o Mock Server, o consumo de CPU e memória deles em tempo de execução é **zero**.

### 3. Ativação Sob Demanda (Opt-in)
- Para o desenvolvedor que só quer um terminal isolado: o Multishell comporta-se como um emulador de terminal leve.
- Para o desenvolvedor que opera enxames de agentes de IA: o Multishell transforma-se em uma **Estação de Trabalho Orquestrada para Agentes**.

---

## 💡 Próximas Sugestões Futuras (Backlog de Inovação)

1. **Malha P2P de Agentes & Sincronização entre Máquinas (WebRTC / Tailscale)**: Pareamento de instâncias do Multishell rodando em máquinas diferentes (ex: MacBook local e servidor Linux com GPUs remotas) para distribuição transparente de compilações pesadas.
2. **Detector de Alucinação de Pacotes (Package Hallucination Sentinel)**: Consulta assíncrona ao registro público (NPM / PyPI / Crates.io) antes de permitir que o agente rode `npm install`, evitando ataques de *slopsquatting* ou dependências fictícias.
3. **Conversor Automático de Sessão Gravada para Teste de Regressão**: Transforma uma gravação `.cast` onde o agente encontrou um bug em um teste Vitest/Playwright reproduzível em um clique.
4. **Agente Scrum Master com Rotina de Daily Automática**: Um agente que compila no final do dia os commits das worktrees e posta um resumo de progresso formatado no Slack/Teams ou no Jira.
5. **Smart Resource Capping (Controle de CPU & Memória por Espaço)**: Evita que compilações pesadas ou testes em loop do agente congelem o computador, impondo limites de CPU (`nice` / `cpulimit`) por terminal.
6. **Live Multi-User Pair Programming (Terminal Compartilhado)**: Permite convidar outro colega desenvolvedor para visualizar e interagir com a mesma sessão do agente remotamente em tempo real.


