// A aba Inventário: tudo o que o Claude Code tem instalado e configurado, e o
// que disso está ativo nesta sessão. Tudo é lido localmente, sem requisição
// ao modelo: as listas da própria sessão ($.command.list, $.tool.list, o
// detalhamento estimado do contexto), as configurações ($.settings.read) e os
// arquivos dos plugins, skills e agentes no disco.

import type {
  CommandInfo,
  FsEntry,
  SessionContextBreakdown,
  Settings,
  SettingsSource,
  ToolInfo,
} from 'claude-code'

import type { LensInventario, LensItem, LensTipoDeItem } from '../types'
import { curto, plural, umaLinha } from './formato'

const MAX_ITENS = 800
const MAX_DESCRICAO = 220
const MAX_PLUGINS = 60

export const INVENTARIO_INICIAL: LensInventario = { itens: [] }

// O cabeçalho YAML de um .md (skill, agente, comando, estilo): só os campos
// de uma linha e os blocos `>`/`|` simples, o que basta para nome e descrição.
export const lerCabecalho = (texto: string): Record<string, string> => {
  const bloco = /^---\r?\n([\s\S]*?)\r?\n---/.exec(texto)?.[1]
  const campos: Record<string, string> = {}

  if (bloco === undefined) {
    return campos
  }

  const linhas = bloco.split(/\r?\n/)

  for (let i = 0; i < linhas.length; i += 1) {
    const casou = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(linhas[i] ?? '')

    if (casou === null) {
      continue
    }

    const [, chave = '', bruto = ''] = casou
    let valor = bruto.trim()

    if (valor === '>' || valor === '|' || valor === '>-' || valor === '|-' || valor === '') {
      const corpo: string[] = []

      while (i + 1 < linhas.length && /^\s+\S/.test(linhas[i + 1] ?? '')) {
        corpo.push((linhas[i + 1] ?? '').trim())
        i += 1
      }

      valor = corpo.join(' ')
    }

    campos[chave] = valor.replace(/^(["'])([\s\S]*)\1$/, '$2')
  }

  return campos
}

const descricao = (texto: string | undefined): string | undefined => {
  const limpo = umaLinha(texto ?? '')

  return limpo === '' ? undefined : curto(limpo, MAX_DESCRICAO)
}

const objeto = (valor: unknown): Readonly<Record<string, unknown>> =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor)
    ? (valor as Readonly<Record<string, unknown>>)
    : {}

const texto = (valor: unknown): string | undefined => (typeof valor === 'string' ? valor : undefined)

// O nome de uma skill sem o prefixo do plugin ("plugin:skill" vira "skill").
const semPrefixo = (nome: string): string => nome.slice(nome.lastIndexOf(':') + 1)

// De onde o inventário lê: o register.tsx passa funções que chamam `$` (o
// `$` não atravessa um import). Cada uma devolve vazio quando falha.
export type Fontes = {
  casa: string
  configuracao: string
  lerTexto: (caminho: string) => Promise<string | undefined>
  listar: (caminho: string) => Promise<readonly FsEntry[]>
  comandos: () => Promise<readonly CommandInfo[]>
  ferramentas: () => Promise<readonly ToolInfo[]>
  detalhe: () => Promise<SessionContextBreakdown | undefined>
  configuracoes: (fonte?: SettingsSource) => Promise<Settings>
  agora: () => Promise<number>
  // As pastas dos plugins carregados de pasta local (CLAUDE_CODE_PLUGIN_DIRS),
  // se o register.tsx souber passá-las: só ele lê o ambiente. Sem ela, esses
  // plugins saem pelo que a sessão lista deles (comandos e skills).
  pastasDePlugins?: () => Promise<readonly string[]>
}

type Leitor = {
  json: (caminho: string) => Promise<unknown>
  texto: (caminho: string) => Promise<string | undefined>
  pastas: (caminho: string) => Promise<string[]>
  arquivos: (caminho: string, extensao: string) => Promise<string[]>
}

const leitor = (fontes: Fontes): Leitor => {
  const { lerTexto, listar } = fontes

  return {
    texto: lerTexto,
    json: async caminho => {
      const lido = await lerTexto(caminho)

      try {
        return lido === undefined ? undefined : (JSON.parse(lido) as unknown)
      } catch {
        return undefined
      }
    },
    pastas: async caminho =>
      (await listar(caminho)).filter(entrada => entrada.kind === 'dir' || entrada.isLink).map(entrada => entrada.name),
    arquivos: async (caminho, extensao) =>
      (await listar(caminho))
        .filter(entrada => entrada.kind !== 'dir' && entrada.name.endsWith(extensao))
        .map(entrada => entrada.name),
  }
}

// Os itens de uma pasta com o formato de plugin (ou a pasta de configuração
// do usuário, ou o .claude do projeto): skills, comandos, agentes e estilos.
const pecasDaPasta = async (
  ler: Leitor,
  base: string,
  origem: string,
  isAtivo: boolean,
  plugin?: string,
): Promise<LensItem[]> => {
  const itens: LensItem[] = []
  const comPlugin = plugin === undefined ? {} : { plugin }

  for (const nome of await ler.pastas(`${base}/skills`)) {
    const arquivo = await ler.texto(`${base}/skills/${nome}/SKILL.md`)

    // Uma pasta sem SKILL.md (a das skills sincronizadas, por exemplo) não é skill.
    if (arquivo === undefined) {
      continue
    }

    const cabecalho = lerCabecalho(arquivo)
    const desc = descricao(cabecalho.description)
    itens.push({
      tipo: 'skill',
      nome: cabecalho.name ?? nome,
      origem,
      isAtivo,
      ...comPlugin,
      ...(desc === undefined ? {} : { descricao: desc }),
    })
  }

  // Uma skill avulsa de marketplace: o SKILL.md na própria raiz.
  const avulsa = await ler.texto(`${base}/SKILL.md`)

  if (avulsa !== undefined) {
    const cabecalho = lerCabecalho(avulsa)
    const desc = descricao(cabecalho.description)
    itens.push({
      tipo: 'skill',
      nome: cabecalho.name ?? plugin ?? base.split('/').at(-1) ?? 'skill',
      origem,
      isAtivo,
      ...comPlugin,
      ...(desc === undefined ? {} : { descricao: desc }),
    })
  }

  const porArquivo: readonly [string, LensTipoDeItem][] = [
    ['commands', 'comando'],
    ['agents', 'agente'],
    ['output-styles', 'estilo'],
  ]

  for (const [pasta, tipo] of porArquivo) {
    for (const arquivo of await ler.arquivos(`${base}/${pasta}`, '.md')) {
      const cabecalho = lerCabecalho((await ler.texto(`${base}/${pasta}/${arquivo}`)) ?? '')
      const desc = descricao(cabecalho.description)
      itens.push({
        tipo,
        nome: cabecalho.name ?? arquivo.replace(/\.md$/, ''),
        origem,
        isAtivo,
        ...comPlugin,
        ...(desc === undefined ? {} : { descricao: desc }),
      })
    }
  }

  return itens
}

// Os hooks de um bloco `hooks` (settings.json ou hooks.json de um plugin):
// um item por evento e matcher, com os comandos que rodam.
export const hooksDoBloco = (
  bloco: unknown,
  origem: string,
  isAtivo: boolean,
  plugin?: string,
): LensItem[] => {
  const itens: LensItem[] = []

  for (const [evento, grupos] of Object.entries(objeto(bloco))) {
    if (!Array.isArray(grupos)) {
      continue
    }

    for (const grupo of grupos as readonly unknown[]) {
      const campos = objeto(grupo)
      const matcher = texto(campos.matcher)
      const acoes = Array.isArray(campos.hooks) ? (campos.hooks as readonly unknown[]) : []
      const comandos = acoes
        .map(acao => {
          const umaAcao = objeto(acao)

          return texto(umaAcao.command) ?? texto(umaAcao.prompt) ?? texto(umaAcao.url) ?? texto(umaAcao.type)
        })
        .filter((comando): comando is string => comando !== undefined)
      const desc = descricao(comandos.join(' · '))

      itens.push({
        tipo: 'hook',
        nome: evento,
        origem,
        isAtivo,
        ...(plugin === undefined ? {} : { plugin }),
        ...(matcher === undefined || matcher === '' ? {} : { extra: matcher }),
        ...(desc === undefined ? {} : { descricao: desc }),
      })
    }
  }

  return itens
}

type Instalado = {
  chave: string
  nome: string
  marketplace: string
  caminho: string
  versao?: string
  escopo?: string
}

// installed_plugins.json: { plugins: { "nome@mkt": [{ installPath, version, scope }] } }
export const lerInstalados = (bruto: unknown): Instalado[] => {
  const instalados: Instalado[] = []

  for (const [chave, entradas] of Object.entries(objeto(objeto(bruto).plugins))) {
    const primeira = objeto(Array.isArray(entradas) ? (entradas as readonly unknown[])[0] : entradas)
    const caminho = texto(primeira.installPath)
    const arroba = chave.lastIndexOf('@')

    if (caminho === undefined) {
      continue
    }

    const versao = texto(primeira.version)
    const escopo = texto(primeira.scope)
    instalados.push({
      chave,
      nome: arroba > 0 ? chave.slice(0, arroba) : chave,
      marketplace: arroba > 0 ? chave.slice(arroba + 1) : '',
      caminho,
      ...(versao === undefined ? {} : { versao }),
      ...(escopo === undefined ? {} : { escopo }),
    })
  }

  return instalados.slice(0, MAX_PLUGINS)
}

const NOMES_DAS_FONTES: Readonly<Record<string, string>> = {
  user: 'suas configurações',
  project: 'configurações do projeto',
  local: 'configurações locais',
  policy: 'política da organização',
  flag: '--settings',
}

const NOMES_DAS_ORIGENS_DE_COMANDO: Readonly<Record<string, string>> = {
  builtin: 'embutido',
  plugin: 'plugin',
  user: 'seu',
  mcp: 'MCP',
}

// Junta tudo num inventário. Cada passo que falhar só deixa a sua parte de fora.
export const lerInventario = async (fontes: Fontes, raiz: string): Promise<LensInventario> => {
  const ler = leitor(fontes)
  const { casa, configuracao } = fontes
  const itens: LensItem[] = []

  // O que a sessão tem carregado agora.
  const comandos = await fontes.comandos()
  const ferramentas = await fontes.ferramentas()
  const detalhe = await fontes.detalhe()
  const configuracoes = await fontes.configuracoes()
  const habilitados = objeto(configuracoes.enabledPlugins)
  const skillsAtivas = new Set((detalhe?.skills?.skillFrontmatter ?? []).map(skill => semPrefixo(skill.name)))
  const agentesAtivos = new Set((detalhe?.agents ?? []).map(agente => semPrefixo(agente.agentType)))
  const comandosAtivos = new Set(comandos.map(comando => semPrefixo(comando.name)))

  // Um plugin numa pasta (instalado ou local) e o que ele traz. O ativo de
  // verdade das peças é o que a sessão carregou: confere pelas listas dela.
  const doPlugin = async (
    caminho: string,
    nome: string,
    origem: string,
    isAtivo: boolean,
    versaoInstalada?: string,
  ): Promise<LensItem[]> => {
    const manifesto = objeto(await ler.json(`${caminho}/.claude-plugin/plugin.json`))
    const pecas = await pecasDaPasta(ler, caminho, `plugin ${nome}`, isAtivo, nome)
    const ganchos = objeto(await ler.json(`${caminho}/hooks/hooks.json`))
    const mcp = Object.keys(objeto(objeto(await ler.json(`${caminho}/.mcp.json`)).mcpServers))
    const ganchosDoPlugin = hooksDoBloco(ganchos.hooks, `plugin ${nome}`, isAtivo, nome)
    const isMod = Array.isArray(ganchos.modules)
    const contagem = (tipo: LensTipoDeItem) => pecas.filter(peca => peca.tipo === tipo).length
    const partes = [
      contagem('skill') > 0 ? plural(contagem('skill'), 'skill', 'skills') : undefined,
      contagem('comando') > 0 ? plural(contagem('comando'), 'comando', 'comandos') : undefined,
      contagem('agente') > 0 ? plural(contagem('agente'), 'agente', 'agentes') : undefined,
      contagem('estilo') > 0 ? plural(contagem('estilo'), 'estilo', 'estilos') : undefined,
      ganchosDoPlugin.length > 0 ? plural(ganchosDoPlugin.length, 'hook', 'hooks') : undefined,
      isMod ? 'mod (hooks de função)' : undefined,
      mcp.length > 0 ? `MCP: ${mcp.join(', ')}` : undefined,
    ].filter((parte): parte is string => parte !== undefined)
    const versao = texto(manifesto.version) ?? versaoInstalada
    const desc = descricao(texto(manifesto.description))
    const doPluginItens: LensItem[] = [
      {
        tipo: 'plugin',
        nome,
        origem,
        isAtivo,
        ...(versao === undefined ? {} : { extra: `v${versao}` }),
        ...(desc === undefined ? {} : { descricao: desc }),
        ...(partes.length === 0 ? {} : { detalhe: partes.join(' · ') }),
      },
    ]

    if (isMod) {
      doPluginItens.push({
        tipo: 'hook',
        nome: 'hooks de função',
        origem: `plugin ${nome}`,
        plugin: nome,
        isAtivo,
        descricao: 'Um mod: escuta os eventos do Claude Code por dentro (painéis, faixas, ferramentas).',
      })
    }

    doPluginItens.push(
      ...pecas.map(peca => {
        const nomeDaPeca = semPrefixo(peca.nome)
        const carregado =
          peca.tipo === 'skill'
            ? skillsAtivas.has(nomeDaPeca) || comandosAtivos.has(nomeDaPeca)
            : peca.tipo === 'agente'
              ? agentesAtivos.has(nomeDaPeca)
              : peca.tipo === 'comando'
                ? comandosAtivos.has(nomeDaPeca)
                : isAtivo

        return { ...peca, isAtivo: isAtivo && carregado }
      }),
      ...ganchosDoPlugin,
    )

    return doPluginItens
  }

  // Plugins instalados, ativos ou não, e o que cada um traz.
  const instalados = lerInstalados(await ler.json(`${configuracao}/plugins/installed_plugins.json`))

  for (const instalado of instalados) {
    itens.push(
      ...(await doPlugin(
        instalado.caminho,
        instalado.nome,
        instalado.marketplace === '' ? 'instalado' : `marketplace ${instalado.marketplace}`,
        habilitados[instalado.chave] === true,
        instalado.versao,
      )),
    )
  }

  // Plugins de pasta local (--plugin-dir, CLAUDE_CODE_PLUGIN_DIRS): não estão
  // no installed_plugins.json nem no enabledPlugins. Carregados, estão ativos.
  const nomesInstalados = new Set(instalados.map(instalado => instalado.nome))
  const locais = new Set<string>()

  for (const pasta of ((await fontes.pastasDePlugins?.()) ?? []).slice(0, MAX_PLUGINS)) {
    const caminho = pasta.replace(/\/+$/, '')
    const nome = texto(objeto(await ler.json(`${caminho}/.claude-plugin/plugin.json`)).name) ?? caminho.split('/').at(-1)

    if (nome === undefined || nome === '' || nomesInstalados.has(nome) || locais.has(nome)) {
      continue
    }

    locais.add(nome)
    itens.push(...(await doPlugin(caminho, nome, 'pasta local', true)))
  }

  // Sem as pastas, o que a sessão diz: um plugin que tem comandos ou skills
  // carregados e não está entre os instalados veio de fora (de uma pasta ou
  // embutido no Claude Code; a sessão não diz qual).
  const pecasNaSessao = new Map<string, { comandos: number; skills: number }>()
  const contar = (nome: string | undefined, campo: 'comandos' | 'skills') => {
    if (nome === undefined || nome === '' || nome === 'engine' || nomesInstalados.has(nome) || locais.has(nome)) {
      return
    }

    const atual = pecasNaSessao.get(nome) ?? { comandos: 0, skills: 0 }
    pecasNaSessao.set(nome, { ...atual, [campo]: atual[campo] + 1 })
  }

  for (const comando of comandos) {
    contar(comando.source === 'plugin' ? comando.plugin : undefined, 'comandos')
  }

  for (const skill of detalhe?.skills?.skillFrontmatter ?? []) {
    contar(skill.pluginName, 'skills')
  }

  for (const [nome, conta] of [...pecasNaSessao].slice(0, MAX_PLUGINS)) {
    const partes = [
      conta.skills > 0 ? plural(conta.skills, 'skill', 'skills') : undefined,
      conta.comandos > 0 ? plural(conta.comandos, 'comando', 'comandos') : undefined,
    ].filter((parte): parte is string => parte !== undefined)

    itens.push({
      tipo: 'plugin',
      nome,
      origem: 'pasta local',
      isAtivo: true,
      descricao: 'Fora dos instalados: de --plugin-dir, de CLAUDE_CODE_PLUGIN_DIRS ou embutido no Claude Code.',
      ...(partes.length === 0 ? {} : { detalhe: `na sessão: ${partes.join(' · ')}` }),
    })
  }

  // Plugins dos marketplaces conhecidos que não estão instalados.
  const marketplaces = Object.entries(objeto(await ler.json(`${configuracao}/plugins/known_marketplaces.json`)))
  const instaladosPorChave = new Set(instalados.map(instalado => instalado.chave))

  for (const [nomeDoMarketplace, dados] of marketplaces.slice(0, 20)) {
    const local = texto(objeto(dados).installLocation)

    if (local === undefined) {
      continue
    }

    const catalogo = objeto(await ler.json(`${local}/.claude-plugin/marketplace.json`))
    const disponiveis = Array.isArray(catalogo.plugins) ? (catalogo.plugins as readonly unknown[]) : []

    for (const disponivel of disponiveis.slice(0, 200)) {
      const campos = objeto(disponivel)
      const nome = texto(campos.name)

      if (nome === undefined || instaladosPorChave.has(`${nome}@${nomeDoMarketplace}`)) {
        continue
      }

      const desc = descricao(texto(campos.description))
      itens.push({
        tipo: 'disponivel',
        nome,
        origem: `marketplace ${nomeDoMarketplace}`,
        isAtivo: false,
        ...(desc === undefined ? {} : { descricao: desc }),
        ...(texto(campos.category) === undefined ? {} : { extra: texto(campos.category) }),
      })
    }
  }

  // As peças do usuário e do projeto.
  itens.push(...(await pecasDaPasta(ler, configuracao, 'suas', true)))

  if (raiz !== '') {
    itens.push(...(await pecasDaPasta(ler, `${raiz}/.claude`, 'projeto', true)))
  }

  // Os hooks das configurações, fonte a fonte.
  const desligados = configuracoes.disableAllHooks === true

  for (const fonte of ['user', 'project', 'local', 'policy'] as const) {
    const lidas = await fontes.configuracoes(fonte)
    itens.push(...hooksDoBloco(lidas.hooks, NOMES_DAS_FONTES[fonte] ?? fonte, !desligados))
  }

  // O que só a sessão conhece: skills embutidas ou sincronizadas, comandos
  // embutidos e de MCP, agentes que não vêm de arquivo.
  const conhecidos = (tipo: LensTipoDeItem) =>
    new Set(itens.filter(item => item.tipo === tipo).map(item => semPrefixo(item.nome)))
  const skillsConhecidas = conhecidos('skill')

  for (const skill of detalhe?.skills?.skillFrontmatter ?? []) {
    if (!skillsConhecidas.has(semPrefixo(skill.name))) {
      const comando = comandos.find(um => semPrefixo(um.name) === semPrefixo(skill.name))
      const desc = descricao(comando?.description)
      itens.push({
        tipo: 'skill',
        nome: skill.name,
        origem: skill.pluginName === undefined ? skill.source : `plugin ${skill.pluginName}`,
        isAtivo: true,
        ...(skill.pluginName === undefined ? {} : { plugin: skill.pluginName }),
        ...(desc === undefined ? {} : { descricao: desc }),
      })
    }
  }

  const skillsAgora = conhecidos('skill')
  const comandosConhecidos = conhecidos('comando')

  for (const comando of comandos) {
    const nome = semPrefixo(comando.name)

    // Uma skill que também é comando aparece só entre as skills.
    if (comandosConhecidos.has(nome) || skillsAgora.has(nome)) {
      continue
    }

    const desc = descricao(comando.description)
    itens.push({
      tipo: 'comando',
      nome: comando.name,
      origem:
        comando.source === 'plugin' && comando.plugin !== undefined
          ? `plugin ${comando.plugin}`
          : (NOMES_DAS_ORIGENS_DE_COMANDO[comando.source] ?? comando.source),
      isAtivo: true,
      ...(comando.plugin === undefined ? {} : { plugin: comando.plugin }),
      ...(desc === undefined ? {} : { descricao: desc }),
    })
  }

  // Os comandos de arquivo carregados ganham a descrição da sessão, se faltar.
  for (const item of itens) {
    if (item.tipo === 'comando' && item.descricao === undefined) {
      const desc = descricao(comandos.find(comando => semPrefixo(comando.name) === semPrefixo(item.nome))?.description)

      if (desc !== undefined) {
        item.descricao = desc
      }
    }
  }

  const agentesConhecidos = conhecidos('agente')

  for (const agente of detalhe?.agents ?? []) {
    if (!agentesConhecidos.has(semPrefixo(agente.agentType))) {
      itens.push({ tipo: 'agente', nome: agente.agentType, origem: agente.source, isAtivo: true })
    }
  }

  // Servidores MCP, pelas ferramentas que a sessão tem de cada um.
  const servidores = new Map<string, string[]>()

  for (const ferramenta of ferramentas.filter(uma => uma.mcp)) {
    const servidor =
      detalhe?.mcpTools.find(uma => uma.name === ferramenta.name)?.serverName ??
      /^mcp__(.+?)__/.exec(ferramenta.name)?.[1] ??
      'MCP'
    servidores.set(servidor, [...(servidores.get(servidor) ?? []), ferramenta.name.replace(/^mcp__.+?__/, '')])
  }

  for (const [servidor, nomes] of servidores) {
    itens.push({
      tipo: 'mcp',
      nome: servidor,
      origem: 'conectado',
      isAtivo: true,
      extra: plural(nomes.length, 'ferramenta', 'ferramentas'),
      descricao: curto(nomes.join(', '), MAX_DESCRICAO),
    })
  }

  // Servidores configurados no .mcp.json do projeto que não estão conectados.
  const doProjeto = Object.keys(objeto(objeto(await ler.json(`${raiz}/.mcp.json`)).mcpServers))

  for (const servidor of doProjeto) {
    if (![...servidores.keys()].some(conectado => conectado.includes(servidor))) {
      itens.push({ tipo: 'mcp', nome: servidor, origem: '.mcp.json do projeto', isAtivo: false })
    }
  }

  // Ferramentas embutidas, o estilo de saída e a memória.
  for (const ferramenta of ferramentas.filter(uma => !uma.mcp)) {
    const desc = descricao(ferramenta.description.split(/\n/)[0])
    itens.push({
      tipo: 'ferramenta',
      nome: ferramenta.name,
      origem: 'embutida',
      isAtivo: true,
      ...(desc === undefined ? {} : { descricao: desc }),
    })
  }

  const estilo = texto(configuracoes.outputStyle)

  if (estilo !== undefined) {
    itens.push({ tipo: 'estilo', nome: estilo, origem: 'em uso', isAtivo: true })
  }

  for (const memoria of detalhe?.memoryFiles ?? []) {
    itens.push({
      tipo: 'memoria',
      nome: memoria.path.replace(casa === '' ? /^$/ : casa, '~'),
      origem: memoria.type,
      isAtivo: true,
      extra: `${memoria.tokens} tokens`,
    })
  }

  return { itens: itens.slice(0, MAX_ITENS), lidoEm: await fontes.agora() }
}
