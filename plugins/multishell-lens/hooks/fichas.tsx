// O detalhe de um item aberto a partir de uma lista: um agente, uma rodada
// dele, um comando ou um turno. Como em telas.tsx, nada aqui chama `$`.

import type { RenderElement } from 'claude-code'

import type {
  LensAgente,
  LensComando,
  LensFichaDoAgente,
  LensFichaDoComando,
  LensFichaDoTurno,
  LensPasso,
  LensTokens,
} from '../types'
import type { Grupo } from './dados'
import { voltaDoFoco } from './caminho'
import { COR } from './cores'
import { PIXELS_POR_COLUNA, curto, dolar, duracao, duracaoViva, horaExata, plural, semMarcas, tokens, umaLinha } from './formato'
import { periodoDoAgente, rodadasDoAgente, semMoldura, tempoDoAgente } from './dados'
import { cabecalhoDoItem } from './graficos'
import type { CorDoGrafico, Ladrilho } from './graficos'
import { ESTADOS, barrasDeContagem, cartaoClicavel, comMoldura, comTecla, dobraDe, etiquetas, secaoQueDobra } from './pecas'
import type { Dobra, Estado } from './pecas'
import { nomeDoModelo } from './pilulas'
import { duracaoDaRodada, modeloDaRodada, tokensDasRodadas } from './rodadas'
import type { EstadoDaRodada, RodadaVista } from './rodadas'
import type { Acoes, Elementos, Quadro } from './telas'

// O botão de voltar fica na linha do caminho, no alto do painel (veja
// `caminho` em telas.tsx): as fichas não o desenham.
const semItem = (el: Elementos, aviso: string): RenderElement => {
  const { Box, Text } = el

  return (
    <Box key="ficha" flexDirection="column" rowGap={1}>
      <Text dimColor>{aviso}</Text>
    </Box>
  )
}

// Um recado (SendMessage) que o agente mandou ou recebeu, posto de pé para a lista.
export type RecadoVisto = { isEnviado: boolean; com: string; quando: number; texto?: string; falha?: string }

// Os recados numa seção que dobra: os que ele mandou e recebeu.
const secaoDeRecados = (el: Elementos, dobra: Dobra, chave: string, recados: readonly RecadoVisto[], quadro: Quadro, nota: string): RenderElement | null => {
  const { Box, Text } = el

  if (recados.length === 0) {
    return null
  }

  return secaoQueDobra(el, dobra, chave, { texto: 'Recados', cor: COR.roxo, contagem: `· ${recados.length}` }, [
    <Text key="recados-nota" dimColor>{nota}</Text>,
    ...recados.map((recado, i) => (
      <Box key={`recado-${i}`} flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={recado.falha === undefined ? COR.roxo : COR.vermelho} bold>
            {`${recado.falha === undefined ? '✉' : '✕'} ${recado.isEnviado ? '→ para' : '← de'} `}
          </Text>
          <Text bold>{recado.com}</Text>
          <Text dimColor>{` · há ${duracaoViva(Math.max(0, quadro.agora - recado.quando))}`}</Text>
        </Text>
        {recado.texto !== undefined && <Text wrap="wrap">{`  "${recado.texto}"`}</Text>}
        {recado.falha !== undefined && <Text color={COR.vermelho} wrap="wrap">{`  não chegou: ${recado.falha}`}</Text>}
      </Box>
    )),
  ])
}

// O grafo dos agentes ligados (já desenhado) e os cartões deles, numa seção.
export type RedeVista = {
  rede: RenderElement | null
  titulo: { texto: string; contagem: string }
  cartoes: readonly RenderElement[]
}

const secaoDaRede = (el: Elementos, dobra: Dobra, chave: string, rede: RedeVista | undefined): RenderElement | null =>
  rede === undefined || rede.rede === null
    ? null
    : secaoQueDobra(el, dobra, chave, { ...rede.titulo, cor: COR.ciano }, [rede.rede, ...rede.cartoes], 1)

// Os ladrilhos dos tokens: a entrada (com o cache), o cache lido e a saída.
const ladrilhosDosTokens = (uso: LensTokens | undefined, sufixo: string): Ladrilho[] =>
  uso === undefined
    ? []
    : [
        { rotulo: `Entrada${sufixo}`, valor: tokens(uso.entrada + uso.cacheLido + uso.cacheGravado) },
        { rotulo: `Cache lido${sufixo}`, valor: tokens(uso.cacheLido) },
        { rotulo: `Saída${sufixo}`, valor: tokens(uso.saida) },
      ]

// Uma chamada do agente. Com a entrada ou a saída guardadas, o nome é um
// botão que abre embaixo dela o que ela recebeu e o que devolveu (o "aberta"
// fica na mesma lista das seções dobradas, com a chave `aberta:passo:<id>`).
const linhaDoPasso = (el: Elementos, passo: LensPasso, quadro: Quadro, acoes: Acoes): RenderElement => {
  const { Box, Button, Code, Text } = el
  const estado =
    passo.estado === 'rodando' ? ESTADOS.rodando : passo.estado === 'ok' ? ESTADOS.ok : ESTADOS.falhou
  const tempo = passo.duracaoMs === undefined ? 'rodando' : duracao(passo.duracaoMs)
  const texto = `${passo.ferramenta} ${passo.argumento}`.trim()
  const chave = `aberta:passo:${passo.id}`
  const temDetalhe = passo.entrada !== undefined || passo.saida !== undefined
  const isAberta = temDetalhe && (quadro.fechadas ?? []).includes(chave)

  if (!temDetalhe) {
    return (
      <Text key={`passo-${passo.id}`} wrap="truncate-end">
        <Text color={estado.cor}>{`${estado.glifo} `}</Text>
        <Text>{texto}</Text>
        <Text dimColor>{` · ${tempo}`}</Text>
      </Text>
    )
  }

  return (
    <Box key={`passo-${passo.id}`} flexDirection="column">
      <Box flexDirection="row">
        {/* Um glifo só à esquerda, o do estado; o abre-e-fecha vai no fim. */}
        <Text color={estado.cor}>{`${estado.glifo} `}</Text>
        <Box flexShrink={1} minWidth={0}>
          <Button
            key={`abrir-passo-${passo.id}`}
            label={texto.length > quadro.largura - 16 ? `${texto.slice(0, Math.max(8, quadro.largura - 17))}…` : texto}
            plain
            hover={{ underline: true, color: COR.azul }}
            onPress={() => acoes.alternarSecao(chave)}
          />
        </Box>
        <Text dimColor>{` · ${tempo}  ${isAberta ? '▾' : '▸'}`}</Text>
      </Box>
      {isAberta && (
        <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
          {passo.entrada !== undefined && <Text color={COR.azul} bold>Entrada</Text>}
          {passo.entrada !== undefined && <Code source={passo.entrada} language="json" wrap="wrap" />}
          {passo.saida !== undefined && (
            <Text color={passo.estado === 'falhou' ? COR.vermelho : COR.verde} bold>
              {passo.estado === 'falhou' ? 'Erro' : 'Saída'}
            </Text>
          )}
          {passo.saida !== undefined && <Code source={passo.saida} wrap="wrap" />}
        </Box>
      )}
    </Box>
  )
}

// O cabeçalho de um detalhe no Desktop: um painel em SVG, com o nome grande,
// o estado num selo e os números em ladrilhos. No terminal, nada (o texto de
// sempre fica).
export const cabecalhoEmPainel = (
  el: Elementos,
  quadro: Quadro,
  item: Parameters<typeof cabecalhoDoItem>[0],
): RenderElement | null => {
  const { Svg } = el

  if (Svg === null || quadro.isTerminal || quadro.isCompacto) {
    return null
  }

  // Uma folga na largura: a coluna do app é um pouco mais estreita que a conta
  // de 7,4 px, e o desenho do tamanho exato passava da borda direita.
  const desenho = cabecalhoDoItem(item, (quadro.largura - 8) * PIXELS_POR_COLUNA * 0.94)

  return (
    <Svg
      source={desenho.source}
      alt={`${item.titulo} · ${item.estado.texto}${item.subtitulo === undefined ? '' : ` · ${item.subtitulo}`} · ${item.ladrilhos
        .map(ladrilho => `${ladrilho.rotulo} ${ladrilho.valor}`)
        .join(', ')}`}
      width={desenho.width}
      height={desenho.height}
    />
  )
}

// As ferramentas de um trecho de chamadas, contadas, da mais chamada à menos.
const contagemDasFerramentas = (passos: readonly LensPasso[]): [string, number][] => {
  const contagem = new Map<string, number>()

  for (const passo of passos) {
    contagem.set(passo.ferramenta, (contagem.get(passo.ferramenta) ?? 0) + 1)
  }

  return [...contagem.entries()].sort((a, b) => b[1] - a[1])
}

// A marca de cada estado de uma rodada: a de sempre, e âmbar no que parou.
export const marcaDaRodada = (estado: EstadoDaRodada): Estado & { nome: string } => {
  if (estado === 'rodando') {
    return { ...ESTADOS.rodando, nome: 'rodando' }
  }

  if (estado === 'parando') {
    return { glifo: '◌', cor: COR.ambar, rotulo: 'parando', nome: 'parando…' }
  }

  if (estado === 'ok') {
    return { ...ESTADOS.ok, nome: 'concluída' }
  }

  if (estado === 'falhou') {
    return { ...ESTADOS.falhou, nome: 'falhou' }
  }

  return estado === 'parada'
    ? { glifo: '■', cor: COR.ambar, rotulo: 'parada', nome: 'parada a seu pedido' }
    : { glifo: '✗', cor: COR.ambar, rotulo: 'interrompida', nome: 'interrompida' }
}

export const corDaRodada = (estado: EstadoDaRodada): CorDoGrafico =>
  estado === 'rodando' ? 'azul' : estado === 'ok' ? 'verde' : estado === 'falhou' ? 'vermelho' : 'ambar'

// O nome de quem abriu uma rodada: a conversa principal ou um agente.
export const nomeDeQuem = (quem: string | undefined, agentes: readonly LensAgente[]): string => {
  if (quem === undefined) {
    return 'não se sabe quem'
  }

  if (quem === 'principal') {
    return 'a conversa principal'
  }

  const agente = agentes.find(um => um.id === quem)

  return agente === undefined ? `o agente ${quem.slice(0, 6)}` : agente.descricao === '' ? agente.tipo : agente.descricao
}

// "acordada pela conversa principal" / "criada por Coordenar…": como a
// rodada começou e quem a abriu.
export const origemDaRodada = (rodada: Pick<RodadaVista, 'n' | 'quem'>, agentes: readonly LensAgente[]): string => {
  const quem = nomeDeQuem(rodada.quem, agentes)
  const por = quem === 'a conversa principal' ? 'pela conversa principal' : `por ${quem}`

  return rodada.n === 1 ? `criada ${por}` : `acordada ${por}`
}

// O período de uma rodada: "14:02:10 → 14:05:33", ou "→ agora" enquanto roda.
export const periodoDaRodada = (rodada: Pick<RodadaVista, 'inicio' | 'fim'>): string =>
  `${horaExata(rodada.inicio)} → ${rodada.fim === undefined ? 'agora' : horaExata(rodada.fim)}`

export const tempoDaRodada = (rodada: Pick<RodadaVista, 'inicio' | 'fim'>, agora: number): string =>
  rodada.fim === undefined ? duracaoViva(duracaoDaRodada(rodada, agora)) : duracao(duracaoDaRodada(rodada, agora))

// Abre a tela de uma rodada do agente, com a volta que leva de volta ao
// agente (e dali para onde ele foi aberto).
export const abrirRodada = (acoes: Acoes, agente: LensAgente, n: number, voltaDoAgente: string | undefined) =>
  acoes.abrir({
    tipo: 'rodada',
    id: agente.id,
    rodada: n,
    volta: voltaDoFoco({ tipo: 'agente', id: agente.id, ...(voltaDoAgente === undefined ? {} : { volta: voltaDoAgente }) }),
  })

// Uma rodada na lista do detalhe do agente: um cartão curto, que abre a tela
// dela (o número, quando foi, quanto durou, como terminou, quem a abriu e o
// começo da resposta).
const cartaoCurtoDaRodada = (
  el: Elementos,
  agente: LensAgente,
  rodada: RodadaVista,
  agentes: readonly LensAgente[],
  quadro: Quadro,
  acoes: Acoes,
  volta: string | undefined,
): RenderElement => {
  const { Box, Button, Text } = el
  const marca = marcaDaRodada(rodada.estado)
  const abrir = () => abrirRodada(acoes, agente, rodada.n, volta)
  const porLinha = Math.max(30, quadro.largura - 16)
  const resposta = curto(umaLinha(semMoldura(rodada.resposta ?? '')), porLinha)
  const pedido = curto(umaLinha(semMarcas(rodada.pedido ?? '')), Math.max(20, porLinha - 40))
  const numeros = [
    tempoDaRodada(rodada, quadro.agora),
    rodada.custo === undefined ? undefined : dolar(rodada.custo),
    rodada.chamadas === undefined ? undefined : plural(rodada.chamadas, 'chamada', 'chamadas'),
  ].filter((parte): parte is string => parte !== undefined)

  return cartaoClicavel(el, `rodada-${agente.id}-${rodada.n}`, 'subtle', marca.cor, 3, quadro, abrir, [
    <Box key="rodada-titulo" flexDirection="row" columnGap={1}>
      <Text color={marca.cor}>{marca.glifo}</Text>
      <Button key={`ver-rodada-${agente.id}-${rodada.n}`} label={`Rodada ${rodada.n}`} plain hover={{ underline: true, color: COR.roxo }} onPress={abrir} />
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          <Text dimColor>{`${periodoDaRodada(rodada)} · ${numeros.join(' · ')} · `}</Text>
          <Text color={marca.cor}>{marca.nome}</Text>
        </Text>
      </Box>
      {(quadro.isTerminal || quadro.largura >= 80) && (
        <Button key={`abrir-rodada-${agente.id}-${rodada.n}`} label="Ver rodada" {...comMoldura(quadro)} hover={{ underline: true, color: COR.roxo }} onPress={abrir} />
      )}
    </Box>,
    <Text key="rodada-origem" wrap="truncate-end" dimColor>
      {`${origemDaRodada(rodada, agentes)}${pedido === '' ? '' : ` · "${pedido}"`}`}
    </Text>,
    <Text key="rodada-resposta" wrap="truncate-end">
      <Text color={COR.verde} bold>{'Resposta  '}</Text>
      {resposta === '' ? (
        <Text dimColor>{rodada.fim === undefined ? 'ainda trabalhando' : 'sem texto de resposta'}</Text>
      ) : (
        <Text>{resposta}</Text>
      )}
    </Text>,
  ])
}

// O que é de uma rodada: o pedido (ou o recado que a acordou), os agentes que
// ela criou e os recados que trocou, as ferramentas que ela chamou, as
// chamadas (que abrem a entrada e a saída), o que o agente escreveu (só na
// rodada mais recente: a transcrição não separa as rodadas) e a resposta
// inteira. `extras`: o grafo e os cartões dos agentes ligados a ela, e os
// recados dela, já postos de pé por quem chama (que tem os dados da sessão).
const corpoDaRodada = (
  el: Elementos,
  agente: LensAgente,
  ficha: LensFichaDoAgente | undefined,
  rodada: RodadaVista,
  agentes: readonly LensAgente[],
  quadro: Quadro,
  acoes: Acoes,
  extras: { rede?: RedeVista; recados?: readonly RecadoVisto[] } = {},
): RenderElement[] => {
  const { Markdown, Text } = el
  const dobra = dobraDe(quadro, acoes)
  const isUltima = rodada.n === rodada.total
  const isRodando = rodada.fim === undefined
  const isWorkflow = agente.workflow !== undefined
  const todas = ficha?.mensagens ?? []
  // A resposta final é a última coisa que o agente escreveu: não repete na lista.
  const resposta = rodada.resposta ?? (isRodando ? undefined : todas.at(-1))
  const mensagens = resposta !== undefined && todas.at(-1) === resposta ? todas.slice(0, -1) : todas
  const respostaLimpa = resposta === undefined ? undefined : semMoldura(resposta)
  // As chamadas guardadas sem horário (de antes) não se repartem entre as
  // rodadas: ficam todas na tela da última, com o aviso; nas outras, só o aviso.
  const passos = rodada.isSemHora ? (isUltima ? (ficha?.passos ?? []) : []) : rodada.passos
  const usadas = contagemDasFerramentas(passos)
  const quem = nomeDeQuem(rodada.quem, agentes)
  const avisoSemHora = rodada.isSemHora
    ? isUltima
      ? 'As chamadas deste agente foram guardadas sem horário: aqui estão todas as dele, não só as desta rodada.'
      : 'As chamadas deste agente foram guardadas sem horário: não dá para dizer quais foram desta rodada.'
    : undefined

  return [
    secaoQueDobra(
      el,
      dobra,
      'rodada:pedido',
      rodada.n === 1
        ? { texto: 'Pedido que o agente recebeu', cor: COR.roxo }
        : { texto: 'Recado que o acordou', cor: COR.roxo, contagem: `· ${quem === 'a conversa principal' ? 'da conversa principal' : `de ${quem}`}` },
      [
        rodada.pedido !== undefined ? (
          <Markdown text={rodada.pedido} dimColor />
        ) : (
          <Text dimColor>
            {rodada.n === 1
              ? isWorkflow
                ? 'Lendo o pedido da transcrição do workflow…'
                : 'O pedido não chegou ao Lens.'
              : 'O recado que o acordou não chegou ao Lens.'}
          </Text>
        ),
      ],
    ),
    secaoDaRede(el, dobra, 'rodada:criados', extras.rede),
    secaoDeRecados(el, dobra, 'rodada:recados', extras.recados ?? [], quadro, 'Os SendMessage que ele mandou e recebeu nesta rodada.'),
    secaoQueDobra(el, dobra, 'rodada:ferramentas', { texto: 'Ferramentas', cor: COR.azul, contagem: rodada.chamadas === undefined ? '' : `· ${rodada.chamadas}` }, [
      avisoSemHora !== undefined && (
        <Text key="ferramentas-sem-hora" dimColor wrap="wrap">
          {avisoSemHora}
        </Text>
      ),
      !rodada.isSemHora && usadas.length === 0 && <Text dimColor>Nenhuma chamada de ferramenta nesta rodada.</Text>,
      usadas.length > 0 && barrasDeContagem(el, usadas, quadro, 'azul', COR.azul, 'Chamadas de cada ferramenta na rodada'),
    ]),
    (!rodada.isSemHora || passos.length > 0) &&
      secaoQueDobra(el, dobra, 'rodada:chamadas', { texto: rodada.isSemHora ? 'Últimas chamadas' : 'Chamadas', cor: COR.azul, contagem: `· ${passos.length}` }, [
        passos.length > 0 && (
          <Text key="chamadas-nota" dimColor wrap="wrap">
            {rodada.isSemHora
              ? 'Guardadas sem horário: todas as do agente, em ordem. Clique numa para ver a entrada e a saída.'
              : 'Todas as ferramentas desta rodada, em ordem. Clique numa para ver a entrada e a saída.'}
          </Text>
        ),
        passos.length === 0 && <Text dimColor>Nenhuma chamada de ferramenta nesta rodada.</Text>,
        ...passos.map(passo => linhaDoPasso(el, passo, quadro, acoes)),
      ]),
    isUltima &&
      (isRodando || mensagens.length > 0) &&
      secaoQueDobra(
        el,
        dobra,
        'rodada:mensagens',
        { texto: 'O que o agente escreveu', cor: COR.ciano, contagem: `· ${mensagens.length}` },
        [
          mensagens.length === 0 && <Text dimColor>Nenhuma mensagem escrita ainda.</Text>,
          rodada.total > 1 && mensagens.length > 0 && (
            <Text key="mensagens-nota" dimColor wrap="wrap">
              As últimas mensagens da transcrição dele (ela não separa as rodadas: valem para a mais recente).
            </Text>
          ),
          ...mensagens.map(mensagem => <Markdown text={mensagem} />),
        ],
        1,
      ),
    secaoQueDobra(el, dobra, 'rodada:resposta', { texto: 'Resposta', cor: COR.verde }, [
      respostaLimpa !== undefined ? (
        <Markdown text={respostaLimpa} />
      ) : (
        <Text dimColor>{isRodando ? 'O agente ainda está trabalhando.' : 'Sem texto de resposta.'}</Text>
      ),
    ]),
  ].filter((parte): parte is RenderElement => parte !== false && parte !== null && parte !== undefined)
}

// De onde o detalhe do agente foi aberto, quando isso recorta as rodadas: um
// turno (as que começaram nele) ou outro agente (as que ele criou ou acordou).
export type RecorteDasRodadas = {
  tipo: 'turno' | 'agente'
  // O nome do contexto ("turno 2", "Coordenar…") e as rodadas dele.
  nome: string
  numeros: readonly number[]
}

// O detalhe de um agente. `rodadas`: todas as dele, postas de pé (veja
// rodadas.ts). Com mais de uma, o detalhe é só os totais e a lista das
// rodadas: o que é de cada uma (o pedido ou recado, o grafo, os recados, as
// chamadas, as mensagens, a resposta) fica na tela dela.
export const fichaDoAgente = (
  el: Elementos,
  agente: LensAgente | undefined,
  ficha: LensFichaDoAgente | undefined,
  quadro: Quadro,
  acoes: Acoes,
  // Os agentes da sessão, para dizer quem criou este (o `pai` é só um id).
  agentes: readonly LensAgente[] = [],
  // O grafo dos agentes que este criou (e dos que eles criaram) e dos que
  // trocaram recados com ele, já desenhado, com os cartões deles.
  rede: RedeVista | undefined = undefined,
  // Os recados (SendMessage) que ele mandou e recebeu.
  recados: readonly RecadoVisto[] = [],
  // As outras execuções do mesmo agente instalado (o mesmo tipo chamado
  // outras vezes), cada uma numa linha.
  outras: readonly RenderElement[] = [],
  // As rodadas dele, o recorte que o caminho de entrada faz nelas e a volta
  // deste detalhe (as rodadas abertas daqui voltam para cá).
  rodadas: { todas: readonly RodadaVista[]; recorte?: RecorteDasRodadas; volta?: string } = { todas: [] },
): RenderElement => {
  const { Box, Button, Markdown, Text } = el

  if (agente === undefined) {
    return semItem(el, 'Este agente não está mais na lista.')
  }

  const isRodando = agente.estado === 'rodando'
  const estado = isRodando
    ? ESTADOS.rodando
    : agente.estado === 'concluido'
      ? ESTADOS.ok
      : ESTADOS.falhou
  const tempo = tempoDoAgente(agente, quadro.agora)
  const quantasRodadas = Math.max(rodadasDoAgente(agente), rodadas.todas.length)
  // O mesmo agente que trabalhou mais de uma vez: só os totais e a lista das rodadas.
  const isEmRodadas = quantasRodadas > 1
  const passos = ficha?.passos ?? []
  const todas = ficha?.mensagens ?? []
  // A resposta final é a última coisa que o agente escreveu: não repete na lista.
  const resposta = ficha?.resposta ?? (isRodando ? undefined : todas.at(-1))
  const mensagens = resposta !== undefined && todas.at(-1) === resposta ? todas.slice(0, -1) : todas
  // Os tokens do agente inteiro: a soma das rodadas, ou os da ficha.
  const uso = isEmRodadas ? tokensDasRodadas(rodadas.todas, ficha) : ficha?.tokens
  const entrada = uso === undefined ? 0 : uso.entrada + uso.cacheLido + uso.cacheGravado
  const pai = agente.pai === undefined ? undefined : agentes.find(um => um.id === agente.pai)
  const isWorkflow = agente.workflow !== undefined
  // Quantas vezes cada ferramenta foi chamada: a contagem do agente inteiro
  // ou, num agente visto antes dela existir, a das últimas chamadas.
  const contagem: Record<string, number> = { ...agente.porFerramenta }

  if (agente.porFerramenta === undefined) {
    for (const passo of passos) {
      contagem[passo.ferramenta] = (contagem[passo.ferramenta] ?? 0) + 1
    }
  }

  const usadas = Object.entries(contagem).sort((a, b) => b[1] - a[1])
  const dobra = dobraDe(quadro, acoes)
  // A resposta guardada antes de o Lens tirar a moldura do hand-back.
  const respostaLimpa = resposta === undefined ? undefined : semMoldura(resposta)
  // Vindo de um turno ou de outro agente, a lista fica só com as rodadas
  // desse contexto; o aviso diz quantas ficaram de fora.
  const recorte = rodadas.recorte
  const doRecorte =
    recorte === undefined ? rodadas.todas : rodadas.todas.filter(rodada => recorte.numeros.includes(rodada.n))
  const isRecortado = isEmRodadas && recorte !== undefined && doRecorte.length < rodadas.todas.length
  const corDoEstado: CorDoGrafico = isRodando ? 'azul' : agente.estado === 'concluido' ? 'verde' : 'vermelho'
  const nome = isWorkflow ? (agente.rotulo ?? agente.descricao) : agente.descricao === '' ? agente.tipo : agente.descricao
  // Com várias rodadas, os números são do agente inteiro, e dizem isso.
  const sufixo = isEmRodadas ? ' total' : ''
  const ladrilhos: Ladrilho[] = [
    { rotulo: 'Modelo', valor: agente.modelo === undefined ? 'n/d' : nomeDoModelo(agente.modelo), cor: 'roxo' },
    ...(isEmRodadas ? [{ rotulo: 'Rodadas', valor: String(quantasRodadas), cor: 'roxo' as const }] : []),
    { rotulo: `${isRodando ? 'Rodando há' : 'Duração'}${sufixo}`, valor: tempo, cor: 'azul' },
    ...(agente.custo === undefined ? [] : [{ rotulo: `Custo${sufixo}`, valor: dolar(agente.custo), cor: 'verde' as const }]),
    ...(agente.contexto === undefined ? [] : [{ rotulo: 'Contexto', valor: tokens(agente.contexto), cor: 'ciano' as const }]),
    { rotulo: `Chamadas${sufixo}`, valor: String(agente.chamadas) },
    ...ladrilhosDosTokens(uso, sufixo),
  ]
  const painel = cabecalhoEmPainel(el, quadro, {
    titulo: nome,
    estado:
      agente.isParando === true
        ? { texto: '◌ parando…', cor: 'ambar' }
        : agente.isParado === true
          ? { texto: '■ parado', cor: 'ambar' }
          : { texto: `${estado.glifo} ${estado.rotulo}`, cor: corDoEstado },
    subtitulo: [
      isWorkflow ? `fase ${agente.fase ?? 'n/d'} do workflow ${agente.workflow}` : agente.tipo,
      pai === undefined ? undefined : `criado por ${pai.descricao === '' ? (pai.nome ?? pai.tipo) : pai.descricao}`,
      agente.isFundo === true ? 'em segundo plano' : undefined,
      periodoDoAgente(agente),
      quantasRodadas > 1 ? `${quantasRodadas} rodadas` : undefined,
    ]
      .filter((parte): parte is string => parte !== undefined)
      .join(' · '),
    ladrilhos,
  })
  const verTodas = () => acoes.abrir({ tipo: 'agente', id: agente.id })
  const avisoDoRecorte =
    !isRecortado || recorte === undefined ? null : (
      <Box key="aviso-recorte" flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Text color={COR.roxo} wrap="truncate-end">
          <Text bold>{`${recorte.tipo === 'turno' ? 'Rodadas deste turno' : `Rodadas abertas por ${recorte.nome}`}: ${doRecorte.length} de ${quantasRodadas}`}</Text>
          <Text dimColor>{` · as outras ${quantasRodadas - doRecorte.length === 1 ? 'foi' : `${quantasRodadas - doRecorte.length} foram`} fora ${recorte.tipo === 'turno' ? 'deste turno' : 'daqui'} ·`}</Text>
        </Text>
        <Button key="ver-todas-rodadas" label="ver todas as rodadas" plain hover={{ underline: true, color: COR.roxo }} onPress={verTodas} />
      </Box>
    )
  // As rodadas de antes de o Lens guardá-las (dados antigos): contam no
  // número, mas não têm cartão.
  const semCartao = quantasRodadas - rodadas.todas.length

  return (
    <Box key="ficha" flexDirection="column" rowGap={1}>
      {(isRodando || !isEmRodadas) && (
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          {/* As mensagens da transcrição só aparecem onde cabem: no detalhe de
              um agente de uma rodada, ou na tela da rodada mais recente. */}
          {!isEmRodadas && (
            <Button
              key="mensagens"
              label={comTecla(quadro, 'Reler mensagens', 'm')}
              hotkey="m"
              onPress={() => acoes.mensagens(agente.id)}
            />
          )}
          {/* Só enquanto ele roda: pede para ele parar (o mod não encerra um
              agente à força; ele recebe o pedido e não chama mais ferramentas). */}
          {isRodando && agente.workflow === undefined && (
            <Button
              key="parar-agente"
              label={agente.isParando === true ? 'Parando…' : '■ Parar agente'}
              {...(agente.isParando === true ? { dimColor: true } : {})}
              onPress={() => acoes.pararAgente(agente.id)}
            />
          )}
        </Box>
      )}
      {agente.isParando === true && (
        <Text color={COR.ambar} wrap="wrap">
          Pedi para ele parar: as próximas ferramentas dele são negadas, e ele termina na resposta seguinte.
        </Text>
      )}
      {painel}
      {painel === null && (
      <Box flexDirection="column">
        <Text wrap="wrap">
          <Text color={estado.cor}>{`${estado.glifo} `}</Text>
          <Text bold>{isWorkflow ? (agente.rotulo ?? agente.descricao) : agente.tipo}</Text>
          {isWorkflow && <Text dimColor>{` · fase ${agente.fase ?? 'n/d'} do workflow ${agente.workflow}`}</Text>}
          {quantasRodadas > 1 && <Text color={COR.roxo}>{` · ${quantasRodadas} rodadas`}</Text>}
        </Text>
        {!isWorkflow && agente.descricao !== '' && <Text wrap="wrap">{agente.descricao}</Text>}
        {/* Os números em etiquetas: quem, quanto tempo, quanto custou. */}
        {etiquetas(el, 'agente-numeros', [
          { texto: agente.modelo === undefined ? 'modelo n/d' : nomeDoModelo(agente.modelo), tom: 'roxo' },
          { texto: `⏱ ${tempo}${sufixo}`, tom: 'azul' },
          { texto: `${plural(agente.chamadas, 'chamada', 'chamadas')}${sufixo}` },
          pai !== undefined && { texto: `criado por ${pai.nome ?? pai.tipo}` },
        ])}
        {etiquetas(el, 'agente-tokens', [
          agente.custo !== undefined && { texto: `${dolar(agente.custo)}${sufixo}`, tom: 'verde', isNegrito: true },
          agente.contexto !== undefined && { texto: `contexto ${tokens(agente.contexto)}`, tom: 'ciano' },
          uso !== undefined && { texto: `entrada ${tokens(entrada)}${sufixo}` },
          uso !== undefined && { texto: `${tokens(uso.cacheLido)} do cache${sufixo}` },
          uso !== undefined && { texto: `saída ${tokens(uso.saida)}${sufixo}` },
        ])}
      </Box>
      )}
      {avisoDoRecorte}
      {/* O mesmo agente que trabalhou mais de uma vez (um recado o acordou
          depois de terminar): cada rodada num cartão curto, que abre a tela
          dela, com o pedido ou recado, as chamadas e a resposta. */}
      {isEmRodadas &&
        secaoQueDobra(
          el,
          dobra,
          'agente:rodadas',
          { texto: isRecortado && recorte !== undefined ? (recorte.tipo === 'turno' ? 'Rodadas deste turno' : 'Rodadas abertas aqui') : 'Rodadas', cor: COR.roxo, contagem: isRecortado ? `· ${doRecorte.length} de ${quantasRodadas}` : `· ${quantasRodadas}` },
          [
            <Text key="rodadas-nota" dimColor wrap="wrap">
              O mesmo agente voltou a trabalhar depois de terminar, acordado por um recado. Os números acima somam todas as rodadas; clique numa rodada para ver o pedido ou recado, o grafo, as chamadas e a resposta dela.
            </Text>,
            ...doRecorte.map(rodada => cartaoCurtoDaRodada(el, agente, rodada, agentes, quadro, acoes, rodadas.volta)),
            doRecorte.length === 0 && <Text dimColor>Nenhuma rodada dele neste contexto.</Text>,
            !isRecortado && semCartao > 0 && (
              <Text key="rodadas-sem-cartao" dimColor wrap="wrap">
                {`+ ${plural(semCartao, 'rodada de antes', 'rodadas de antes')}, sem o detalhe guardado.`}
              </Text>
            ),
          ],
          1,
        )}
      {outras.length > 0 &&
        secaoQueDobra(el, dobra, 'agente:outras', { texto: `Outras execuções de ${agente.tipo}`, cor: COR.ciano, contagem: `· ${outras.length}` }, [
          <Text key="outras-nota" dimColor wrap="wrap">
            O mesmo agente chamado outras vezes: cada chamada é uma execução separada, com o seu pedido e a sua resposta.
          </Text>,
          ...outras,
        ])}
      {/* Com uma rodada só, o que é dela fica aqui: o grafo, os recados, as
          ferramentas, o pedido, as chamadas, as mensagens e a resposta. */}
      {!isEmRodadas && secaoDaRede(el, dobra, 'agente:criados', rede)}
      {!isEmRodadas && secaoDeRecados(el, dobra, 'agente:recados', recados, quadro, 'Os SendMessage que ele mandou e recebeu.')}
      {!isEmRodadas && secaoQueDobra(el, dobra, 'agente:ferramentas', { texto: 'Ferramentas', cor: COR.azul, contagem: `· ${agente.chamadas}` }, [
        usadas.length === 0 && <Text dimColor>Nenhuma chamada de ferramenta ainda.</Text>,
        usadas.length > 0 && barrasDeContagem(el, usadas, quadro, 'azul', COR.azul, 'Chamadas de cada ferramenta do agente'),
      ])}
      {/* Os comandos Bash não ganham seção aqui: as Últimas chamadas já os
          trazem, com a entrada e a saída (a lista só do Bash fica no turno,
          onde mistura vários agentes). */}
      {!isEmRodadas && secaoQueDobra(el, dobra, 'agente:pedido', { texto: 'Pedido que o agente recebeu', cor: COR.roxo }, [
        ficha !== undefined && ficha.pedido !== '' ? (
          <Markdown text={ficha.pedido} dimColor />
        ) : (
          <Text dimColor>
            {isWorkflow ? 'Lendo o pedido da transcrição do workflow…' : 'O pedido não chegou ao Lens.'}
          </Text>
        ),
      ])}
      {!isEmRodadas && secaoQueDobra(
        el,
        dobra,
        'agente:chamadas',
        { texto: 'Últimas chamadas', cor: COR.azul, contagem: `· ${passos.length}` },
        [
          passos.length > 0 && <Text key="chamadas-nota" dimColor>Todas as ferramentas, em ordem. Clique numa para ver a entrada e a saída.</Text>,
          passos.length === 0 && <Text dimColor>Nenhuma chamada de ferramenta ainda.</Text>, ...passos.map(passo => linhaDoPasso(el, passo, quadro, acoes))],
      )}
      {!isEmRodadas && (isRodando || mensagens.length > 0) &&
        secaoQueDobra(
          el,
          dobra,
          'agente:mensagens',
          { texto: 'O que o agente escreveu', cor: COR.ciano, contagem: `· ${mensagens.length}` },
          [
            mensagens.length === 0 && <Text dimColor>Nenhuma mensagem escrita ainda.</Text>,
            ...mensagens.map(mensagem => <Markdown text={mensagem} />),
          ],
          1,
        )}
      {!isEmRodadas && secaoQueDobra(el, dobra, 'agente:resposta', { texto: 'Resposta', cor: COR.verde }, [
        respostaLimpa !== undefined ? (
          <Markdown text={respostaLimpa} />
        ) : (
          <Text dimColor>{isRodando ? 'O agente ainda está trabalhando.' : 'Sem texto de resposta.'}</Text>
        ),
      ])}
    </Box>
  )
}

// A tela de uma rodada de um agente que trabalhou mais de uma vez: igual ao
// detalhe de um agente de uma rodada só, com os dados dela: o cabeçalho com
// os números dela, a navegação para a anterior e a seguinte, e o que é dela
// (o pedido ou o recado, o grafo e os recados, as ferramentas, as chamadas,
// as mensagens e a resposta).
export const fichaDaRodada = (
  el: Elementos,
  agente: LensAgente | undefined,
  ficha: LensFichaDoAgente | undefined,
  rodadas: readonly RodadaVista[],
  n: number,
  quadro: Quadro,
  acoes: Acoes,
  agentes: readonly LensAgente[],
  // A volta desta tela (a do agente, para a anterior e a seguinte voltarem ao mesmo lugar).
  volta: string | undefined,
  // O grafo dos agentes que a rodada criou (ou com quem trocou recados), os
  // cartões deles e os recados dela, já postos de pé.
  extras: { rede?: RedeVista; recados?: readonly RecadoVisto[] } = {},
): RenderElement => {
  const { Box, Button, Text } = el

  if (agente === undefined) {
    return semItem(el, 'Este agente não está mais na lista.')
  }

  const rodada = rodadas.find(uma => uma.n === n)

  if (rodada === undefined) {
    return semItem(el, `A rodada ${n} deste agente não está mais guardada.`)
  }

  const marca = marcaDaRodada(rodada.estado)
  const nome = agente.workflow !== undefined ? (agente.rotulo ?? agente.descricao) : agente.descricao === '' ? agente.tipo : agente.descricao
  const anterior = rodadas.filter(uma => uma.n < n).at(-1)
  const seguinte = rodadas.find(uma => uma.n > n)
  const isRodando = rodada.fim === undefined
  const tempo = tempoDaRodada(rodada, quadro.agora)
  const uso = rodada.tokens
  // Os mesmos quadrinhos do detalhe de um agente, com os valores desta
  // rodada; o que não foi medido para ela não aparece.
  const ladrilhos: Ladrilho[] = [
    { rotulo: 'Modelo', valor: ((modelo: string | undefined) => (modelo === undefined ? 'n/d' : nomeDoModelo(modelo)))(modeloDaRodada(rodada, agente)), cor: 'roxo' },
    { rotulo: isRodando ? 'Rodando há' : 'Duração', valor: tempo, cor: 'azul' },
    // Sem o custo medido (rodada de uma sessão de antes desta versão), o
    // quadrinho fica, com n/d: some, e parecia que a rodada não custou.
    { rotulo: 'Custo', valor: rodada.custo === undefined ? 'n/d' : dolar(rodada.custo), cor: 'verde' as const },
    ...(rodada.contexto === undefined ? [] : [{ rotulo: 'Contexto', valor: tokens(rodada.contexto), cor: 'ciano' as const }]),
    { rotulo: 'Chamadas', valor: rodada.chamadas === undefined ? 'n/d' : String(rodada.chamadas) },
    ...ladrilhosDosTokens(uso, ''),
  ]
  const painel = cabecalhoEmPainel(el, quadro, {
    titulo: `Rodada ${n} de ${rodada.total}`,
    estado: { texto: `${marca.glifo} ${marca.nome}`, cor: corDaRodada(rodada.estado) },
    subtitulo: [nome, origemDaRodada(rodada, agentes), periodoDaRodada(rodada)].join(' · '),
    ladrilhos,
  })
  // A volta da tela de outra rodada é a mesma desta.
  const voltaDoAgente = volta === undefined ? undefined : volta.includes('|') ? volta.slice(volta.indexOf('|') + 1) : undefined
  const ir = (outra: RodadaVista) => abrirRodada(acoes, agente, outra.n, voltaDoAgente)

  return (
    <Box key="ficha" flexDirection="column" rowGap={1}>
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {anterior !== undefined && (
          <Button key="rodada-anterior" label={`‹ Rodada ${anterior.n}`} onPress={() => ir(anterior)} />
        )}
        {seguinte !== undefined && (
          <Button key="rodada-seguinte" label={`Rodada ${seguinte.n} ›`} onPress={() => ir(seguinte)} />
        )}
        <Button key="ver-agente-inteiro" label="Agente inteiro" onPress={() => acoes.abrir({ tipo: 'agente', id: agente.id })} />
        {rodada.n === rodada.total && (
          <Button key="mensagens" label={comTecla(quadro, 'Reler mensagens', 'm')} hotkey="m" onPress={() => acoes.mensagens(agente.id)} />
        )}
        {isRodando && agente.workflow === undefined && rodada.n === rodada.total && (
          <Button
            key="parar-agente"
            label={agente.isParando === true ? 'Parando…' : '■ Parar agente'}
            {...(agente.isParando === true ? { dimColor: true } : {})}
            onPress={() => acoes.pararAgente(agente.id)}
          />
        )}
      </Box>
      {painel}
      {painel === null && (
        <Box flexDirection="column">
          <Text wrap="wrap">
            <Text color={marca.cor}>{`${marca.glifo} `}</Text>
            <Text bold>{`Rodada ${n} de ${rodada.total}`}</Text>
            <Text dimColor>{` · ${nome}`}</Text>
          </Text>
          <Text dimColor wrap="wrap">{`${origemDaRodada(rodada, agentes)} · ${periodoDaRodada(rodada)}`}</Text>
          {etiquetas(el, 'rodada-numeros', [
            { texto: marca.nome, tom: rodada.estado === 'ok' ? 'verde' : rodada.estado === 'falhou' ? 'vermelho' : rodada.estado === 'rodando' ? 'azul' : 'ambar', isNegrito: true },
            { texto: agente.modelo === undefined ? 'modelo n/d' : nomeDoModelo(agente.modelo), tom: 'roxo' },
            { texto: `⏱ ${tempo}`, tom: 'azul' },
            rodada.custo !== undefined && { texto: dolar(rodada.custo), tom: 'verde', isNegrito: true },
            rodada.contexto !== undefined && { texto: `contexto ${tokens(rodada.contexto)}`, tom: 'ciano' },
            rodada.chamadas !== undefined && { texto: plural(rodada.chamadas, 'chamada', 'chamadas') },
            uso !== undefined && { texto: `entrada ${tokens(uso.entrada + uso.cacheLido + uso.cacheGravado)}` },
            uso !== undefined && { texto: `${tokens(uso.cacheLido)} do cache` },
            uso !== undefined && { texto: `saída ${tokens(uso.saida)}` },
          ])}
        </Box>
      )}
      {corpoDaRodada(el, agente, ficha, rodada, agentes, quadro, acoes, extras)}
    </Box>
  )
}

export const fichaDoComando = (
  el: Elementos,
  comando: LensComando | undefined,
  ficha: LensFichaDoComando | undefined,
  quadro: Quadro,
  acoes: Acoes,
): RenderElement => {
  const { Box, Code, Text } = el

  if (comando === undefined) {
    return semItem(el, 'Este comando não está mais na lista.')
  }

  const isVivo = comando.estado === 'rodando' || comando.estado === 'fundo'
  const isOk = comando.estado === 'ok'
  const estado = isVivo
    ? ESTADOS.rodando
    : isOk
      ? ESTADOS.ok
      : comando.estado === 'negado'
        ? ESTADOS.negado
        : ESTADOS.falhou
  const partes = [
    comando.estado === 'rodando' ? `rodando há ${duracaoViva(quadro.agora - comando.inicio)}` : undefined,
    comando.estado === 'fundo' ? 'em segundo plano' : undefined,
    comando.estado === 'negado' ? 'negado' : undefined,
    isOk ? 'concluído' : undefined,
    comando.estado === 'falhou' && comando.saida === undefined ? 'falhou' : undefined,
    comando.saida === undefined ? undefined : `exit ${comando.saida}`,
    comando.nota,
    comando.duracaoMs === undefined ? undefined : duracao(comando.duracaoMs),
    `por ${comando.quem}`,
  ].filter((parte): parte is string => parte !== undefined)
  const texto = ficha?.comando === undefined || ficha.comando === '' ? comando.comando : ficha.comando
  const dobra = dobraDe(quadro, acoes)
  const temSaida = ficha?.saida !== undefined || ficha?.erro !== undefined

  return (
    <Box key="ficha" flexDirection="column" rowGap={1}>
      <Box flexDirection="column">
        <Text wrap="wrap">
          <Text color={estado.cor}>{`${estado.glifo} `}</Text>
          <Text>{partes.join(' · ')}</Text>
        </Text>
        {ficha?.descricao !== undefined && <Text dimColor wrap="wrap">{ficha.descricao}</Text>}
      </Box>
      {secaoQueDobra(el, dobra, 'comando:comando', { texto: 'Comando', cor: COR.ciano }, [
        <Code source={texto} language="bash" wrap="wrap" />,
      ])}
      {ficha?.saida !== undefined &&
        secaoQueDobra(el, dobra, 'comando:saida', { texto: 'Saída', cor: COR.verde }, [
          <Code source={ficha.saida} wrap="wrap" />,
        ])}
      {ficha?.erro !== undefined &&
        secaoQueDobra(
          el,
          dobra,
          'comando:erro',
          { texto: isOk ? 'Saída de erro' : 'Erro', cor: isOk ? COR.ambar : COR.vermelho },
          [<Code source={ficha.erro} wrap="wrap" />],
        )}
      {!temSaida && (
        <Text dimColor>{isVivo ? 'A saída aparece quando o comando terminar.' : 'Sem saída.'}</Text>
      )}
    </Box>
  )
}

export const fichaDoTurno = (
  el: Elementos,
  grupo: Grupo | undefined,
  fichas: readonly LensFichaDoTurno[],
  agentes: readonly LensAgente[],
  edicoes: number,
  // As linhas dos comandos Bash do turno e os subagentes dele, já desenhados.
  comandos: readonly RenderElement[],
  subagentes: RenderElement | null,
  quadro: Quadro,
  acoes: Acoes,
): RenderElement => {
  const { Box, Button, Markdown, Text } = el

  if (grupo === undefined) {
    return semItem(el, 'Este turno não está mais na lista.')
  }

  const fichaDe = (n: number | undefined) => fichas.find(ficha => ficha.n === n)
  const tempo = grupo.isAndando ? duracaoViva(quadro.agora - grupo.inicio) : duracao(grupo.duracaoMs)
  const numeros = [
    grupo.variacao === undefined
      ? undefined
      : `${grupo.variacao >= 0 ? '+' : '−'}${tokens(grupo.variacao)} de contexto`,
    grupo.custo === undefined ? undefined : dolar(grupo.custo),
    edicoes > 0 ? plural(edicoes, 'edição', 'edições') : undefined,
    grupo.falhas > 0 ? plural(grupo.falhas, 'falha', 'falhas') : undefined,
  ].filter((parte): parte is string => parte !== undefined)
  const usadas = Object.entries(grupo.porFerramenta).sort((a, b) => b[1] - a[1])
  const cabeca = fichaDe(grupo.cabeca?.n)
  const pedido = semMarcas(cabeca?.pedido === undefined || cabeca.pedido === '' ? (grupo.cabeca?.pedido ?? '') : cabeca.pedido)
  // O pedido longo vem dobrado em ~6 linhas; "Mostrar tudo" abre o resto.
  const linhasDoPedido = pedido.split('\n')
  const comecoDoPedido = linhasDoPedido.slice(0, 6).join('\n').slice(0, 700)
  const isPedidoLongo = comecoDoPedido.length < pedido.trimEnd().length
  const chaveDoPedido = `aberta:turno-pedido:${grupo.ordem}`
  const isPedidoInteiro = (quadro.fechadas ?? []).includes(chaveDoPedido)
  const dobra = dobraDe(quadro, acoes)
  const nomeDoAgente = (id: string | undefined): string => {
    const agente = agentes.find(um => um.id === id)

    return agente === undefined ? 'agente' : `agente ${agente.tipo}`
  }
  // As chamadas que falharam no turno (no pedido e nos retornos dele): a
  // contagem "N falhas" do cartão diz quantas; aqui, quais e por quê.
  const falhas = [grupo.cabeca, ...grupo.retornos].flatMap(rodada => fichaDe(rodada?.n)?.falhas ?? [])
  const corDoEstado: CorDoGrafico = grupo.isAndando ? 'azul' : grupo.isAbortado ? 'vermelho' : grupo.falhas > 0 ? 'ambar' : 'verde'
  const textoDoEstado = grupo.isAndando
    ? '● em andamento'
    : grupo.isAbortado
      ? '✗ interrompido'
      : grupo.falhas > 0
        ? `✓ concluído · ${plural(grupo.falhas, 'falha', 'falhas')}`
        : '✓ concluído'
  const painel = cabecalhoEmPainel(el, quadro, {
    titulo: `Turno ${grupo.ordem}`,
    estado: { texto: textoDoEstado, cor: corDoEstado },
    ...(pedido === '' ? {} : { subtitulo: pedido.split('\n').find(linha => linha.trim() !== '')?.trim() ?? '' }),
    ladrilhos: [
      { rotulo: grupo.isAndando ? 'Rodando há' : 'Duração', valor: tempo, cor: 'azul' },
      ...(grupo.variacao === undefined
        ? []
        : [{ rotulo: 'Contexto', valor: `${grupo.variacao >= 0 ? '+' : '−'}${tokens(Math.abs(grupo.variacao))}`, cor: 'ciano' as const }]),
      ...(grupo.custo === undefined ? [] : [{ rotulo: 'Custo', valor: dolar(grupo.custo), cor: 'verde' as const }]),
      { rotulo: 'Ferramentas', valor: String(grupo.ferramentas) },
      ...(edicoes > 0 ? [{ rotulo: 'Edições', valor: String(edicoes) }] : []),
      ...(comandos.length > 0 ? [{ rotulo: 'Comandos Bash', valor: String(comandos.length) }] : []),
      ...(grupo.falhas > 0 ? [{ rotulo: 'Falhas', valor: String(grupo.falhas), cor: 'vermelho' as const }] : []),
    ],
  })

  return (
    <Box key="ficha" flexDirection="column" rowGap={1}>
      {painel}
      {painel === null && (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold>{`Turno ${grupo.ordem}`}</Text>
          {grupo.isAndando && <Text color={ESTADOS.rodando.cor}>{` · em andamento · ${tempo}`}</Text>}
          {!grupo.isAndando && <Text dimColor>{` · ${tempo}`}</Text>}
          {grupo.isAbortado && <Text color={COR.vermelho}>{' · interrompido'}</Text>}
        </Text>
        {numeros.length > 0 &&
          etiquetas(
            el,
            'turno-numeros',
            numeros.map(texto =>
              texto.startsWith('US$')
                ? { texto, tom: 'verde' as const, isNegrito: true }
                : texto.endsWith('de contexto')
                  ? { texto, tom: 'ciano' as const }
                  : { texto },
            ),
          )}
      </Box>
      )}
      {grupo.falhas > 0 &&
        secaoQueDobra(el, dobra, 'turno:falhas', { texto: 'Falhas', cor: COR.vermelho, contagem: `· ${grupo.falhas}` }, [
          falhas.length === 0 && (
            <Text dimColor wrap="wrap">
              O motivo de cada falha passou a ser guardado depois deste turno.
            </Text>
          ),
          ...falhas.map((falha, i) => (
            <Box key={`falha-${i}`} flexDirection="column">
              <Text wrap="truncate-end">
                <Text color={ESTADOS.falhou.cor}>{`${ESTADOS.falhou.glifo} `}</Text>
                <Text bold>{falha.ferramenta}</Text>
                {falha.argumento !== '' && <Text>{` ${falha.argumento}`}</Text>}
                <Text dimColor>{` · por ${falha.quem}`}</Text>
              </Text>
              <Text color={COR.vermelho} wrap="wrap">{`  ${falha.erro}`}</Text>
            </Box>
          )),
        ])}
      {/* O pedido e a resposta primeiro (é o que se procura num turno); as
          ferramentas e os comandos, de apoio, depois. O pedido em Markdown,
          com só o começo até alguém pedir o resto. */}
      {pedido !== '' &&
        secaoQueDobra(el, dobra, 'turno:pedido', { texto: 'Pedido', cor: COR.roxo }, [
          <Markdown key="turno-pedido-texto" text={isPedidoInteiro || !isPedidoLongo ? pedido : comecoDoPedido} dimColor />,
          isPedidoLongo && (
            <Box key="turno-pedido-mais" flexShrink={0}>
              <Button
                key={`turno-pedido-${grupo.ordem}`}
                label={isPedidoInteiro ? '▴ Mostrar menos' : '▾ Mostrar tudo'}
                plain
                dimColor
                hover={{ underline: true, color: COR.roxo }}
                onPress={() => acoes.alternarSecao(chaveDoPedido)}
              />
            </Box>
          ),
        ])}
      {subagentes}
      {secaoQueDobra(el, dobra, 'turno:resposta', { texto: 'Resposta', cor: COR.roxo }, [
        cabeca?.resposta === undefined || cabeca.resposta === '' ? (
          <Text dimColor>
            {grupo.cabeca?.duracaoMs === undefined ? 'O turno ainda está em andamento.' : 'Sem texto de resposta.'}
          </Text>
        ) : (
          <Markdown text={cabeca.resposta} />
        ),
      ])}
      {grupo.retornos.map(retorno => {
        const resposta = fichaDe(retorno.n)?.resposta
        const duracaoDoRetorno =
          retorno.duracaoMs === undefined ? 'em andamento' : duracao(retorno.duracaoMs)

        return (
          <Box flexDirection="column">
            <Text wrap="truncate-end">
              <Text color={COR.ciano}>{'↩ '}</Text>
              <Text bold>{`Depois do retorno do ${nomeDoAgente(retorno.agenteId)}`}</Text>
              <Text dimColor>{` · ${duracaoDoRetorno}`}</Text>
            </Text>
            {resposta === undefined || resposta === '' ? (
              <Text dimColor>Sem texto de resposta.</Text>
            ) : (
              <Markdown text={resposta} />
            )}
          </Box>
        )
      })}
      {secaoQueDobra(el, dobra, 'turno:ferramentas', { texto: 'Ferramentas', cor: COR.azul, contagem: `· ${grupo.ferramentas}` }, [
        usadas.length === 0 && <Text dimColor>Nenhuma chamada de ferramenta.</Text>,
        usadas.length > 0 && barrasDeContagem(el, usadas, quadro, 'azul', COR.azul, 'Chamadas de cada ferramenta no turno'),
      ])}
      {comandos.length > 0 &&
        secaoQueDobra(el, dobra, 'turno:comandos', { texto: 'Comandos Bash', cor: COR.ciano, contagem: `· ${comandos.length}` }, comandos)}
    </Box>
  )
}
