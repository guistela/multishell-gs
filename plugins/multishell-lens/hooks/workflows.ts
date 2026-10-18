// Os agentes de um workflow não passam pelo agent.spawn nem aparecem no
// $.agent.list(): o motor só dá o id deles (nas chamadas de ferramenta). O
// nome que o script lhes deu, a fase, o pedido e o resultado ficam nos
// arquivos da execução, ao lado da transcrição da sessão:
// <projetos>/<pasta do projeto>/<sessão>/subagents/workflows/<run>/
//   journal.jsonl        um evento por linha: started (rótulo e fase) e result
//   agent-<id>.jsonl     a transcrição do agente (o pedido calculado vem nela)
//   agent-<id>.meta.json o modelo pedido
// Funções puras: o register.tsx lê os arquivos e grava.

export type AgenteDoWorkflow = {
  id: string
  rotulo: string
  fase?: string
  workflow: string
  // O que o agente devolveu (a saída estruturada), quando já terminou.
  resultado?: unknown
}

const objeto = (valor: unknown): Readonly<Record<string, unknown>> | undefined =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Readonly<Record<string, unknown>>)
    : undefined

const texto = (valor: unknown): string | undefined => (typeof valor === 'string' && valor !== '' ? valor : undefined)

const linhasJson = (conteudo: string): Readonly<Record<string, unknown>>[] =>
  conteudo.split('\n').flatMap(linha => {
    if (linha.trim() === '') {
      return []
    }

    try {
      const lido = objeto(JSON.parse(linha))

      return lido === undefined ? [] : [lido]
    } catch {
      // Uma linha cortada (o journal ainda sendo escrito) fica de fora.
      return []
    }
  })

// Os agentes que o journal de uma execução conhece, com o rótulo e a fase do
// "started" e o resultado do "result".
export const lerJournal = (conteudo: string, workflow: string): AgenteDoWorkflow[] => {
  const porId = new Map<string, AgenteDoWorkflow>()
  const porChave = new Map<string, string>()

  for (const evento of linhasJson(conteudo)) {
    const id = texto(evento.agentId)
    const chave = texto(evento.key)

    if (evento.type === 'started' && id !== undefined) {
      const fase = texto(evento.phase)
      porId.set(id, {
        id,
        rotulo: texto(evento.label) ?? 'agente',
        workflow,
        ...(fase === undefined ? {} : { fase }),
      })

      if (chave !== undefined) {
        porChave.set(chave, id)
      }
    }

    if (evento.type === 'result') {
      const dono = id ?? (chave === undefined ? undefined : porChave.get(chave))
      const agente = dono === undefined ? undefined : porId.get(dono)

      if (agente !== undefined && 'result' in evento) {
        porId.set(agente.id, { ...agente, resultado: evento.result })
      }
    }
  }

  return [...porId.values()]
}

const MARCA_DO_PEDIDO = 'The computed task text follows:\n'

// O texto de uma mensagem da transcrição (uma string, ou os blocos de texto).
const textoDaMensagem = (mensagem: unknown): string => {
  const conteudo = objeto(mensagem)?.content

  if (typeof conteudo === 'string') {
    return conteudo
  }

  if (!Array.isArray(conteudo)) {
    return ''
  }

  return conteudo
    .map(bloco => (objeto(bloco)?.type === 'text' ? (texto(objeto(bloco)?.text) ?? '') : ''))
    .join('\n')
}

// O pedido que o agente recebeu: o texto calculado pelo script, sem a moldura
// que o motor põe em volta (cada linha dele vem recuada dois espaços).
export const pedidoDaTranscricao = (conteudo: string): string | undefined => {
  // Só o começo: o pedido vem na segunda mensagem, e a transcrição pode ser enorme.
  for (const linha of linhasJson(conteudo.split('\n').slice(0, 12).join('\n'))) {
    if (linha.type !== 'user') {
      continue
    }

    const corpo = textoDaMensagem(linha.message)
    const marca = corpo.indexOf(MARCA_DO_PEDIDO)

    if (marca >= 0) {
      return corpo
        .slice(marca + MARCA_DO_PEDIDO.length)
        .split('\n')
        .map(uma => uma.replace(/^ {2}/, ''))
        .join('\n')
        .trim()
    }
  }

  return undefined
}

// O último texto que o agente escreveu, para quem não devolve saída estruturada.
export const ultimoTextoDaTranscricao = (conteudo: string): string | undefined => {
  const escritos = linhasJson(conteudo)
    .filter(linha => linha.type === 'assistant')
    .map(linha => textoDaMensagem(linha.message).trim())
    .filter(escrito => escrito !== '')

  return escritos.at(-1)
}

// O modelo pedido no meta.json do agente ("opus", "sonnet"...).
export const modeloDoMeta = (conteudo: string): string | undefined => {
  try {
    return texto(objeto(JSON.parse(conteudo))?.model)
  } catch {
    return undefined
  }
}

// O resultado de um agente como o detalhe o mostra: texto puro, ou o JSON
// da saída estruturada num bloco de código.
export const resultadoEmTexto = (resultado: unknown): string | undefined => {
  if (resultado === undefined || resultado === null) {
    return undefined
  }

  if (typeof resultado === 'string') {
    return resultado.trim() === '' ? undefined : resultado
  }

  const campos = objeto(resultado)
  // Uma saída com um campo de resumo em texto: ele vem primeiro.
  const resumo = campos === undefined ? undefined : texto(campos.resumo) ?? texto(campos.summary)
  const json = JSON.stringify(resultado, null, 2)

  return `${resumo === undefined ? '' : `${resumo}\n\n`}\`\`\`json\n${json}\n\`\`\``
}

// O arquivo da execução (<sessão>/workflows/<run>.json), gravado só quando
// ela termina: o nome do workflow, como terminou e, de cada agente, o estado,
// a duração e o começo do pedido.
export type AgenteDaExecucao = {
  estado?: string
  duracaoMs?: number
  pedido?: string
}

export type Execucao = {
  nome?: string
  status?: string
  agentes: Map<string, AgenteDaExecucao>
}

export const lerExecucao = (conteudo: string): Execucao | undefined => {
  try {
    const lido = objeto(JSON.parse(conteudo))

    if (lido === undefined) {
      return undefined
    }

    const agentes = new Map<string, AgenteDaExecucao>()
    const progresso = Array.isArray(lido.workflowProgress) ? lido.workflowProgress : []

    for (const item of progresso) {
      const campos = objeto(item)
      const id = texto(campos?.agentId)

      if (campos === undefined || id === undefined || campos.type !== 'workflow_agent') {
        continue
      }

      const estado = texto(campos.state)
      const pedido = texto(campos.promptPreview)
      agentes.set(id, {
        ...(estado === undefined ? {} : { estado }),
        ...(typeof campos.durationMs === 'number' ? { duracaoMs: campos.durationMs } : {}),
        ...(pedido === undefined ? {} : { pedido }),
      })
    }

    const nome = texto(lido.workflowName) ?? nomeDoScript(conteudo)
    const status = texto(lido.status)

    return { agentes, ...(nome === undefined ? {} : { nome }), ...(status === undefined ? {} : { status }) }
  } catch {
    return undefined
  }
}

// O nome do workflow no script salvo (`meta.name`), quando dá para ler.
export const nomeDoScript = (conteudo: string): string | undefined => {
  try {
    const script = texto(objeto(JSON.parse(conteudo))?.script) ?? ''

    return /name:\s*['"`]([^'"`]+)['"`]/.exec(script)?.[1]
  } catch {
    return undefined
  }
}
