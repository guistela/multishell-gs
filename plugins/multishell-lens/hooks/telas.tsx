// O desenho das abas, a partir de dados prontos: nada aqui chama `$`.
// Os elementos vêm da tabela da superfície ($.ui.resolve) e os botões chamam
// as ações que o register.tsx passa.

import type {
  BoxProps,
  ButtonProps,
  CodeProps,
  ElementConstructor,
  InputProps,
  MarkdownProps,
  RenderElement,
  SvgProps,
  TextProps,
} from 'claude-code'

import type {
  LensItem,
  LensAba,
  LensAgente,
  LensCategoria,
  LensComando,
  LensContexto,
  LensDiffDoGit,
  LensEntrada,
  LensFichaDoAgente,
  LensFichaDoComando,
  LensFichaDoTurno,
  LensFoco,
  LensLimite,
  LensMensagem,
  LensLinha,
  LensGit,
  LensInventario,
  LensRodada,
  LensSecaoDoInventario,
  LensToque,
  LensTurno,
  LensUi,
} from '../types'
import { abaArvore } from './arvore-tela'
import { abaDiffs } from './diffs-tela'
import { turnoEmVista, turnosComEdicoes } from './diffs-lista'
import { abaInventario } from './inventario-tela'
import { abaVisaoGeral } from './visao-tela'
import { RECENTE_MS } from './arvore'
import { COR, TONS, corDoNivel, tomDoNivel } from './cores'
import type { NomeDaCor, NomeDoTom, Tom } from './cores'
import { cadeiaDoFoco, focoDaVolta, voltaDoFoco } from './caminho'
import { custoDoUltimoTurno, fimDoAgente, gruposDeTurnos, periodoDoAgente, rodadasDoAgente, semMoldura, tempoDoAgente, variacaoDoUltimoTurno } from './dados'
import type { Grupo, Segmento } from './dados'
import { abrirRodada, corDaRodada, fichaDaRodada, fichaDoAgente, fichaDoComando, fichaDoTurno, marcaDaRodada, origemDaRodada, periodoDaRodada, tempoDaRodada } from './fichas'
import type { RecadoVisto, RecorteDasRodadas, RedeVista } from './fichas'
import { contagemDaLista, isNaJanela, janelaDaRodada, modeloDaRodada, nomeDasRodadas, rodadasAbertasPor, rodadasNoTurno, rodadasVistas, trechosDoAgente } from './rodadas'
import type { RodadaVista } from './rodadas'
import {
  ALTURA_DA_FAIXA,
  LARGURA_MINIMA_DA_GRADE,
  barraDoAgente,
  barraDoPrincipal,
  barrasDosTurnos,
  eixoDoTempo,
  gradeDeGastos,
  ALTURA_DO_DISPONIVEL,
  COR_DO_ESCOPO,
  LARGURA_DO_DISPONIVEL,
  NOME_DO_ESCOPO,
  cartaoDoDisponivel,
  grafoDosAgentes,
  painelDoContexto,
  painelDosLimites,
  pilha,
  tituloDoAgente,
} from './graficos'
import type { ArestaDoGrafo, EscopoDoAgente, LimiteDoPainel, LinhaDaDica, LinhaDeGasto, NoDoGrafo } from './graficos'
import { nomeDoModelo } from './pilulas'
import type { AreaClicavel, Desenho } from './pilulas'
import { ESTADOS, barrasDeContagem, cartao, cartaoClicavel, comMoldura, comTecla, dobraDe, etiquetas, regua, secao, secaoQueDobra, selo } from './pecas'
import type { Estado } from './pecas'
import {
  PIXELS_POR_COLUNA,
  PIXELS_POR_LINHA,
  curto,
  decimal,
  dolar,
  duracao,
  duracaoViva,
  grafico,
  diaEHora,
  limitar,
  nomeDoLimite,
  plural,
  relativo,
  renovaEm,
  semMarcas,
  semRaiz,
  tokens,
  umaLinha,
} from './formato'

export type Elementos = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  // O mobile não tem Input: sem ele, o inventário fica sem o filtro.
  Input: ElementConstructor<InputProps> | null
  Markdown: ElementConstructor<MarkdownProps>
  Code: ElementConstructor<CodeProps>
  // Só as superfícies remotas (o app Desktop) desenham SVG; o terminal não.
  Svg: ElementConstructor<SvgProps> | null
}

export type Dados = {
  ui: LensUi
  agentes: readonly LensAgente[]
  mensagens: readonly LensMensagem[]
  // O resumo do topo do painel (veja resumoDaSessao).
  resumo: string
  turnos: readonly LensTurno[]
  contexto: LensContexto
  comandos: readonly LensComando[]
  rodadas: readonly LensRodada[]
  // Quando a sessão começou (só a aba Agentes lê).
  inicioDaSessao?: number | undefined
  arvore: {
    toques: readonly LensToque[]
    git: LensGit
    pastas: Readonly<Record<string, readonly LensEntrada[]>>
  }
  inventario: LensInventario
  diffGit: LensDiffDoGit
  // A aba Contexto: o custo e os tokens da sessão, da conversa e dos agentes.
  totais?: {
    tokensConversa: number
    tokensSubagentes: number
    usdSubagentes: number
    semCacheConversa: number
    semCacheSubagentes: number
    quantosAgentes: number
    // O que o último pedido da pessoa somou (ausente antes do primeiro).
    ultimo?: {
      tokensConversa: number
      tokensSubagentes: number
      semCacheConversa: number
      semCacheSubagentes: number
      usdSubagentes: number
    }
  }
  // O detalhe do item em foco, quando há um aberto.
  fichas: {
    agente?: LensFichaDoAgente
    comando?: LensFichaDoComando
    turnos?: readonly LensFichaDoTurno[]
    // No detalhe de um turno, o detalhe de cada agente criado nele.
    agentesDoTurno?: Readonly<Record<string, LensFichaDoAgente>>
  }
}

export type Quadro = {
  largura: number
  agora: number
  raiz: string
  // Painel sentado acima do prompt, ou a faixa: menos linhas por aba.
  isCompacto: boolean
  isTerminal: boolean
  isFaixa: boolean
  // Quantas linhas o painel mostra de uma vez (o grafo ampliado toma essa altura).
  linhas?: number
  // Quantos reais vale um dólar (0: sem o valor em reais).
  cotacao?: number
  // As seções fechadas no ▾ ao lado do título.
  fechadas?: readonly string[]
  // O tom da aba aberta: os títulos das seções vão nele.
  tomDaAba?: NomeDoTom
}

export type Acoes = {
  aba: (aba: LensAba) => void
  // Da Visão geral: abre o Diffs (fonte Sessão) no arquivo dado.
  diffDoArquivo: (caminho: string) => void
  abrir: (foco: LensFoco) => void
  voltar: () => void
  mensagens: (agentId: string) => void
  // Pede a um agente que rode para ele parar (o detalhe dele tem o botão).
  pararAgente: (agentId: string) => void
  turno: (delta: number) => void
  detalhar: () => void
  fechar: () => void
  // Aba Árvore.
  pasta: (caminho: string, isAberta: boolean) => void
  arvoreToda: () => void
  atualizarArvore: () => void
  recolher: () => void
  grafoGrande: () => void
  escalaDoGrafo: (passo: number) => void
  filtroDoGrafo: (filtro: 'todos' | 'rodando' | 'falhou') => void
  expandir: () => void
  // Aba Diffs.
  fonteDoDiff: (fonte: 'sessao' | 'turno' | 'git') => void
  arquivo: (caminho: string) => void
  arquivoVizinho: (delta: number) => void
  // Aba Inventário.
  secao: (secao: LensSecaoDoInventario) => void
  secaoVizinha: (delta: number) => void
  filtroDoInventario: (texto: string) => void
  // Mais 30 itens da seção do inventário.
  maisDoInventario: () => void
  grupoDoInventario: (chave: string) => void
  alternarSecao: (chave: string) => void
  atualizarInventario: () => void
}

// Cada aba tem a sua cor (a do selo quando está aberta, a dos títulos e da
// régua embaixo das abas) e um ícone, que sozinho a representa no painel estreito.
// A ordem da barra vai do que acontece agora ao que é consulta: a Visão geral,
// os agentes, os turnos, o que mudou no código (Diffs, Árvore), o contexto em
// detalhe e o inventário. A tecla de cada uma é a posição dela (1 a 7); o
// número `n` é o de sempre, guardado no estado e nas chaves dos botões.
export const ABAS: readonly { n: LensAba; nome: string; icone: string; tom: NomeDaCor & NomeDoTom }[] = [
  // Os ícones, todos das formas geométricas, do mesmo peso.
  { n: 0, nome: 'Visão geral', icone: '◉', tom: 'marca' },
  { n: 1, nome: 'Agentes', icone: '◈', tom: 'ciano' },
  { n: 4, nome: 'Turnos', icone: '◷', tom: 'roxo' },
  { n: 2, nome: 'Diffs', icone: '◧', tom: 'verde' },
  { n: 5, nome: 'Árvore', icone: '▤', tom: 'laranja' },
  { n: 3, nome: 'Contexto', icone: '◔', tom: 'azul' },
  { n: 6, nome: 'Inventário', icone: '▦', tom: 'ambar' },
]

// A tecla de uma aba: a posição dela na barra.
export const teclaDaAba = (aba: LensAba): string => String(ABAS.findIndex(uma => uma.n === aba) + 1)

// Abaixo disto, as abas fechadas mostram só o ícone.
const LARGURA_DAS_ABAS_INTEIRAS = 84

// A cor de uma aba, como texto: o hex do tom dela, o mesmo do selo da aba
// aberta, das barras de título e das pílulas (uma fonte só, em qualquer tema).
export const corDaAba = (aba: LensAba): string => TONS[ABAS.find(uma => uma.n === aba)?.tom ?? 'marca'].fundo

// Uma linha em branco entre os blocos; nenhuma na versão compacta.
const respiro = (quadro: Quadro): number => (quadro.isCompacto ? 0 : 1)

// Os gráficos em SVG: só no desktop, e não na versão compacta.
const temSvg = (el: Elementos, quadro: Quadro): el is Elementos & { Svg: ElementConstructor<SvgProps> } =>
  el.Svg !== null && !quadro.isTerminal && !quadro.isCompacto

// O turno anterior ou seguinte com edições, na fonte "turno" da aba Diffs.
// No mais recente, volta a acompanhar os próximos (0).
export const moverTurno = (ui: LensUi, turnos: readonly LensTurno[], delta: number): LensUi => {
  const lista = turnosComEdicoes(turnos)
  const atual = turnoEmVista(ui, turnos)

  if (atual === undefined) {
    return ui
  }

  const indice = limitar(lista.indexOf(atual) + delta, 0, lista.length - 1)
  const alvo = lista[indice]

  return alvo === undefined ? ui : { ...ui, turno: indice === lista.length - 1 ? 0 : alvo.n }
}

// O que na aba em vista muda com o relógio: 'curto' quando há tempo correndo
// abaixo de um minuto (ou um fio, um arquivo aceso há pouco), que aparece em
// segundos; 'longo' quando só há tempo correndo há mais de um minuto, que
// aparece em minutos (então muda só na virada de cada minuto, contado do
// começo de cada um: `inicios`); undefined quando nada muda sozinho.
export type Relogio = { tipo: 'curto' | 'longo'; inicios: number[] }

export const temRelogio = (dados: Dados, agora: number): Relogio | undefined => {
  const inicios: number[] = []
  let isCurto = false
  const foco = dados.ui.foco

  if (dados.ui.aba === 5) {
    isCurto ||= dados.arvore.toques.some(toque => toque.agora !== undefined || agora - toque.quando < RECENTE_MS)
  }

  const isDetalheDeAgente = foco?.tipo === 'agente' || foco?.tipo === 'rodada'

  if (dados.ui.aba === 1 || isDetalheDeAgente) {
    for (const agente of dados.agentes) {
      if (agente.estado === 'rodando' && (!isDetalheDeAgente || foco?.id === agente.id)) {
        inicios.push(agente.inicio)
      }

      // O fio de quem acabou de nascer ou de terminar corre por uns segundos.
      isCurto ||= dados.ui.aba === 1 && agora - agente.inicio - (agente.duracaoMs ?? 0) < FIO_CORRENDO_MS
    }

    isCurto ||= dados.ui.aba === 1 && dados.mensagens.some(mensagem => agora - mensagem.quando < FIO_CORRENDO_MS)
  }

  if (dados.ui.aba === 4) {
    for (const comando of dados.comandos) {
      if (comando.estado === 'rodando') {
        inicios.push(comando.inicio)
      }
    }

    for (const rodada of dados.rodadas) {
      if (rodada.duracaoMs === undefined) {
        inicios.push(rodada.inicio)
      }
    }
  }

  // A Visão geral mostra há quanto tempo a conversa principal pensa e cada
  // agente que roda: sem o relógio, o "pensando há 59s" ficava parado.
  if (dados.ui.aba === 0 && foco === undefined) {
    for (const rodada of dados.rodadas) {
      if (rodada.duracaoMs === undefined) {
        inicios.push(rodada.inicio)
      }
    }

    for (const agente of dados.agentes) {
      if (agente.estado === 'rodando') {
        inicios.push(agente.inicio)
      }
    }
  }

  isCurto ||= inicios.some(inicio => agora - inicio < 60_000)

  return isCurto ? { tipo: 'curto', inicios } : inicios.length > 0 ? { tipo: 'longo', inicios } : undefined
}

// Algum tempo que aparece em minutos virou de minuto entre `antes` e `agora`?
export const virouMinuto = (relogio: Relogio, antes: number, agora: number): boolean =>
  relogio.inicios.some(inicio => Math.floor((agora - inicio) / 60_000) !== Math.floor((antes - inicio) / 60_000))

// O selo do Lens, em laranja, à frente da linha de resumo e no topo do
// painel; na versão compacta, só as iniciais.
export const seloDaMarca = (el: Pick<Elementos, 'Box' | 'Text'> & { Svg?: Elementos['Svg'] }, isCurto = false): RenderElement => {
  const { Box } = el

  // Num Box que não encolhe: o selo nunca quebra em duas linhas. No app, uma
  // pílula de pontas redondas, como as abas; no terminal, o texto com fundo.
  return <Box flexShrink={0}>{selo(el, isCurto ? '✦' : '✦ Lens', 'marca')}</Box>
}

const abas = (el: Elementos, dados: Dados, quadro: Quadro, acoes: Acoes): RenderElement => {
  const { Box, Button } = el
  const isInteiras = quadro.largura >= LARGURA_DAS_ABAS_INTEIRAS

  // No terminal, o botão sem moldura já escreve a tecla antes do rótulo ("2: ± Diffs").
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={quadro.isTerminal ? 2 : 1}>
      {quadro.isCompacto && seloDaMarca(el, true)}
      {ABAS.map(aba =>
        aba.n === dados.ui.aba ? (
          <Box key={`guia-${aba.n}`} flexShrink={0}>
            {selo(el, `${aba.icone} ${aba.nome}`, aba.tom, true, quadro.isTerminal ? undefined : 26)}
          </Box>
        ) : (
          <Box key={`guia-${aba.n}`} flexShrink={0}>
            <Button
              key={`aba-${aba.n}`}
              label={isInteiras ? `${aba.icone} ${aba.nome}` : aba.icone}
              hotkey={teclaDaAba(aba.n)}
              {...comMoldura(quadro)}
              hover={{ color: TONS[aba.tom].fundo, bold: true }}
              onPress={() => acoes.aba(aba.n)}
            />
          </Box>
        ),
      )}
      {quadro.isFaixa && (
        <Button key="fechar" label="Fechar" role="dismiss" plain dimColor onPress={acoes.fechar} />
      )}
    </Box>
  )
}

// Ao lado da marca, o estado da sessão numa linha: o que roda e quanto custou.
// O nome numa linha de lista, que abre o detalhe: um botão sem moldura que
// fica sublinhado e na cor da aba enquanto o mouse está sobre a linha.
const titulo = (
  el: Elementos,
  chave: string,
  texto: string,
  cor: string,
  abrir: () => void,
): RenderElement => {
  const { Button } = el

  return <Button key={chave} label={texto} plain hover={{ underline: true, color: cor }} onPress={abrir} />
}

// A marca do estado à esquerda da linha, como numa lista de CI.
const glifo = (el: Elementos, estado: Estado): RenderElement => {
  const { Text } = el

  return <Text color={estado.cor}>{estado.glifo}</Text>
}

const estadoDoAgente = (agente: LensAgente): Estado =>
  agente.estado === 'rodando' ? ESTADOS.rodando : agente.estado === 'concluido' ? ESTADOS.ok : ESTADOS.falhou

const atividade = (agente: LensAgente): string =>
  agente.ferramenta === undefined
    ? 'iniciando'
    : `${agente.ferramenta} ${agente.argumento ?? ''}`.trim()

// O cartão de um agente, o mesmo na aba Agentes e no detalhe de um turno: o
// nome e o estado no alto, os números em etiquetas, a situação e, embaixo, o
// começo do pedido e da resposta. `volta`: o Voltar do detalhe traz de volta
// ao turno.
const linhaDoAgente = (
  el: Elementos,
  agente: LensAgente,
  quadro: Quadro,
  acoes: Acoes,
  // `rodadas`: as rodadas dele, quando o cartão é do agente inteiro (a aba
  // Agentes); com mais de uma, o cartão lista cada rodada no lugar do pedido
  // e da resposta, que misturariam rodadas.
  opcoes: { volta?: string; pedido?: string; resposta?: string; escopo?: EscopoDoAgente; rodadas?: readonly RodadaVista[] } = {},
): RenderElement => {
  const { Box, Button, Text } = el
  const isRodando = agente.estado === 'rodando'
  const estado = estadoDoAgente(agente)
  const tempo = tempoDoAgente(agente, quadro.agora)
  const rodadas = Math.max(rodadasDoAgente(agente), (opcoes.rodadas ?? []).length)
  // O mesmo agente que trabalhou mais de uma vez: o cartão é do agente
  // inteiro, com os totais (rotulados assim) e uma linha por rodada no lugar
  // do pedido e da resposta, que misturariam rodadas.
  const isEmRodadas = rodadas > 1
  const sufixo = isEmRodadas ? ' total' : ''
  const detalhe = semRaiz(
    isRodando ? atividade(agente) : (agente.resultado ?? 'sem texto de resultado'),
    quadro.raiz,
  )
  const numeros = [
    agente.modelo === undefined ? 'modelo n/d' : nomeDoModelo(agente.modelo),
    tempo,
    agente.contexto === undefined ? undefined : `contexto ${tokens(agente.contexto)}`,
    agente.custo === undefined ? undefined : `${dolar(agente.custo)}${sufixo}`,
    agente.chamadas > 0 ? `${plural(agente.chamadas, 'chamada', 'chamadas')}${sufixo}` : undefined,
    agente.tokens === undefined ? undefined : `${tokens(agente.tokens)} tokens${sufixo}`,
  ].filter((parte): parte is string => parte !== undefined)

  if (quadro.isCompacto) {
    return (
      <Text wrap="truncate-end">
        <Text color={estado.cor}>{`${estado.glifo} `}</Text>
        <Text bold>{agente.tipo}</Text>
        <Text dimColor>{` · ${agente.modelo === undefined ? 'modelo n/d' : nomeDoModelo(agente.modelo)} · ${tempo} · ${detalhe}`}</Text>
      </Text>
    )
  }

  const abrir = () =>
    acoes.abrir({ tipo: 'agente', id: agente.id, ...(opcoes.volta === undefined ? {} : { volta: opcoes.volta }) })
  const situacao =
    agente.isParando === true
      ? 'parando a seu pedido…'
      : agente.isParado === true
        ? 'parado antes de terminar'
        : isRodando
          ? 'em execução'
          : agente.estado === 'concluido'
            ? 'concluído'
            : 'falhou'
  // O pedido e a resposta em até duas linhas, cortados com "…" aqui mesmo
  // (o corte automático do app não vale num texto que quebra linha).
  const porLinha = Math.max(30, quadro.largura - 16)
  const pedido = curto(semRaiz(umaLinha(semMarcas(opcoes.pedido ?? agente.tarefa ?? '')), quadro.raiz), porLinha * 2)
  const resposta = curto(semRaiz(umaLinha(opcoes.resposta ?? agente.resultado ?? ''), quadro.raiz), porLinha * 2)
  const linhasDe = (texto: string) => (texto === '' ? 0 : Math.ceil((texto.length + 10) / porLinha))
  const corDoRotulo = corDaAba(1)
  // No jeito dos cartões "Em execução" do Claude Code: o título (a tarefa, ou o
  // tipo), uma linha cinza com o tipo e o tempo, e a linha dos números com o
  // que está rodando agora e o link para o detalhe.
  const tituloDoCartao = agente.descricao === '' ? agente.tipo : agente.descricao
  const numerosSemTempo = numeros.filter(parte => parte !== tempo)

  const rodadasDele = isEmRodadas ? (opcoes.rodadas ?? []) : []
  // As rodadas de antes de o Lens guardá-las (dados antigos): contam no
  // número, mas não têm linha.
  const semLinha = rodadas - rodadasDele.length

  // O cartão inteiro abre o detalhe: as três linhas de cima e as do pedido e
  // da resposta (uma linha cada, para os botões invisíveis cobrirem certo).
  // Com a lista das rodadas, só as três de cima: cada rodada tem o seu botão.
  const linhas = isEmRodadas ? 3 : 3 + linhasDe(pedido) + (isRodando && resposta === '' ? 1 : linhasDe(resposta))

  // A borda neutra: o estado já está no glifo do título.
  return cartaoClicavel(el, `linha-agente-${agente.id}`, 'subtle', isRodando ? estado.cor : COR.verde, linhas, quadro, abrir, [
    // O nome em destaque: no app, maior (as pílulas coloridas embaixo
    // chamavam mais atenção que ele); no terminal, em negrito.
    temSvg(el, quadro) ? (
      ((desenho: ReturnType<typeof tituloDoAgente>) => (
        <el.Svg
          key={`titulo-agente-${agente.id}`}
          source={desenho.source}
          alt={`${estado.glifo} ${tituloDoCartao}${agente.descricao === '' ? '' : ` (${tipoDe(agente)})`}`}
          width={desenho.width}
          height={desenho.height}
        />
      ))(
        tituloDoAgente(
          {
            glifo: estado.glifo,
            corDoGlifo: TONS[isRodando ? 'azul' : agente.estado === 'concluido' ? 'verde' : 'vermelho'].fundo,
            nome: tituloDoCartao,
            ...(agente.descricao === '' ? {} : { tipo: tipoDe(agente) }),
          },
          (quadro.largura - 22) * PIXELS_POR_COLUNA,
        ),
      )
    ) : (
      <Text wrap="truncate-end">
        <Text color={estado.cor}>{`${estado.glifo} `}</Text>
        <Text bold>{tituloDoCartao}</Text>
        {agente.descricao !== '' && <Text dimColor>{` (${tipoDe(agente)})`}</Text>}
      </Text>
    ),
    // Os números em etiquetas: o modelo, o tempo, o contexto, o custo. Cor só
    // no que tem sentido (a origem e o custo); o resto em cinza.
    etiquetas(el, `numeros-${agente.id}`, [
      // De onde vem o agente, na cor da origem (o embutido, sem pílula).
      opcoes.escopo !== undefined && opcoes.escopo !== 'embutido' && { texto: NOME_DO_ESCOPO[opcoes.escopo], tom: TOM_DO_ESCOPO[opcoes.escopo], isNegrito: true },
      { texto: agente.modelo === undefined ? 'modelo n/d' : nomeDoModelo(agente.modelo) },
      { texto: `⏱ ${tempo}${sufixo}` },
      // O mesmo agente que um recado acordou depois de terminar.
      isEmRodadas && { texto: `↻ ${rodadas} rodadas`, tom: 'roxo' as const },
      ...numerosSemTempo.slice(1).map(texto =>
        texto.startsWith('US$') ? { texto, tom: 'verde' as const, isNegrito: true } : { texto },
      ),
    ]),
    <Box flexDirection="row" columnGap={1}>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          {/* Rodando, o que ele faz agora; pronto, só o estado (o resultado se lê no detalhe). */}
          {agente.isParando === true ? (
            <Text color={COR.ambar}>{situacao}</Text>
          ) : isRodando ? (
            <Text color={estado.cor}>{`▸ ${curto(detalhe, 70)}`}</Text>
          ) : (
            <Text color={agente.isParado === true ? COR.ambar : estado.cor}>{situacao}</Text>
          )}
          {/* Quando rodou: o começo e o fim (ou "agora"). */}
          <Text dimColor>{`  ·  ${periodoDoAgente(agente)}`}</Text>
        </Text>
      </Box>
      {/* Num painel estreito do Desktop, o cartão inteiro já abre o detalhe:
          o link sai e sobra lugar para os números. */}
      {(quadro.isTerminal || quadro.largura >= 80) && (
        <Button
          key={`ver-agente-${agente.id}`}
          label="Ver detalhes"
          {...comMoldura(quadro)}
          hover={{ underline: true, color: corDaAba(1) }}
          onPress={abrir}
        />
      )}
    </Box>,
    !isEmRodadas && pedido !== '' && (
      <Text wrap="wrap">
        <Text color={corDoRotulo} bold>{'Pedido  '}</Text>
        <Text dimColor>{pedido}</Text>
      </Text>
    ),
    !isEmRodadas && (isRodando || resposta !== '') && (
      <Text wrap="wrap">
        <Text color={corDoRotulo} bold>{'Resposta  '}</Text>
        {resposta === '' ? <Text dimColor>ainda trabalhando</Text> : <Text>{resposta}</Text>}
      </Text>
    ),
    ...rodadasDele.map(rodada => linhaCurtaDaRodada(el, agente, rodada, quadro, acoes, opcoes.volta)),
    isEmRodadas && semLinha > 0 && (
      <Text key={`rodadas-sem-linha-${agente.id}`} dimColor wrap="truncate-end">
        {`${rodadasDele.length === 0 ? '' : '+ '}${plural(semLinha, 'rodada de antes', 'rodadas de antes')}, sem o detalhe guardado · o detalhe tem os totais`}
      </Text>
    ),
  ])
}

// Uma rodada numa linha, dentro do cartão do agente inteiro: o número (que
// abre a tela dela), quando foi, como terminou e o começo da resposta.
const linhaCurtaDaRodada = (
  el: Elementos,
  agente: LensAgente,
  rodada: RodadaVista,
  quadro: Quadro,
  acoes: Acoes,
  volta: string | undefined,
): RenderElement => {
  const { Box, Button, Text } = el
  const marca = marcaDaRodada(rodada.estado)
  const resposta = curto(semRaiz(umaLinha(semMoldura(rodada.resposta ?? '')), quadro.raiz), Math.max(20, quadro.largura - 44))

  return (
    <Box key={`rodada-curta-${agente.id}-${rodada.n}`} flexDirection="row">
      <Box flexShrink={0}>
        <Button
          key={`rodada-${agente.id}-${rodada.n}`}
          label={`Rodada ${rodada.n}`}
          plain
          hover={{ underline: true, color: COR.roxo }}
          onPress={() => abrirRodada(acoes, agente, rodada.n, volta)}
        />
      </Box>
      <Box flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          <Text dimColor>{` · ${periodoDaRodada(rodada)} · `}</Text>
          <Text color={marca.cor}>{marca.glifo}</Text>
          {resposta === '' ? (
            <Text dimColor>{rodada.fim === undefined ? ' ainda trabalhando' : ` ${marca.nome}`}</Text>
          ) : (
            <Text>{` ${resposta}`}</Text>
          )}
        </Text>
      </Box>
    </Box>
  )
}

// O cartão de uma rodada de um agente que trabalhou mais de uma vez, nos
// contextos em que só algumas rodadas dele aconteceram (o detalhe de um turno,
// os agentes dentro de outro agente): o nome do agente com o número da rodada,
// os números dela, o recado ou pedido dela e a resposta dela. O cartão
// inteiro abre a tela da rodada.
const cartaoDaRodada = (
  el: Elementos,
  agente: LensAgente,
  rodada: RodadaVista,
  agentes: readonly LensAgente[],
  quadro: Quadro,
  acoes: Acoes,
  opcoes: { volta?: string; escopo?: EscopoDoAgente } = {},
): RenderElement => {
  const { Box, Button, Text } = el
  const marca = marcaDaRodada(rodada.estado)
  const abrir = () => abrirRodada(acoes, agente, rodada.n, opcoes.volta)
  const tempo = tempoDaRodada(rodada, quadro.agora)
  const isRodando = rodada.fim === undefined
  const nome = agente.descricao === '' ? agente.tipo : agente.descricao
  const titulo = `${nome} · rodada ${rodada.n} de ${rodada.total}`
  const uso = rodada.tokens
  const tokensDaRodada = uso === undefined ? undefined : uso.entrada + uso.cacheLido + uso.cacheGravado + uso.saida
  const porLinha = Math.max(30, quadro.largura - 16)
  const pedido = curto(semRaiz(umaLinha(semMarcas(rodada.pedido ?? '')), quadro.raiz), porLinha * 2)
  const resposta = curto(semRaiz(umaLinha(semMoldura(rodada.resposta ?? '')), quadro.raiz), porLinha * 2)
  const linhasDe = (texto: string) => (texto === '' ? 0 : Math.ceil((texto.length + 10) / porLinha))
  const corDoRotulo = corDaAba(1)

  if (quadro.isCompacto) {
    return (
      <Text wrap="truncate-end">
        <Text color={marca.cor}>{`${marca.glifo} `}</Text>
        <Text bold>{titulo}</Text>
        <Text dimColor>{` · ${tempo} · ${marca.nome}`}</Text>
      </Text>
    )
  }

  // As mesmas linhas do cartão do agente: as três de cima, o pedido e a resposta.
  const linhas = 3 + linhasDe(pedido) + (isRodando && resposta === '' ? 1 : linhasDe(resposta))

  return cartaoClicavel(el, `cartao-rodada-${agente.id}-${rodada.n}`, 'subtle', marca.cor, linhas, quadro, abrir, [
    temSvg(el, quadro) ? (
      ((desenho: ReturnType<typeof tituloDoAgente>) => (
        <el.Svg
          key={`titulo-rodada-${agente.id}-${rodada.n}`}
          source={desenho.source}
          alt={`${marca.glifo} ${titulo} (${tipoDe(agente)})`}
          width={desenho.width}
          height={desenho.height}
        />
      ))(
        tituloDoAgente(
          { glifo: marca.glifo, corDoGlifo: TONS[corDaRodada(rodada.estado)].fundo, nome: titulo, tipo: tipoDe(agente) },
          (quadro.largura - 22) * PIXELS_POR_COLUNA,
        ),
      )
    ) : (
      <Text wrap="truncate-end">
        <Text color={marca.cor}>{`${marca.glifo} `}</Text>
        <Text bold>{titulo}</Text>
        <Text dimColor>{` (${tipoDe(agente)})`}</Text>
      </Text>
    ),
    etiquetas(el, `numeros-rodada-${agente.id}-${rodada.n}`, [
      opcoes.escopo !== undefined && opcoes.escopo !== 'embutido' && { texto: NOME_DO_ESCOPO[opcoes.escopo], tom: TOM_DO_ESCOPO[opcoes.escopo], isNegrito: true },
      { texto: ((modelo: string | undefined) => (modelo === undefined ? 'modelo n/d' : nomeDoModelo(modelo)))(modeloDaRodada(rodada, agente)) },
      { texto: `⏱ ${tempo}` },
      { texto: `↻ rodada ${rodada.n} de ${rodada.total}`, tom: 'roxo' as const },
      // Os mesmos números do cartão de um agente, só desta rodada.
      rodada.contexto !== undefined && { texto: `contexto ${tokens(rodada.contexto)}` },
      rodada.custo !== undefined && { texto: dolar(rodada.custo), tom: 'verde' as const, isNegrito: true },
      rodada.chamadas !== undefined && { texto: plural(rodada.chamadas, 'chamada', 'chamadas') },
      tokensDaRodada !== undefined && { texto: `${tokens(tokensDaRodada)} tokens` },
    ]),
    <Box flexDirection="row" columnGap={1}>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          <Text color={marca.cor}>{marca.nome}</Text>
          <Text dimColor>{`  ·  ${periodoDaRodada(rodada)}  ·  ${origemDaRodada(rodada, agentes)}`}</Text>
        </Text>
      </Box>
      {(quadro.isTerminal || quadro.largura >= 80) && (
        <Button
          key={`ver-rodada-${agente.id}-${rodada.n}`}
          label="Ver rodada"
          {...comMoldura(quadro)}
          hover={{ underline: true, color: corDaAba(1) }}
          onPress={abrir}
        />
      )}
    </Box>,
    pedido !== '' && (
      <Text wrap="wrap">
        <Text color={corDoRotulo} bold>{rodada.n === 1 ? 'Pedido  ' : 'Recado  '}</Text>
        <Text dimColor>{pedido}</Text>
      </Text>
    ),
    (isRodando || resposta !== '') && (
      <Text wrap="wrap">
        <Text color={corDoRotulo} bold>{'Resposta  '}</Text>
        {resposta === '' ? <Text dimColor>ainda trabalhando</Text> : <Text>{resposta}</Text>}
      </Text>
    ),
  ])
}

// Uma fileira de selos com as contagens, no alto de uma aba; os zeros não vão.
const contagens = (
  el: Elementos,
  partes: readonly { n: number; texto: string; tom: NomeDoTom }[],
): RenderElement | null => {
  const { Box } = el
  const visiveis = partes.filter(parte => parte.n > 0)

  return visiveis.length === 0 ? null : (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      {visiveis.map(parte => selo(el, parte.texto, parte.tom))}
    </Box>
  )
}

// Há quanto tempo um agente nascer, terminar ou mandar mensagem faz o fio
// dele correr no grafo.
const FIO_CORRENDO_MS = 8000

// De onde vem a definição do tipo do agente, pelo inventário: as suas
// configurações (~/.claude/agents), o projeto, um plugin ou embutido.
// A pílula da origem nos cartões, no tom da cor dela.
const TOM_DO_ESCOPO: Record<EscopoDoAgente, NomeDoTom> = { global: 'roxo', projeto: 'laranja', plugin: 'azul', embutido: 'cinza' }

// A origem de um agente instalado, pelo item do inventário.
const escopoDoItem = (item: LensItem): EscopoDoAgente =>
  item.plugin !== undefined || item.origem.startsWith('plugin')
    ? 'plugin'
    : item.origem === 'projeto' || item.origem === 'projectSettings'
      ? 'projeto'
      : item.origem === 'suas' || item.origem === 'userSettings'
        ? 'global'
        : 'embutido'

const semPrefixoDoPlugin = (nome: string): string => nome.split(':').at(-1) ?? nome

// De onde vem a definição de um agente: decide o inventário (a pasta de onde
// o arquivo do agente foi lido: as suas configurações, o projeto ou um
// plugin). O "fornecedor" que o Claude informa no nascimento do agente não
// serve: o de um agente do projeto também não é o motor, e ele parecia de
// plugin. Sem o inventário lido, só o nome com prefixo ("plugin:agente") diz
// que é de plugin.
const escopoDo = (agente: LensAgente, itens: Dados['inventario']['itens']): EscopoDoAgente => {
  const tipo = semPrefixoDoPlugin(agente.tipo)
  const doInventario = itens
    .filter(um => um.tipo === 'agente' && semPrefixoDoPlugin(um.nome) === tipo)
    .map(escopoDoItem)
  // O mesmo nome em mais de uma origem: vale a que o Claude usa primeiro (o
  // projeto, depois as suas configurações, depois os plugins).
  const achado = (['projeto', 'global', 'plugin'] as const).find(escopo => doInventario.includes(escopo))

  if (achado !== undefined) {
    return achado
  }

  return agente.tipo.includes(':') ? 'plugin' : 'embutido'
}

// Os agentes instalados (globais, do projeto e de plugin), chamados ou não,
// desde o começo da sessão: um cartão por agente, na cor da origem. O que
// ainda não foi chamado fica apagado e tracejado; o chamado, aceso, com
// quantas vezes e quando, e um clique abre a última vez que ele rodou.
export const agentesDisponiveis = (el: Elementos, dados: Dados, quadro: Quadro, acoes: Acoes): RenderElement | null => {
  const { Box, Button, Text } = el
  const ordem: EscopoDoAgente[] = ['global', 'projeto', 'plugin']
  const vistos = new Set<string>()
  const instalados = dados.inventario.itens
    .filter(item => item.tipo === 'agente')
    .map(item => ({ item, escopo: escopoDoItem(item), nome: semPrefixoDoPlugin(item.nome) }))
    .filter(({ escopo, nome }) => {
      const chave = `${escopo}:${nome}`

      if (escopo === 'embutido' || vistos.has(chave)) {
        return false
      }

      vistos.add(chave)

      return true
    })
    .sort((a, b) => ordem.indexOf(a.escopo) - ordem.indexOf(b.escopo) || a.nome.localeCompare(b.nome))

  if (instalados.length === 0) {
    return null
  }

  const cartoes = instalados.map(({ item, escopo, nome }, i) => {
    const execucoes = dados.agentes.filter(agente => semPrefixoDoPlugin(agente.tipo) === nome)
    const ultima = execucoes.reduce<LensAgente | undefined>((maior, agente) => (maior === undefined || agente.inicio > maior.inicio ? agente : maior), undefined)
    const isRodando = execucoes.some(agente => agente.estado === 'rodando')
    const fim = ultima === undefined ? 0 : (fimDoAgente(ultima) ?? quadro.agora)
    const situacao = ultima === undefined ? 'nunca' : isRodando ? 'rodando' : ultima.estado === 'falhou' ? 'falhou' : 'chamado'
    const vezes = plural(execucoes.length, 'vez', 'vezes')
    const detalhe =
      situacao === 'nunca'
        ? 'ainda não chamado'
        : situacao === 'rodando'
          ? `rodando agora · ${vezes}`
          : situacao === 'falhou'
            ? `a última falhou · ${vezes}`
            : `chamado ${vezes} · há ${duracaoViva(Math.max(0, quadro.agora - fim))}`

    return { item, escopo, nome, ultima, situacao, detalhe, i } as const
  })
  const chamados = cartoes.filter(cartao => cartao.situacao !== 'nunca').length
  const titulo = {
    texto: 'Agentes disponíveis',
    cor: corDaAba(1),
    contagem: `· ${plural(instalados.length, 'instalado', 'instalados')} · ${plural(chamados, 'chamado', 'chamados')}`,
  }

  if (!temSvg(el, quadro)) {
    return secaoQueDobra(el, dobraDe(quadro, acoes), 'agentes:disponiveis', titulo, [
      ...cartoes.map(cartao => (
        <Text key={`disponivel-${cartao.escopo}-${cartao.nome}`} wrap="truncate-end">
          <Text color={COR_DO_ESCOPO[cartao.escopo]} bold>{'◆ '}</Text>
          <Text bold={cartao.situacao !== 'nunca'} dimColor={cartao.situacao === 'nunca'}>{cartao.nome}</Text>
          <Text color={COR_DO_ESCOPO[cartao.escopo]}>{`  ${NOME_DO_ESCOPO[cartao.escopo]}`}</Text>
          <Text dimColor>{` · ${cartao.detalhe}`}</Text>
        </Text>
      )),
    ])
  }

  const linhas = Math.max(1, Math.round(ALTURA_DO_DISPONIVEL / PIXELS_POR_LINHA))
  // Os cartões dividem a largura do painel (até três por fileira), entre 280
  // e 420 px: num painel largo, o nome e a descrição cabem sem corte.
  // Quantos cabem lado a lado com pelo menos 360 px cada (a 280 px, o nome
  // de um agente de plugin ou do projeto saía cortado).
  const porFileira = Math.max(1, Math.min(3, cartoes.length, Math.floor(((quadro.largura - 6) * PIXELS_POR_COLUNA * 0.94) / 360)))
  const util = (quadro.largura - 6) * PIXELS_POR_COLUNA * 0.94
  const larguraDoCartao = Math.round(limitar((util - (porFileira - 1) * PIXELS_POR_COLUNA) / porFileira, LARGURA_DO_DISPONIVEL, 420))
  const colunas = Math.max(4, Math.floor(larguraDoCartao / PIXELS_POR_COLUNA) - 3)

  return secaoQueDobra(el, dobraDe(quadro, acoes), 'agentes:disponiveis', titulo, [
    <Box key="disponiveis" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
      {cartoes.map(cartao => {
        const descricao = cartao.item.descricao ?? ''
        const ultima = cartao.ultima

        // Cada cartão na sua caixa: os botões invisíveis ficam presos a ela
        // (o clique cai certo). A descrição vai dentro do cartão.
        return (
          <Box key={`disponivel-${cartao.escopo}-${cartao.nome}`} flexShrink={0}>
            <el.Svg
              source={cartaoDoDisponivel({ ...cartao, ...(descricao === '' ? {} : { descricao }) }, cartao.i, larguraDoCartao)}
              alt={`${cartao.nome} · ${NOME_DO_ESCOPO[cartao.escopo]} · ${cartao.detalhe}`}
              width={larguraDoCartao}
              height={ALTURA_DO_DISPONIVEL}
              isInteractive
            />
            <Box position="absolute" top={0} left={0} flexDirection="column">
              {ultima !== undefined &&
                Array.from({ length: linhas }, (_, k) => (
                  <Button
                    key={k === 0 ? `disponivel-${cartao.nome}` : `disponivel-${cartao.nome}-${k}`}
                    label={ESPACO_DO_BOTAO.repeat(colunas)}
                    plain
                    onPress={() => acoes.abrir({ tipo: 'agente', id: ultima.id })}
                  />
                ))}
            </Box>
          </Box>
        )
      })}
    </Box>,
  ])
}

// O que aparece embaixo do nome de um agente: o tipo, ou, num agente de
// workflow, a fase em que ele roda.
const tipoDe = (agente: LensAgente): string =>
  agente.workflow === undefined ? agente.tipo : (agente.fase ?? 'workflow')

const NOMES_DOS_ESCOPOS: Record<EscopoDoAgente, string> = {
  global: 'global (~/.claude/agents)',
  projeto: 'do projeto (.claude/agents)',
  plugin: 'de plugin',
  embutido: 'embutido no Claude Code',
}

// Quem criou quem e quem mandou mensagem para quem, nos 12 agentes mais
// recentes: no Desktop um grafo, no terminal uma árvore de texto.
// `opcoes`: no detalhe de um turno, só os agentes dele, a conversa principal
// trabalhando enquanto o turno anda, e o clique que volta para o turno.
type OpcoesDaRede = {
  agentes?: readonly LensAgente[]
  isTrabalhando?: boolean
  volta?: string
  // Sem o título "Quem chamou quem" (o detalhe do turno já tem o dele).
  isSemTitulo?: boolean
  // O agente em destaque (o do detalhe aberto).
  destaque?: string
  // O zoom, quando quem chama escolhe (a Visão geral, a 150%).
  escala?: number
  // Só estes recados (a tela de uma rodada: os trocados dentro dela).
  mensagens?: readonly LensMensagem[]
}

const redeDosAgentes = (
  el: Elementos,
  dados: Dados,
  quadro: Quadro,
  acoes: Acoes,
  opcoes: OpcoesDaRede = {},
): RenderElement | null => {
  const { Box, Button, Text } = el
  const dobra = dobraDe(quadro, acoes)
  const tituloDoGrafo =
    opcoes.isSemTitulo === true
      ? null
      : secaoQueDobra(el, dobra, 'agentes:grafo', { texto: 'Quem chamou quem', cor: corDaAba(1) }, [])

  if (tituloDoGrafo !== null && dobra.fechadas.includes('agentes:grafo')) {
    return (
      <Box key="rede" flexDirection="column">
        {tituloDoGrafo}
      </Box>
    )
  }

  // Os mais recentes (no detalhe de um turno, todos os dele; ampliado, mais),
  // e sempre os que os criaram: sem o pai, o filho pareceria criado pela
  // conversa principal.
  const base = opcoes.agentes ?? dados.agentes
  const limite = opcoes.agentes !== undefined || dados.ui.isGrafoGrande === true ? 40 : 16
  const escolhidos = new Set(base.slice(-limite).map(agente => agente.id))
  for (const id of [...escolhidos]) {
    let pai = dados.agentes.find(agente => agente.id === id)?.pai

    while (pai !== undefined && !escolhidos.has(pai)) {
      escolhidos.add(pai)
      pai = dados.agentes.find(agente => agente.id === pai)?.pai
    }
  }
  const recentes = dados.agentes.filter(agente => escolhidos.has(agente.id))
  const deFora = base.length - base.filter(agente => escolhidos.has(agente.id)).length
  // O filtro do grafo (só na aba Agentes): quem não entra fica apagado.
  const filtro = opcoes.isSemTitulo === true ? 'todos' : (dados.ui.filtroDoGrafo ?? 'todos')
  const abrir = (id: string) =>
    acoes.abrir({ tipo: 'agente', id, ...(opcoes.volta === undefined ? {} : { volta: opcoes.volta }) })
  const ids = new Set(recentes.map(agente => agente.id))
  const paiDe = (agente: LensAgente): string =>
    agente.pai !== undefined && ids.has(agente.pai) ? agente.pai : 'principal'
  const isNoGrafo = (id: string) => id === 'principal' || ids.has(id)
  const nomeDe = (agente: LensAgente) => (agente.descricao === '' ? agente.tipo : agente.descricao)
  const nomeNaDica = (id: string) => {
    const agente = recentes.find(um => um.id === id)

    return id === 'principal' ? 'Principal' : agente === undefined ? `"${id}"` : curto(nomeDe(agente), 34)
  }
  // Os recados por par (de → para), entregues e não; os que não chegaram a
  // ninguém do grafo (um nome que nenhum agente carrega) ficam com quem mandou.
  const porPar = new Map<string, { de: string; para: string; lista: LensMensagem[] }>()
  const perdidosDe = new Map<string, LensMensagem[]>()
  const mensagens = opcoes.mensagens ?? dados.mensagens

  for (const mensagem of mensagens) {
    if (!isNoGrafo(mensagem.de)) {
      continue
    }

    // No grafo de um agente (o do anel laranja), só os recados que ele mandou
    // ou recebeu: os dos outros nós, que estão ali só para ligar a árvore,
    // enchiam o desenho de linhas que não são dele.
    if (opcoes.destaque !== undefined && mensagem.de !== opcoes.destaque && mensagem.para !== opcoes.destaque) {
      continue
    }

    if (!isNoGrafo(mensagem.para)) {
      if (mensagem.falha !== undefined) {
        perdidosDe.set(mensagem.de, [...(perdidosDe.get(mensagem.de) ?? []), mensagem])
      }

      continue
    }

    const chave = `${mensagem.de}→${mensagem.para}`
    const anterior = porPar.get(chave)
    porPar.set(chave, { de: mensagem.de, para: mensagem.para, lista: [...(anterior?.lista ?? []), mensagem] })
  }

  // A dica de um recado: quem mandou a quem, os últimos textos e por que os
  // que falharam não chegaram.
  const linhasDosRecados = (lista: readonly LensMensagem[]): LinhaDaDica[] =>
    lista.slice(-3).map(mensagem =>
      mensagem.falha === undefined
        ? { texto: `✉ "${mensagem.texto ?? '…'}"`, isFraco: true }
        : { texto: `✕ não chegou: ${mensagem.falha}`, isFraco: true },
    )
  // Os dois sentidos entre os mesmos dois agentes numa curva só (a de quem
  // mandou primeiro), com seta nas duas pontas e os recados somados.
  const pares = [...porPar.values()]
  const juntos = pares
    .filter(par => {
      const volta = porPar.get(`${par.para}→${par.de}`)

      return volta === undefined || (volta.lista[0]?.quando ?? 0) > (par.lista[0]?.quando ?? 0) || (volta.lista[0]?.quando === par.lista[0]?.quando && par.de < par.para)
    })
    .map(par => {
      const volta = porPar.get(`${par.para}→${par.de}`)

      return volta === undefined
        ? { ...par, isIdaEVolta: false }
        : { de: par.de, para: par.para, lista: [...par.lista, ...volta.lista].sort((a, b) => a.quando - b.quando), isIdaEVolta: true }
    })
  const arestas: ArestaDoGrafo[] = juntos.map(par => {
    const vezes = par.lista.filter(mensagem => mensagem.falha === undefined).length
    const falhas = par.lista.length - vezes

    return {
      de: par.de,
      para: par.para,
      vezes,
      falhas,
      isRecente: par.lista.some(mensagem => quadro.agora - mensagem.quando < FIO_CORRENDO_MS),
      ...(par.isIdaEVolta ? { isIdaEVolta: true } : {}),
      dica: [
        {
          antes: `${nomeNaDica(par.de)} ${par.isIdaEVolta ? '↔' : '→'} ${nomeNaDica(par.para)}`,
          texto: ` · ${[vezes > 0 ? plural(vezes, 'recado', 'recados') : '', falhas > 0 ? (falhas === 1 ? '1 não chegou' : `${falhas} não chegaram`) : ''].filter(parte => parte !== '').join(', ')}`,
          isFraco: true,
        },
        ...linhasDosRecados(par.lista),
      ],
    }
  })
  const isAninhado = recentes.some(agente => paiDe(agente) !== 'principal')

  if (!temSvg(el, quadro)) {
    // No terminal, a árvore só quando diz mais que a lista: agentes criados
    // por outros agentes, ou mensagens entre eles.
    if (!isAninhado && arestas.length === 0 && perdidosDe.size === 0 && opcoes.agentes === undefined) {
      return null
    }

    const linhas: RenderElement[] = []
    const descer = (pai: string, recuo: string) => {
      const filhos = recentes.filter(agente => paiDe(agente) === pai)
      filhos.forEach((agente, i) => {
        const isUltimo = i === filhos.length - 1
        const estado = estadoDoAgente(agente)
        linhas.push(
          <Text wrap="truncate-end">
            <Text dimColor>{`${recuo}${isUltimo ? '└─ ' : '├─ '}`}</Text>
            <Text color={estado.cor}>{`${estado.glifo} `}</Text>
            <Text bold>{agente.tipo}</Text>
            <Text dimColor>{` · ${nomeDe(agente)}`}</Text>
          </Text>,
        )
        descer(agente.id, `${recuo}${isUltimo ? '   ' : '│  '}`)
      })
    }
    descer('principal', '')
    const nomeDoNo = (id: string) => (id === 'principal' ? 'Principal' : (recentes.find(agente => agente.id === id)?.tipo ?? id))

    return (
      <Box key="rede" flexDirection="column">
        {tituloDoGrafo}
        <Text color={COR.marca} bold>✦ Principal</Text>
        {linhas}
        {arestas.map(aresta =>
          aresta.vezes === 0 ? (
            <Text color={COR.vermelho} wrap="truncate-end">{`✕ ${nomeDoNo(aresta.de)} → ${nomeDoNo(aresta.para)} · ${plural(aresta.falhas ?? 0, 'mensagem não chegou', 'mensagens não chegaram')}`}</Text>
          ) : (
            <Text dimColor wrap="truncate-end">
              {`✉ ${nomeDoNo(aresta.de)} → ${nomeDoNo(aresta.para)} · ${plural(aresta.vezes, 'mensagem', 'mensagens')}`}
              {(aresta.falhas ?? 0) > 0 && <Text color={COR.vermelho}>{` · ✕ ${aresta.falhas} não chegou`}</Text>}
            </Text>
          ),
        )}
        {[...perdidosDe].map(([de, lista]) => (
          <Text color={COR.vermelho} wrap="truncate-end">{`✕ ${nomeDoNo(de)} → ${[...new Set(lista.map(mensagem => `"${mensagem.para}"`))].join(', ')} · ${plural(lista.length, 'mensagem não chegou', 'mensagens não chegaram')}`}</Text>
        ))}
      </Box>
    )
  }

  // Os agentes de workflow ficam embaixo da fase deles: um nó por fase, ligado
  // à conversa principal, como o painel de tarefas do Claude Code agrupa.
  const idDaFase = (agente: LensAgente): string =>
    `fase:${agente.execucao ?? agente.workflow ?? ''}|${agente.fase ?? 'Sem fase'}`
  // No grafo de um agente (o do anel laranja), os que se ligam direto a ele:
  // quem o criou, os que ele criou e os que trocaram recado com ele. Os outros
  // nós, que só ligam a árvore até a conversa principal, ficam fracos.
  const alvo = opcoes.destaque === undefined ? undefined : recentes.find(agente => agente.id === opcoes.destaque)
  const diretos =
    alvo === undefined
      ? undefined
      : new Set<string>([
          alvo.id,
          paiDe(alvo),
          ...recentes.filter(agente => agente.pai === alvo.id).map(agente => agente.id),
          ...mensagens.flatMap(mensagem =>
            mensagem.de === alvo.id ? [mensagem.para] : mensagem.para === alvo.id ? [mensagem.de] : [],
          ),
        ])
  const isFora = (id: string) => diretos !== undefined && !diretos.has(id)
  const paiNoGrafo = (agente: LensAgente): string =>
    agente.workflow !== undefined && paiDe(agente) === 'principal' ? idDaFase(agente) : paiDe(agente)
  const fases: NoDoGrafo[] = []

  for (const agente of recentes) {
    if (agente.workflow === undefined || paiNoGrafo(agente) !== idDaFase(agente)) {
      continue
    }

    const id = idDaFase(agente)

    if (fases.some(fase => fase.id === id)) {
      continue
    }

    // Só os que ficam embaixo dela no grafo (um agente criado por outro fica
    // embaixo do pai).
    const daFase = recentes.filter(um => paiNoGrafo(um) === id)
    const rodando = daFase.filter(um => um.estado === 'rodando').length
    const prontos = daFase.length - rodando
    const estado = rodando > 0 ? 'rodando' : daFase.some(um => um.estado === 'falhou') ? 'falhou' : 'ok'
    // No filtro, a fase fica acesa se algum agente dela entra.
    const procurado = filtro === 'rodando' ? 'rodando' : 'falhou'
    fases.push({
      id,
      pai: 'principal',
      rotulo: agente.fase ?? 'Sem fase',
      tipo: `${prontos}/${daFase.length} · ${agente.workflow}`,
      estado,
      escopo: 'embutido',
      isFase: true,
      isApagado: filtro !== 'todos' && !daFase.some(um => um.estado === procurado),
      titulo: agente.fase ?? 'Sem fase',
      dica: `fase do workflow ${agente.workflow}`,
    })
  }

  const dosAgentes: NoDoGrafo[] = recentes.map(agente => {
    const fim = fimDoAgente(agente)
    const escopo = escopoDo(agente, dados.inventario.itens)
    const tempo = tempoDoAgente(agente, quadro.agora)
    const rodadas = rodadasDoAgente(agente)
    const perdidos = perdidosDe.get(agente.id) ?? []
    const pai = paiNoGrafo(agente)
    const quemCriou = pai.startsWith('fase:') ? `O workflow ${agente.workflow ?? ''}` : nomeNaDica(pai)
    // O que passou pelo fio: a tarefa na ida e, no fim, o resultado.
    const volta: LinhaDaDica =
      agente.estado === 'rodando'
        ? { texto: '… trabalhando, ainda sem resultado', isFraco: true }
        : agente.estado === 'falhou'
          ? { texto: `✕ falhou${agente.resultado === undefined ? '' : `: ${agente.resultado}`}`, isFraco: true }
          : { texto: `✓ resultado: ${agente.resultado ?? '(sem texto)'}`, isFraco: true }

    return {
      id: agente.id,
      pai: paiNoGrafo(agente),
      rotulo: nomeDe(agente),
      // Só o tipo (ou a fase do workflow) e a origem, quando não é embutido: o
      // custo muda a cada resposta, e o desenho que muda é recriado no app
      // (pisca). Ele fica na dica e no cartão.
      tipo: escopo === 'embutido' ? tipoDe(agente) : `${tipoDe(agente)} · ${NOME_DO_ESCOPO[escopo]}`,
      estado: agente.estado === 'concluido' ? 'ok' : agente.estado,
      escopo,
      isApagado: (filtro !== 'todos' && agente.estado !== (filtro === 'rodando' ? 'rodando' : 'falhou')) || isFora(agente.id),
      ...(opcoes.destaque === agente.id ? { isDestaque: true } : {}),
      ...(fim !== undefined && quadro.agora - fim < FIO_CORRENDO_MS
        ? { corre: 'volta' as const }
        : quadro.agora - agente.inicio < FIO_CORRENDO_MS
          ? { corre: 'ida' as const }
          : {}),
      dicaDoFio: [
        { texto: `${quemCriou} criou ${curto(nomeDe(agente), 34)}`, isNegrito: true },
        { texto: `↓ tarefa: ${agente.tarefa ?? nomeDe(agente)}`, isFraco: true },
        volta,
      ],
      ...(perdidos.length > 0 ? { perdidos: perdidos.length } : {}),
      titulo: nomeDe(agente),
      dica: [
        agente.workflow === undefined ? agente.tipo : `workflow ${agente.workflow}`,
        agente.workflow === undefined ? NOMES_DOS_ESCOPOS[escopo] : undefined,
        agente.custo === undefined ? undefined : dolar(agente.custo),
        agente.estado === 'rodando' ? `rodando há ${tempo}` : `${agente.estado === 'falhou' ? 'falhou' : 'concluído'} · ${tempo}`,
        rodadas > 1 ? `${rodadas} rodadas` : undefined,
        agente.isFundo === true ? 'em segundo plano' : undefined,
        perdidos.length > 0
          ? `✕ ${plural(perdidos.length, 'recado não chegou', 'recados não chegaram')} (${[...new Set(perdidos.map(mensagem => `"${mensagem.para}"`))].join(', ')})`
          : undefined,
      ]
        .filter((parte): parte is string => parte !== undefined)
        .join(' · '),
    }
  })
  // As fases antes dos agentes: na árvore, cada fase fica no meio dos dela.
  const nos = [...fases, ...dosAgentes]
  // Ampliado (o botão ao lado do título), o grafo toma a largura e a altura
  // do painel; o zoom aumenta tudo, texto e robôs juntos. No detalhe de um
  // turno, fica no tamanho normal.
  const isGrande = dados.ui.isGrafoGrande === true && opcoes.isSemTitulo !== true
  const escolhida = opcoes.escala ?? (opcoes.isSemTitulo === true ? ESCALA_DO_GRAFO : escalaDoGrafo(dados.ui))
  // A largura inteira do painel: o desenho se centra nela.
  const largura = Math.round(Math.min(2400, (quadro.largura - 1) * PIXELS_POR_COLUNA))
  const alturaDoPainel = Math.min(1600, Math.max(520, ((quadro.linhas ?? 40) - 10) * PIXELS_POR_LINHA))
  const desenho = grafoDosAgentes(
    nos,
    arestas,
    {
      isTrabalhando: opcoes.isTrabalhando ?? dados.rodadas.some(rodada => rodada.duracaoMs === undefined),
      dica: plural(dados.agentes.length, 'agente criado nesta sessão', 'agentes criados nesta sessão'),
      ...(isFora('principal') ? { isApagado: true } : {}),
    },
    largura,
    { escala: escolhida, ...(isGrande ? { altura: alturaDoPainel } : {}), ...(opcoes.isSemTitulo === true && opcoes.escala === undefined ? { isAjustavel: true } : {}) },
  )
  const escala = desenho.escala
  const temFalha = arestas.some(aresta => (aresta.falhas ?? 0) > 0) || perdidosDe.size > 0

  return (
    <Box key="rede" flexDirection="column">
      {tituloDoGrafo}
      {/* Os controles do grafo numa fileira própria, em três grupos: o
          tamanho, o zoom (− 100% +) e o filtro (o escolhido num selo). */}
      {opcoes.isSemTitulo !== true && (
        <Box key="grafo-controles" flexDirection="row" flexWrap="wrap" columnGap={4}>
          <Box key="grafo-tamanho-caixa" flexShrink={0}>
            <Button
              key="grafo-tamanho"
              label={isGrande ? '⤡ Reduzir' : '⤢ Ampliar'}
              {...comMoldura(quadro)}
              hover={{ color: corDaAba(1), bold: true }}
              onPress={acoes.grafoGrande}
            />
          </Box>
          <Box key="grafo-zoom" flexDirection="row" columnGap={1} flexShrink={0}>
            <Text dimColor>Zoom</Text>
            <Button
              key="grafo-menos"
              label="−"
              {...comMoldura(quadro)}
              dimColor={escolhida <= ESCALAS_DO_GRAFO[0]}
              hover={{ color: corDaAba(1), bold: true }}
              onPress={() => acoes.escalaDoGrafo(-1)}
            />
            <Text dimColor>{`${Math.round(escolhida * 100)}%`}</Text>
            <Button
              key="grafo-mais"
              label="+"
              {...comMoldura(quadro)}
              dimColor={escolhida >= (ESCALAS_DO_GRAFO.at(-1) ?? 2)}
              hover={{ color: corDaAba(1), bold: true }}
              onPress={() => acoes.escalaDoGrafo(1)}
            />
          </Box>
          <Box key="grafo-filtros" flexDirection="row" columnGap={1} flexShrink={0}>
            <Text dimColor>Mostrar</Text>
            {(['todos', 'rodando', 'falhou'] as const).map(opcao => {
              const rotulo = opcao === 'todos' ? 'Todos' : opcao === 'rodando' ? 'Rodando' : 'Com falha'

              return opcao === filtro ? (
                <Box key={`grafo-filtro-caixa-${opcao}`} flexShrink={0}>
                  {selo(el, rotulo, 'ciano')}
                </Box>
              ) : (
                <Box key={`grafo-filtro-caixa-${opcao}`} flexShrink={0}>
                  <Button
                    key={`grafo-filtro-${opcao}`}
                    label={rotulo}
                    {...comMoldura(quadro)}
                    hover={{ color: corDaAba(1), bold: true }}
                    onPress={() => acoes.filtroDoGrafo(opcao)}
                  />
                </Box>
              )
            })}
          </Box>
        </Box>
      )}
      <Box key="grafo">
        <el.Svg
          source={desenho.source}
          alt={`A conversa principal e os agentes que ela criou: ${nos.map(no => `${no.rotulo} (${no.tipo})`).join(', ')}`}
          width={largura}
          height={desenho.height}
          isInteractive
        />
        {desenho.pontos.map(ponto => {
          // Um botão invisível só sobre o robô (não sobre o nome): o resto do
          // desenho fica livre para o mouse nas linhas e nos recados, que têm
          // as dicas do próprio SVG. O robô tem uns 36 px de lado.
          const no = nos.find(um => um.id === ponto.id)
          const meio = 18 * escala
          const de = ponto.x - meio
          const ate = ponto.x + meio
          const primeira = Math.max(0, Math.floor((ponto.y - meio) / PIXELS_POR_LINHA))
          const ultima = Math.max(primeira, Math.floor((ponto.y + meio * 0.8) / PIXELS_POR_LINHA))

          // A dica do agente é do próprio app (a do SVG não aparece sob o
          // botão): abre na hora, embaixo do nó, em qualquer ponto da área clicável.
          const colunas = Math.max(3, Math.round((ate - de) / PIXELS_POR_COLUNA))
          const esquerda = Math.max(0, Math.round(de / PIXELS_POR_COLUNA))
          const texto = no === undefined ? '' : `${no.titulo} · ${no.dica}`
          const larguraDaDica = Math.min([...texto].length + 2, Math.max(12, quadro.largura - 2))
          const deslocamento = Math.min(0, quadro.largura - 2 - esquerda - larguraDaDica)

          return (
            <Box
              key={`no-${ponto.id}`}
              position="absolute"
              flexDirection="column"
              top={primeira}
              left={esquerda}
              hover={{ scope: escopoDoAgente(ponto.id) }}
            >
              {/* Um anel verde em volta do nó, aceso com o mouse nele ou na
                  linha dele na linha do tempo (o mesmo grupo de hover). */}
              <Box
                position="absolute"
                top={0}
                left={0}
                width={colunas}
                height={ultima - primeira + 1}
                borderStyle="round"
                borderColor={COR.verde}
                display="none"
                hover={{ display: 'flex', scope: escopoDoAgente(ponto.id) }}
              />
              {Array.from({ length: ultima - primeira + 1 }, (_, i) => (
                <Button
                  key={i === 0 ? `grafo-agente-${ponto.id}` : `grafo-agente-${ponto.id}-${i}`}
                  label={ESPACO_DO_BOTAO.repeat(Math.max(2, colunas - 2))}
                  plain
                  onPress={() => abrir(ponto.id)}
                />
              ))}
              {texto !== '' && (
                <Box
                  position="absolute"
                  top={ultima - primeira + 1}
                  left={deslocamento}
                  width={larguraDaDica}
                  display="none"
                  hover={{ display: 'flex' }}
                  backgroundColor={FUNDO_DA_DICA}
                  paddingX={1}
                >
                  <Text color={TINTA_DA_DICA} wrap="truncate-end">
                    {texto}
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
      {/* A legenda separada do desenho por uma linha fina. */}
      <Box key="grafo-separador" marginTop={1}>
        {/* Um fio desenhado, da largura exata do desenho (o "─" do app é mais
            largo que uma coluna, e a régua de texto passava da borda). */}
        <el.Svg
          source={`<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(largura * 0.94)}" height="6" viewBox="0 0 ${Math.round(largura * 0.94)} 6"><line x1="0" y1="3" x2="${Math.round(largura * 0.94)}" y2="3" stroke="rgba(128,128,128,.35)" stroke-width="1"/></svg>`}
          alt="—"
          width={Math.round(largura * 0.94)}
          height={6}
        />
      </Box>
      {/* A legenda numa linha de símbolos (o fio, o estado e a origem) e, à
          parte, o que o mouse faz. */}
      <Text dimColor wrap="wrap">
        <Text bold>↓</Text>
        {' tarefa  '}
        <Text bold>…</Text>
        {' trabalhando  '}
        <Text color={ESTADOS.ok.cor}>✓</Text>
        {' voltou  '}
        <Text color={COR.roxo}>{'┄✉'}</Text>
        {' recado'}
        {temFalha && <Text color={COR.vermelho}>{'  ✕'}</Text>}
        {temFalha && ' recado perdido'}
        {'   '}
        <Text color={ESTADOS.rodando.cor}>●</Text>
        {' rodando  '}
        <Text color={ESTADOS.ok.cor}>●</Text>
        {' concluído  '}
        <Text color={ESTADOS.falhou.cor}>●</Text>
        {' falhou   '}
        {/* De onde vem a definição de cada agente: a cor da borda e do tipo. */}
        {(['global', 'projeto', 'plugin', 'embutido'] as const).map(escopo => (
          <Text key={`legenda-${escopo}`}>
            <Text color={COR_DO_ESCOPO[escopo]} bold>{'◆ '}</Text>
            <Text>{`${NOME_DO_ESCOPO[escopo]}  `}</Text>
          </Text>
        ))}
      </Text>
      {!quadro.isTerminal && (
        <Text dimColor wrap="wrap">
          Passe o mouse numa linha para ver o que passou por ela; clique num agente para abrir.
        </Text>
      )}
      {deFora > 0 && (
        <Text dimColor wrap="wrap">
          {`+ ${plural(deFora, 'agente mais antigo fora do grafo', 'agentes mais antigos fora do grafo')}${
            dados.ui.isGrafoGrande === true || opcoes.agentes !== undefined ? '' : ' (o Ampliar mostra até 40)'
          }`}
        </Text>
      )}
    </Box>
  )
}

// Quantas colunas tem o nome de cada agente na linha do tempo, e quantos
// pixels tem uma coluna e uma linha no Desktop (para pôr um botão invisível
// em cima de um nó do grafo ou de uma pílula).
const COLUNAS_DO_NOME = 28
// Os passos do zoom do grafo. Sem um escolhido, 150% (o tamanho do grafo em
// todo lugar: a Visão geral, o detalhe de um turno e o de um agente).
export const ESCALAS_DO_GRAFO = [0.8, 1, 1.25, 1.5, 2] as const
export const ESCALA_DO_GRAFO = 1.5
// Ampliado (o grafo como a vista inteira) e sem zoom escolhido, 200%.
export const escalaDoGrafo = (ui: LensUi): number => ui.escalaDoGrafo ?? (ui.isGrafoGrande === true ? 2 : ESCALA_DO_GRAFO)

// O rótulo dos botões invisíveis: o espaço de figura (U+2007), da largura de
// um dígito (~7 px), como uma coluna. O espaço não separável (U+00A0) tem ~3 px
// na fonte proporcional do app, e o botão saía com menos da metade da largura.
const ESPACO_DO_BOTAO = '\u2007'

// As dicas do app (as que abrem no hover de um Box) são escuras nos dois
// temas, como as dicas do sistema.
const FUNDO_DA_DICA = '#2b2a27'
const TINTA_DA_DICA = '#ececec'
// O fundo de uma linha acesa pelo mouse (a da linha do tempo), discreto nos dois temas.
const FUNDO_DO_DESTAQUE = 'rgba(128,128,128,0.16)'

// O grupo de hover de um agente: a linha dele na linha do tempo e o nó dele no
// grafo acendem juntos.
const escopoDoAgente = (id: string): string => `ag-${id}`.slice(0, 64)

// No Desktop, a linha do tempo dos 12 subagentes mais recentes: quem rodou em
// paralelo, quem demorou, quem falhou.
const graficoDosAgentes = (
  el: Elementos & { Svg: ElementConstructor<SvgProps> },
  agentes: readonly LensAgente[],
  quadro: Quadro,
  acoes: Acoes,
  // Os turnos da conversa principal (quando ela pensou) e quando a sessão começou.
  rodadas: readonly LensRodada[] = [],
  inicioDaSessao?: number,
): RenderElement => {
  const { Box, Button, Svg, Text } = el
  const recentes = agentes.slice(-12)
  const nomeDe = (agente: LensAgente) => (agente.descricao === '' ? agente.tipo : agente.descricao)
  const fimDaRodada = (rodada: LensRodada) =>
    rodada.duracaoMs === undefined ? quadro.agora : rodada.inicio + rodada.duracaoMs
  const doPrimeiro = Math.min(...recentes.map(agente => agente.inicio))
  // Os turnos da conversa principal que cruzam o tempo dos agentes: o que
  // começou antes do primeiro agente puxa o começo da régua (a conversa
  // pensou e depois criou o agente).
  const doFimDosAgentes = Math.max(...recentes.map(agente => fimDoAgente(agente) ?? quadro.agora))
  const pensou = rodadas.filter(rodada => fimDaRodada(rodada) >= doPrimeiro && rodada.inicio <= doFimDosAgentes)
  const t0 = Math.min(doPrimeiro, ...pensou.map(rodada => rodada.inicio))
  // Quem ainda roda vai até "agora" arredondado num passo que cresce com a
  // régua: as barras (imagens) só mudam a cada passo, e não a cada desenho.
  const passo = Math.max(5000, Math.round((quadro.agora - t0) / 60))
  const agoraDaRegua = t0 + Math.ceil((quadro.agora - t0) / passo) * passo
  const fimDe = (agente: LensAgente) => fimDoAgente(agente) ?? agoraDaRegua
  // Uma linha por rodada: o mesmo agente acordado por um recado aparece uma
  // vez por rodada ("Revisar · rodada 2"), cada uma com a barra no horário
  // dela; o nome abre a rodada. Com uma rodada só, a linha do agente.
  const linhas = recentes.flatMap(agente => {
    const trechos = trechosDoAgente(agente, fimDe(agente))
    const isEmRodadas = rodadasDoAgente(agente) > 1 && trechos.length > 1

    return trechos.map((trecho, i) => ({
      agente,
      trecho,
      // A última linha de um agente é a de agora (rodando ou a última rodada).
      isAtual: i === trechos.length - 1,
      ...(isEmRodadas ? { rodada: trecho.n } : {}),
      nome: isEmRodadas ? `${nomeDe(agente)} · rodada ${trecho.n}` : nomeDe(agente),
    }))
  })
  // A coluna dos nomes cresce até o nome mais longo, sem passar de 40% do
  // painel: num painel largo, o nome aparece inteiro.
  const colunasDoNome = Math.round(
    limitar(Math.max(...linhas.map(linha => [...linha.nome].length)) + 3, COLUNAS_DO_NOME, Math.max(COLUNAS_DO_NOME, quadro.largura * 0.4)),
  )
  // Com folga à direita: do tamanho exato, o "pensou 55s" saía da borda.
  const largura = Math.round(Math.min(1600, (quadro.largura - 4) * PIXELS_POR_COLUNA))
  const barra = Math.max(120, largura - colunasDoNome * PIXELS_POR_COLUNA)
  // Quanto uma linha trabalhou: o tempo da rodada dela (a de agora, vivo).
  const tempoDe = (linha: (typeof linhas)[number]) =>
    linha.agente.estado === 'rodando' && linha.isAtual
      ? duracaoViva(quadro.agora - linha.trecho.inicio)
      : duracao(linha.trecho.fim - linha.trecho.inicio)
  const t1 = Math.max(...recentes.map(fimDe), ...pensou.map(rodada => Math.min(agoraDaRegua, fimDaRodada(rodada))))
  // Quanto a conversa principal pensou nesse tempo, somado.
  const pensouMs = pensou.reduce(
    (soma, rodada) => soma + Math.max(0, Math.min(t1, fimDaRodada(rodada)) - Math.max(t0, rodada.inicio)),
    0,
  )

  // Ao lado do título, quando a sessão começou (ou, sem essa leitura, a régua).
  const comeco = inicioDaSessao === undefined ? `desde ${diaEHora(t0)}` : `sessão iniciada em ${diaEHora(inicioDaSessao)}`

  // Uma linha por agente: o nome, que abre o detalhe dele, e a barra. No alto,
  // a conversa principal, na cor do cérebro: quando ela pensou.
  return secaoQueDobra(el, dobraDe(quadro, acoes), 'agentes:tempo', { texto: 'Linha do tempo', cor: corDaAba(1), contagem: `· ${comeco}` }, [
      pensou.length > 0 && (
        <Box key="tempo-principal" flexDirection="row">
          <Box width={colunasDoNome} flexShrink={0}>
            <Text color={COR.marca} bold wrap="truncate-end">✦ Principal</Text>
          </Box>
          <Svg
            source={barraDoPrincipal(
              pensou.map(rodada => ({
                inicio: Math.max(t0, rodada.inicio),
                fim: Math.min(agoraDaRegua, fimDaRodada(rodada)),
                isAndando: rodada.duracaoMs === undefined,
              })),
              t0,
              t1,
              barra,
              `pensou ${duracao(pensouMs)}`,
            )}
            alt={`Principal: pensou ${duracao(pensouMs)} em ${plural(pensou.length, 'turno', 'turnos')}`}
            width={barra}
            height={ALTURA_DA_FAIXA}
          />
        </Box>
      ),
      ...linhas.map(linha => {
        const { agente, nome, trecho } = linha
        const isCortado = [...nome].length > colunasDoNome - 2
        const chave = linha.rodada === undefined ? `tempo-agente-${agente.id}` : `tempo-rodada-${agente.id}-${linha.rodada}`

        // A linha acende junto com o nó do agente no grafo (o mesmo grupo de
        // hover): passar o mouse num mostra o outro.
        return (
        <Box key={linha.rodada === undefined ? `tempo-${agente.id}` : `tempo-${agente.id}-${linha.rodada}`} flexDirection="row" hover={{ scope: escopoDoAgente(agente.id), backgroundColor: FUNDO_DO_DESTAQUE }}>
          <Box width={colunasDoNome} flexShrink={0}>
            <Button
              key={chave}
              label={curto(nome, colunasDoNome - 2)}
              plain
              hover={{ underline: true, color: corDaAba(1) }}
              onPress={() =>
                linha.rodada === undefined ? acoes.abrir({ tipo: 'agente', id: agente.id }) : abrirRodada(acoes, agente, linha.rodada, undefined)
              }
            />
            {/* O nome cortado: inteiro numa dica, logo abaixo, com o mouse na linha. */}
            {isCortado && (
              <Box
                position="absolute"
                top={1}
                left={0}
                display="none"
                hover={{ display: 'flex' }}
                backgroundColor={FUNDO_DA_DICA}
                paddingX={1}
              >
                <Text color={TINTA_DA_DICA}>{nome}</Text>
              </Box>
            )}
          </Box>
          {/* A barra da rodada desta linha, no horário dela. */}
          <Svg
            source={barraDoAgente(
              {
                trechos: [{ ...trecho, ...(linha.rodada === undefined ? {} : { dica: `rodada ${linha.rodada} · ${duracao(trecho.fim - trecho.inicio)}` }) }],
                tempo: tempoDe(linha),
              },
              t0,
              t1,
              barra,
            )}
            alt={`${agente.tipo}${linha.rodada === undefined ? '' : ` · rodada ${linha.rodada}`}: ${tempoDe(linha)}`}
            width={barra}
            height={ALTURA_DA_FAIXA}
          />
        </Box>
        )
      }),
      <Box key="tempo-regua" flexDirection="row">
        <Box width={colunasDoNome} flexShrink={0} />
        <Svg
          source={eixoDoTempo(t0, t1, Math.max(quadro.agora, t1), barra, duracaoViva)}
          alt="A régua do tempo"
          width={barra}
          height={14}
        />
      </Box>,
      <Text key="tempo-dica" dimColor>
        {linhas.some(linha => linha.rodada !== undefined)
          ? 'Clique no nome para ver os detalhes do agente (ou da rodada) · com o mouse no nome, o agente acende no grafo'
          : 'Clique no nome para ver os detalhes do agente · com o mouse no nome, o agente acende no grafo'}
      </Text>,
  ])
}

// As fases de um workflow, na ordem em que os agentes delas apareceram.
export const fasesDoWorkflow = (agentes: readonly LensAgente[]): { fase: string; agentes: LensAgente[] }[] => {
  const fases: { fase: string; agentes: LensAgente[] }[] = []

  for (const agente of agentes) {
    const nome = agente.fase ?? 'Sem fase'
    const achada = fases.find(uma => uma.fase === nome)

    if (achada === undefined) {
      fases.push({ fase: nome, agentes: [agente] })
    } else {
      achada.agentes.push(agente)
    }
  }

  return fases
}

// As execuções de workflow da sessão (os agentes de cada uma), da mais recente
// à mais antiga. Uma por execução: o mesmo workflow rodado de novo é outra.
const workflowsDe = (
  agentes: readonly LensAgente[],
): { execucao: string; nome: string; agentes: LensAgente[] }[] => {
  const lista: { execucao: string; nome: string; agentes: LensAgente[] }[] = []

  for (const agente of agentes) {
    if (agente.workflow === undefined) {
      continue
    }

    const execucao = agente.execucao ?? agente.workflow
    const achado = lista.find(um => um.execucao === execucao)

    if (achado === undefined) {
      lista.push({ execucao, nome: agente.workflow, agentes: [agente] })
    } else {
      achado.agentes.push(agente)
    }
  }

  // Os que rodam primeiro; depois, o que começou por último.
  const isRodando = (um: (typeof lista)[number]) => um.agentes.some(agente => agente.estado === 'rodando')
  const ultimo = (um: (typeof lista)[number]) => Math.max(...um.agentes.map(agente => agente.inicio))

  return lista.sort((a, b) => Number(isRodando(b)) - Number(isRodando(a)) || ultimo(b) - ultimo(a))
}

// Um workflow num cartão, como o painel de tarefas do Claude Code: as fases,
// cada uma com quantos agentes terminaram, quadradinhos na cor de cada um, e
// uma linha por agente (o rótulo abre o detalhe).
const cartaoDoWorkflow = (
  el: Elementos,
  execucao: string,
  nome: string,
  agentes: readonly LensAgente[],
  quadro: Quadro,
  acoes: Acoes,
): RenderElement => {
  const { Box, Text } = el
  const rodando = agentes.filter(agente => agente.estado === 'rodando').length
  const inicio = Math.min(...agentes.map(agente => agente.inicio))
  const fim = Math.max(...agentes.map(agente => fimDoAgente(agente) ?? quadro.agora))
  const tempo = rodando > 0 ? duracaoViva(quadro.agora - inicio) : duracao(fim - inicio)
  const somaDeTokens = agentes.reduce((soma, agente) => soma + (agente.tokens ?? 0), 0)
  const cabecalho = [
    plural(agentes.length, 'agente', 'agentes'),
    rodando > 0 ? `${rodando} rodando` : undefined,
    somaDeTokens > 0 ? `${tokens(somaDeTokens)} tokens` : undefined,
    tempo,
  ].filter((parte): parte is string => parte !== undefined)

  return cartao(el, `workflow-${execucao}`, 'subtle', quadro.isCompacto, [
    <Text wrap="truncate-end">
      <Text color={corDaAba(1)}>{'◇ '}</Text>
      <Text bold>{`Workflow ${nome}`}</Text>
      <Text dimColor>{` · ${cabecalho.join(' · ')}`}</Text>
    </Text>,
    ...fasesDoWorkflow(agentes).map(({ fase, agentes: daFase }) => {
      const prontos = daFase.filter(agente => agente.estado !== 'rodando').length

      return (
        <Box key={`fase-${execucao}-${fase}`} flexDirection="column">
          <Text wrap="truncate-end">
            <Text bold color={corDaAba(1)}>{fase}</Text>
            <Text dimColor>{`  ${prontos}/${daFase.length}  `}</Text>
            {daFase.map(agente => (
              <Text color={estadoDoAgente(agente).cor}>{agente.estado === 'rodando' ? '▪' : '■'}</Text>
            ))}
          </Text>
          {/* Na versão compacta, só o resumo de cada fase. */}
          {!quadro.isCompacto && daFase.map(agente => {
            const estado = estadoDoAgente(agente)
            const partes = [
              agente.modelo === undefined ? undefined : nomeDoModelo(agente.modelo),
              agente.tokens === undefined ? undefined : `${tokens(agente.tokens)} tokens`,
              agente.custo === undefined ? undefined : dolar(agente.custo),
              agente.estado === 'rodando'
                ? duracaoViva(quadro.agora - agente.inicio)
                : agente.duracaoMs === undefined
                  ? undefined
                  : duracao(agente.duracaoMs),
              agente.estado === 'falhou' ? 'falhou' : undefined,
            ].filter((parte): parte is string => parte !== undefined)

            return (
              <Box key={`fase-agente-${agente.id}`} flexDirection="row" columnGap={1}>
                <Text>{'  '}</Text>
                {glifo(el, estado)}
                {titulo(el, `ver-workflow-agente-${agente.id}`, agente.rotulo ?? agente.descricao, corDaAba(1), () =>
                  acoes.abrir({ tipo: 'agente', id: agente.id }),
                )}
                <Box flexGrow={1} flexShrink={1} minWidth={0}>
                  <Text dimColor wrap="truncate-end">{partes.length > 0 ? ` ${partes.join(' · ')}` : ''}</Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      )
    }),
  ])
}

const abaAgentes = (el: Elementos, dados: Dados, quadro: Quadro, acoes: Acoes): RenderElement => {
  const { Box, Text } = el
  // Os agentes de workflow ficam nos cartões dos workflows, agrupados por fase;
  // as listas de rodando e concluídos ficam com os outros.
  const soltos = dados.agentes.filter(agente => agente.workflow === undefined)
  const workflows = workflowsDe(dados.agentes)
  const rodando = soltos.filter(agente => agente.estado === 'rodando')
  const prontos = soltos.filter(agente => agente.estado !== 'rodando').reverse()
  const todosRodando = dados.agentes.filter(agente => agente.estado === 'rodando').length
  const falhas = dados.agentes.filter(agente => agente.estado === 'falhou').length
  const ok = dados.agentes.length - todosRodando - falhas
  const maximo = quadro.isCompacto ? 2 : 40
  const cor = corDaAba(1)
  // O grafo ampliado é uma vista só dele: o resto da aba some até o Reduzir.
  const isAmpliado =
    dados.ui.isGrafoGrande === true && !quadro.isCompacto && temSvg(el, quadro) && dados.agentes.length > 0

  return (
    <Box key="agentes" flexDirection="column" rowGap={respiro(quadro)}>
      {!quadro.isCompacto &&
        contagens(el, [
          { n: todosRodando, texto: `● ${todosRodando} rodando`, tom: 'azul' },
          { n: ok, texto: `✓ ${ok} ok`, tom: 'verde' },
          { n: falhas, texto: `✗ ${plural(falhas, 'falha', 'falhas')}`, tom: 'vermelho' },
        ])}
      {/* Os instalados no alto só enquanto nenhum agente rodou; depois, no fim
          (a Visão geral já os mostra, e aqui o que importa é o que rodou). */}
      {!isAmpliado && dados.agentes.length === 0 && agentesDisponiveis(el, dados, quadro, acoes)}
      {!quadro.isCompacto && dados.agentes.length > 0 && redeDosAgentes(el, dados, quadro, acoes)}
      {isAmpliado && (
        <Text dimColor wrap="wrap">Grafo ampliado: a linha do tempo e os cartões dos agentes voltam no Reduzir.</Text>
      )}
      {!isAmpliado &&
        temSvg(el, quadro) &&
        dados.agentes.length > 0 &&
        graficoDosAgentes(el, dados.agentes, quadro, acoes, dados.rodadas, dados.inicioDaSessao)}
      {!isAmpliado && workflows.length > 0 && (
        secaoQueDobra(
          el,
          dobraDe(quadro, acoes),
          'agentes:workflows',
          { texto: 'Workflows', cor, contagem: `· ${workflows.length}` },
          [
            ...workflows
              .slice(0, quadro.isCompacto ? 1 : 6)
              .map(um => cartaoDoWorkflow(el, um.execucao, um.nome, um.agentes, quadro, acoes)),
            workflows.length > (quadro.isCompacto ? 1 : 6) && (
              <Text dimColor>{`+ ${plural(workflows.length - (quadro.isCompacto ? 1 : 6), 'workflow mais antigo', 'workflows mais antigos')}`}</Text>
            ),
          ],
          respiro(quadro),
        )
      )}
      {!isAmpliado && (soltos.length > 0 || workflows.length === 0) && (
        <Box key="listas" flexDirection="column" rowGap={respiro(quadro)}>
          {secaoQueDobra(el, dobraDe(quadro, acoes), 'agentes:rodando', { texto: 'Rodando', cor: ESTADOS.rodando.cor, contagem: `· ${rodando.length}` }, [
            rodando.length === 0 && <Text dimColor>Nenhum subagente rodando.</Text>,
            <Box key="rodando-lista" flexDirection="column" rowGap={respiro(quadro)}>
              {rodando.slice(0, maximo).map(agente => linhaDoAgente(el, agente, quadro, acoes, { escopo: escopoDo(agente, dados.inventario.itens), rodadas: rodadasVistas(agente, undefined, dados.mensagens, quadro.agora) }))}
            </Box>,
          ])}
          {secaoQueDobra(el, dobraDe(quadro, acoes), 'agentes:concluidos', { texto: 'Concluídos', cor, contagem: `· ${prontos.length}` }, [
            prontos.length === 0 && <Text dimColor>Nenhum subagente concluído.</Text>,
            <Box key="concluidos-lista" flexDirection="column" rowGap={respiro(quadro)}>
              {prontos.slice(0, maximo).map(agente => linhaDoAgente(el, agente, quadro, acoes, { escopo: escopoDo(agente, dados.inventario.itens), rodadas: rodadasVistas(agente, undefined, dados.mensagens, quadro.agora) }))}
            </Box>,
          ])}
        </Box>
      )}
      {!isAmpliado && dados.agentes.length > 0 && agentesDisponiveis(el, dados, quadro, acoes)}
    </Box>
  )
}

const variacao = (contexto: LensContexto): string => {
  const ultimo = contexto.historico.at(-1)

  if (ultimo === undefined) {
    return 'nenhum turno medido'
  }

  const delta = variacaoDoUltimoTurno(contexto)

  if (delta === undefined) {
    return 'primeiro turno medido'
  }

  return `${delta >= 0 ? '▲ +' : '▼ −'}${tokens(delta)} no último turno`
}

// Uma barra de calor: as células cheias passam de verde a âmbar e a vermelho
// conforme avançam (50% e 80%); as vazias ficam apagadas.
const barraDeCalor = (
  el: Elementos,
  percentual: number,
  largura: number,
): RenderElement => {
  const { Text } = el
  const cheias = limitar(Math.round((percentual / 100) * largura), 0, largura)
  const trechos: { cor: string | undefined; texto: string }[] = []

  for (let i = 0; i < largura; i += 1) {
    const cor = i < cheias ? corDoNivel(((i + 1) / largura) * 100) : undefined
    const glifo = i < cheias ? '█' : '░'
    const ultimo = trechos.at(-1)

    if (ultimo !== undefined && ultimo.cor === cor) {
      ultimo.texto += glifo
    } else {
      trechos.push({ cor, texto: glifo })
    }
  }

  return (
    <Text>
      {trechos.map(trecho =>
        trecho.cor === undefined ? <Text dimColor>{trecho.texto}</Text> : <Text color={trecho.cor}>{trecho.texto}</Text>,
      )}
    </Text>
  )
}

// As cores das categorias do detalhamento, na ordem em que aparecem; o espaço
// livre e a reserva em cinza. Cruas: valem para a barra em SVG e a legenda.
const CORES_DAS_CATEGORIAS = [
  TONS.azul.fundo,
  TONS.roxo.fundo,
  '#4c8eda',
  TONS.laranja.fundo,
  TONS.ambar.fundo,
  TONS.ciano.fundo,
  TONS.verde.fundo,
  '#2f81f7',
  '#a371f7',
  '#e5534b',
] as const

const corDaCategoria = (categoria: LensCategoria, indice: number): string => {
  // O espaço livre num cinza do meio, que não pesa nem no tema claro nem no escuro.
  if (categoria.tipo === 'free') {
    return '#8c959f'
  }

  if (categoria.tipo === 'buffer') {
    return TONS.cinza.fundo
  }

  return CORES_DAS_CATEGORIAS[indice % CORES_DAS_CATEGORIAS.length] ?? TONS.cinza.fundo
}

// A parte da janela que uma categoria ocupa; o que não chega a 1% não vira "0%".
const parcela = (tokensDaCategoria: number, janela: number): string => {
  const percentual = (tokensDaCategoria / janela) * 100

  return percentual > 0 && percentual < 1 ? '<1%' : `${Math.round(percentual)}%`
}

// Os nomes das categorias que o app dá, em português. O "(deferred)" sai: o
// grupo "carregado sob demanda" já diz isso.
const NOMES_DAS_CATEGORIAS: Readonly<Record<string, string>> = {
  'System tools': 'Ferramentas do sistema',
  'MCP tools': 'Ferramentas MCP',
  Messages: 'Mensagens',
  'System prompt': 'Prompt de sistema',
  'MCP server instructions': 'Instruções dos servidores MCP',
  'Memory files': 'Arquivos de memória',
  'Custom agents': 'Agentes personalizados',
  'Free space': 'Espaço livre',
  'Autocompact buffer': 'Reserva da compactação automática',
}

const nomeDaCategoria = (nome: string): string => {
  const base = nome.replace(/\s*\(deferred\)\s*$/i, '')

  return NOMES_DAS_CATEGORIAS[base] ?? base
}

// O detalhamento em três grupos: o que ocupa a janela, o que fica fora dela
// e o que sobra.
const GRUPOS_DO_DETALHE: readonly { titulo: string; tipos: readonly string[] }[] = [
  { titulo: 'Ocupando a janela', tipos: ['used'] },
  { titulo: 'Fora da janela, carregado sob demanda', tipos: ['deferred'] },
  { titulo: 'Reserva e espaço livre', tipos: ['buffer', 'free'] },
]

const detalhamento = (
  el: Elementos,
  contexto: LensContexto,
  quadro: Quadro,
): RenderElement | null => {
  const { Box, Text } = el
  const detalhe = contexto.detalhe

  if (detalhe === undefined) {
    return null
  }

  const origem = detalhe.isExato === true ? 'contagem exata' : 'estimativa'
  const quando = detalhe.turno === undefined || detalhe.turno === 0 ? '' : ` do turno ${detalhe.turno}`
  // A cor de cada categoria vale para a barra e para a legenda.
  const cores = new Map(
    detalhe.categorias
      .filter(categoria => categoria.tokens > 0)
      .map((categoria, i) => [categoria.nome, corDaCategoria(categoria, i)] as const),
  )
  const naJanela = detalhe.categorias.filter(
    categoria => categoria.tokens > 0 && categoria.tipo !== 'deferred',
  )
  const grupos = GRUPOS_DO_DETALHE.map(grupo => ({
    titulo: grupo.titulo,
    linhas: detalhe.categorias
      .filter(categoria => categoria.tokens > 0 && grupo.tipos.includes(categoria.tipo))
      .sort((a, b) => b.tokens - a.tokens),
  })).filter(grupo => grupo.linhas.length > 0)
  const larguraDaBarra = limitar(quadro.largura - 2, 10, 48)
  // A barra em SVG: da largura do painel (até 900 px).
  const larguraDaPilha = Math.round(Math.min(900, (quadro.largura - 4) * PIXELS_POR_COLUNA))
  const janela = Math.max(1, detalhe.janela)
  const barra = temSvg(el, quadro) ? (
    <el.Svg
      source={pilha(
        naJanela.map(categoria => ({ valor: categoria.tokens, cor: cores.get(categoria.nome) ?? TONS.cinza.fundo })),
        larguraDaPilha,
      )}
      alt="A janela de contexto repartida pelas categorias"
      width={larguraDaPilha}
      height={14}
    />
  ) : (
    <Text>
      {naJanela.map(categoria => {
        const celulas = Math.max(1, Math.round((categoria.tokens / janela) * larguraDaBarra))

        return <Text color={cores.get(categoria.nome)}>{'█'.repeat(celulas)}</Text>
      })}
    </Text>
  )

  return (
    <Box key="detalhe" flexDirection="column" rowGap={respiro(quadro)}>
      {/* A estimativa soma de outro jeito que a medida do anel acima (que é a
          do app): os dois números diferem um pouco, e o rótulo diz qual é qual. */}
      <Text dimColor>
        {`${detalhe.isExato === true ? 'Contados' : 'Estimados'}: ${tokens(detalhe.total)} de ${tokens(detalhe.janela)} · ${nomeDoModelo(detalhe.modelo)} · ${origem}${quando}${detalhe.isExato === true ? '' : ' (o anel mostra a medida do app)'}`}
      </Text>
      {!quadro.isCompacto && barra}
      {grupos.map(grupo => (
        <Box flexDirection="column">
          <Text dimColor>{grupo.titulo}</Text>
          {grupo.linhas.map(categoria => (
            quadro.isTerminal ? (
              <Text wrap="truncate-end">
                <Text color={cores.get(categoria.nome) ?? TONS.cinza.fundo}>{'■ '}</Text>
                <Text>{`${tokens(categoria.tokens).padStart(7)}  ${nomeDaCategoria(categoria.nome)}`}</Text>
                <Text dimColor>{`  ${parcela(categoria.tokens, janela)}`}</Text>
              </Text>
            ) : (
              // No app a fonte é proporcional: o número numa coluna de largura
              // fixa, alinhado à direita, para os valores ficarem um sob o outro.
              <Box flexDirection="row" columnGap={1}>
                <Text color={cores.get(categoria.nome) ?? TONS.cinza.fundo}>■</Text>
                <Box width={7} flexShrink={0} justifyContent="flex-end">
                  <Text>{tokens(categoria.tokens)}</Text>
                </Box>
                <Box flexShrink={1} minWidth={0}>
                  <Text wrap="truncate-end">
                    <Text>{` ${nomeDaCategoria(categoria.nome)}`}</Text>
                    <Text dimColor>{`  ${parcela(categoria.tokens, janela)}`}</Text>
                  </Text>
                </Box>
              </Box>
            )
          ))}
        </Box>
      ))}
    </Box>
  )
}

// Uma linha por limite: nome, percentual, barra e quando renova, na cor do nível.
const linhaDoLimite = (
  el: Elementos,
  limite: LensLimite,
  quadro: Quadro,
  colunas: number,
): RenderElement => {
  const { Text } = el
  const percentual = `${limite.percentual}%`
  const renova = renovaEm(limite.renova, quadro.agora)
  const sufixo = renova === undefined ? '' : renova === 'agora' ? '  renova agora' : `  renova em ${renova}`
  // A barra fica com o que sobra do nome, do percentual e do "renova em". No
  // app, o "━" é mais largo que uma coluna da fonte proporcional: a barra é
  // mais curta, para o "renova em" não sair cortado.
  const largura = quadro.isTerminal
    ? limitar(colunas - 16 - sufixo.length, 6, 24)
    : // Do mesmo tamanho em todas as linhas (com ou sem o "renova em").
      limitar(Math.floor((colunas - 18 - '  renova em 0h00'.length) * 0.6), 6, 16)
  const cheias = limitar(Math.round((limite.percentual / 100) * largura), 0, largura)
  const cor = corDoNivel(limite.percentual)

  return (
    <Text wrap="truncate-end">
      <Text dimColor>{`${nomeDoLimite(limite.tipo).padEnd(7)}${' '.repeat(Math.max(0, 5 - percentual.length))}`}</Text>
      <Text bold color={cor}>{percentual}</Text>
      <Text>{'  '}</Text>
      <Text color={cor}>{'━'.repeat(cheias)}</Text>
      <Text dimColor>{'━'.repeat(largura - cheias)}</Text>
      {sufixo !== '' && <Text dimColor>{sufixo}</Text>}
    </Text>
  )
}

const abaContexto = (el: Elementos, dados: Dados, quadro: Quadro, acoes: Acoes): RenderElement => {
  const { Box, Button, Text } = el
  const contexto = dados.contexto
  // A barra ocupa o cartão inteiro: menos a moldura, o recuo e a margem do painel.
  const largura = limitar(quadro.largura - 7, 10, 200)
  const usado = contexto.tokens === undefined ? '–' : tokens(contexto.tokens)
  const janela = contexto.janela > 0 ? tokens(contexto.janela) : '–'
  const preenchido = contexto.percentual === undefined ? '–' : `${contexto.percentual}%`
  const nivel = corDoNivel(contexto.percentual ?? 0)
  const pontos = contexto.historico.map(ponto => ponto.tokens)
  // Lado a lado no painel largo: custo e limite em dois cartões.
  const isLargo = quadro.largura >= 90
  const cor = corDaAba(3)
  const botao = (
    <Button
      key="detalhar"
      label={dados.ui.isCalculando ? 'Contando…' : 'Contagem exata'}
      onPress={acoes.detalhar}
    />
  )

  if (quadro.isCompacto) {
    const limite = contexto.limites[0]

    return (
      <Box key="contexto" flexDirection="column">
        <Text wrap="truncate-end">
          <Text color={nivel} bold>{preenchido}</Text>
          <Text>{` · ${usado} / ${janela} · `}</Text>
          <Text color={cor}>{grafico(pontos, 0)}</Text>
          <Text dimColor>{` ${variacao(contexto)}`}</Text>
        </Text>
        <Text wrap="truncate-end">
          {`${dolar(contexto.custo)} na sessão · ${dolar(custoDoUltimoTurno(contexto))} no último turno`}
          {limite !== undefined && ` · limite ${nomeDoLimite(limite.tipo)} ${limite.percentual}%`}
        </Text>
        {botao}
      </Box>
    )
  }

  const numeros = (
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
      <Text>
        <Text color={nivel} bold>{preenchido}</Text>
        <Text dimColor> do contexto</Text>
      </Text>
      <Text bold>{`${usado} / ${janela}`}</Text>
      <Text color={(variacaoDoUltimoTurno(contexto) ?? 0) > 0 ? COR.ambar : COR.cinza}>
        {variacao(contexto)}
      </Text>
    </Box>
  )
  // No desktop, o anel e os números grandes num desenho; no terminal, os
  // números e a barra de calor embaixo deles.
  // Os limites de uso da conta no desenho: ao lado do anel quando cabem, ou
  // num painel próprio, maior que as linhas de texto de antes.
  const limitesDoPainel: LimiteDoPainel[] = contexto.limites.map(limite => {
    const renova = renovaEm(limite.renova, quadro.agora)

    return {
      nome: nomeDoLimite(limite.tipo),
      percentual: limite.percentual,
      cor: TONS[tomDoNivel(limite.percentual)].fundo,
      ...(renova === undefined ? {} : { renova: renova === 'agora' ? 'renova agora' : `renova em ${renova}` }),
    }
  })
  const desenhoDoUso = painelDoContexto({
    percentual: contexto.percentual,
    usado,
    janela,
    variacao: variacao(contexto),
    isSobe: (variacaoDoUltimoTurno(contexto) ?? 0) > 0,
    cor: TONS[tomDoNivel(contexto.percentual ?? 0)].fundo,
  }, (quadro.largura - 6) * PIXELS_POR_COLUNA, limitesDoPainel)
  const isLimitesNoUso = temSvg(el, quadro) && desenhoDoUso.isComLimites
  const desenhoDosLimites = painelDosLimites(limitesDoPainel, (quadro.largura - 8) * PIXELS_POR_COLUNA)
  const uso = temSvg(el, quadro) ? (
    <el.Svg
      source={desenhoDoUso.source}
      alt={`Contexto ${preenchido} usado, ${usado} de ${janela} tokens; ${variacao(contexto)}${
        isLimitesNoUso ? `; limites: ${limitesDoPainel.map(limite => `${limite.nome} ${limite.percentual}%`).join(', ')}` : ''
      }`}
      width={desenhoDoUso.width}
      height={desenhoDoUso.height}
    />
  ) : (
    <Box flexDirection="column">
      {numeros}
      {barraDeCalor(el, contexto.percentual ?? 0, largura)}
    </Box>
  )
  const limites = (colunas: number) => (
    <Box key="limites" flexDirection="column">
      {contexto.limites.length === 0 && <Text dimColor>Sem leitura nesta sessão.</Text>}
      {contexto.limites.length > 0 && temSvg(el, quadro) ? (
        <el.Svg
          source={desenhoDosLimites.source}
          alt={`Limites de uso: ${limitesDoPainel.map(limite => `${limite.nome} ${limite.percentual}%`).join(', ')}`}
          width={desenhoDosLimites.width}
          height={desenhoDosLimites.height}
        />
      ) : (
        contexto.limites.map(limite => linhaDoLimite(el, limite, quadro, colunas))
      )}
    </Box>
  )

  return (
    <Box key="contexto" flexDirection="column" rowGap={1}>
      {secaoQueDobra(el, dobraDe(quadro, acoes), 'contexto:uso', { texto: 'Contexto da conversa', cor }, [
        // A moldura neutra: o anel já tem a cor do nível.
        cartao(el, 'uso', 'subtle', false, [
          uso,
          <Text key="uso-nota" dimColor wrap="wrap">
            Quando enche, o Claude Code compacta a conversa. Os agentes ficam de fora: cada um tem a sua janela.
          </Text>,
        ]),
      ])}
      {dados.totais !== undefined && gastos(el, contexto, dados.totais, dados.totais.quantosAgentes, quadro, acoes)}
      {/* Ao lado do anel, os limites já estão no alto: a seção própria sai. */}
      {!isLimitesNoUso &&
        secaoQueDobra(el, dobraDe(quadro, acoes), 'contexto:limites', { texto: 'Limite de uso', cor: COR.roxo }, [
          <Text key="limites-nota" dimColor>Da sua conta, somando todas as sessões.</Text>,
          cartao(el, 'limites', 'subtle', false, [limites(isLargo ? Math.floor(quadro.largura / 2) + 20 : quadro.largura)]),
        ])}
      {secaoQueDobra(
        el,
        dobraDe(quadro, acoes),
        'contexto:detalhe',
        { texto: 'Detalhamento do contexto', cor },
        [
          // O botão junto do título a que pertence, com o que ele custa ao lado.
          <Box key="detalhe-botao" flexDirection="row" columnGap={2} alignItems="center">
            <Box flexShrink={0}>{botao}</Box>
            <Text dimColor wrap="wrap">
              Estimativa local, a cada turno. A contagem exata faz uma requisição por ferramenta e por arquivo de memória.
            </Text>
          </Box>,
          detalhamento(el, contexto, quadro),
        ],
        1,
      )}
    </Box>
  )
}

// O custo e os tokens da sessão por quem gastou: o total, a conversa e os
// agentes, cada um com o que o último pedido da pessoa somou. O custo é o da
// sessão, que já inclui os agentes; a parte deles é a repartição do Lens
// (veja "O custo de cada agente" no README). Os tokens somam todas as
// respostas desde o começo (uma compactação não zera): sem o cache, o que o
// modelo processou pela primeira vez e escreveu; com ele, também o contexto
// relido a cada resposta.
export const linhasDeGasto = (
  contexto: LensContexto,
  totais: NonNullable<Dados['totais']>,
  quantosAgentes: number,
  cotacao: number,
): LinhaDeGasto[] => {
  const ultimo = totais.ultimo
  const usdTotal = contexto.custo
  const usdTotalTurno = custoDoUltimoTurno(contexto)
  const usdAgentes = totais.usdSubagentes
  const usdConversa = usdTotal === undefined ? undefined : Math.max(0, usdTotal - usdAgentes)
  const usdConversaTurno =
    usdTotalTurno === undefined || ultimo === undefined ? undefined : Math.max(0, usdTotalTurno - ultimo.usdSubagentes)
  const parte = (usd: number | undefined) =>
    usd === undefined || usdTotal === undefined || usdTotal <= 0 ? undefined : `${Math.round((usd / usdTotal) * 100)}% do custo`
  const reais = (usd: number | undefined) =>
    usd === undefined || cotacao <= 0 ? {} : { reais: `R$ ${decimal(usd * cotacao, 2)}` }
  const mais = (n: number | undefined) => (n === undefined ? {} : { semCacheTurno: `+${tokens(n)}` })
  const maisComCache = (n: number | undefined) => (n === undefined ? {} : { comCacheTurno: `+${tokens(n)}` })
  const noTurno = (usd: number | undefined) => (usd === undefined ? {} : { usdTurno: dolar(usd) })
  const tokensDe = (sem: number, com: number, semTurno: number | undefined, comTurno: number | undefined) => ({
    semCache: tokens(sem),
    comCache: tokens(com),
    ...mais(semTurno),
    ...maisComCache(comTurno),
    fracaoSemCache: com > 0 ? Math.min(1, sem / com) : 0,
  })
  const nota = (texto: string | undefined) => (texto === undefined ? {} : { nota: texto })
  const doTotal =
    usdTotal === undefined || usdTotal <= 0 || usdConversa === undefined
      ? {}
      : { divisao: { conversa: usdConversa / usdTotal, agentes: usdAgentes / usdTotal } }
  const agentes = plural(quantosAgentes, 'agente', 'agentes')

  return [
    {
      nome: 'Total',
      classe: 'total',
      usd: dolar(usdTotal),
      ...reais(usdTotal),
      ...noTurno(usdTotalTurno),
      ...doTotal,
      ...tokensDe(
        totais.semCacheConversa + totais.semCacheSubagentes,
        totais.tokensConversa + totais.tokensSubagentes,
        ultimo === undefined ? undefined : ultimo.semCacheConversa + ultimo.semCacheSubagentes,
        ultimo === undefined ? undefined : ultimo.tokensConversa + ultimo.tokensSubagentes,
      ),
    },
    {
      nome: 'Conversa',
      classe: 'conversa',
      usd: dolar(usdConversa),
      ...reais(usdConversa),
      ...noTurno(usdConversaTurno),
      ...nota(parte(usdConversa)),
      ...tokensDe(totais.semCacheConversa, totais.tokensConversa, ultimo?.semCacheConversa, ultimo?.tokensConversa),
    },
    {
      nome: 'Agentes',
      classe: 'agentes',
      usd: dolar(usdAgentes),
      ...reais(usdAgentes),
      ...noTurno(ultimo?.usdSubagentes),
      ...nota([parte(usdAgentes), agentes].filter(texto => texto !== undefined).join(' · ')),
      ...tokensDe(totais.semCacheSubagentes, totais.tokensSubagentes, ultimo?.semCacheSubagentes, ultimo?.tokensSubagentes),
    },
  ]
}

const COR_DA_LINHA: Readonly<Record<LinhaDeGasto['classe'], string>> = {
  total: COR.azul,
  conversa: COR.laranja,
  agentes: COR.verde,
}

const gastos = (
  el: Elementos,
  contexto: LensContexto,
  totais: NonNullable<Dados['totais']>,
  quantosAgentes: number,
  quadro: Quadro,
  acoes: Acoes,
): RenderElement => {
  const { Box, Text } = el
  const cotacao = quadro.cotacao ?? 0
  const linhas = linhasDeGasto(contexto, totais, quantosAgentes, cotacao)
  const largura = Math.round(Math.min(1400, (quadro.largura - 1) * PIXELS_POR_COLUNA))
  const desenho = temSvg(el, quadro) && largura >= LARGURA_MINIMA_DA_GRADE ? gradeDeGastos(linhas, largura) : undefined
  // No texto: o nome, o custo, os tokens sem e com o cache; embaixo, o ▲.
  const coluna = (texto: string, largo: number) => texto.padEnd(largo)
  const emTexto = (
    <Box key="gastos-texto" flexDirection="column">
      <Text wrap="truncate-end" dimColor>
        {`${coluna('', 10)}${coluna('Custo', 24)}${coluna('Sem cache', 14)}Com cache`}
      </Text>
      {linhas.map(linha => (
        <Box key={`gasto-${linha.classe}`} flexDirection="column">
          <Text wrap="truncate-end">
            <Text bold color={COR_DA_LINHA[linha.classe]}>{coluna(linha.nome, 10)}</Text>
            <Text bold>{coluna(linha.reais === undefined ? linha.usd : `${linha.usd} · ${linha.reais}`, 24)}</Text>
            <Text bold>{coluna(linha.semCache, 14)}</Text>
            <Text>{linha.comCache}</Text>
          </Text>
          <Text wrap="truncate-end" color={COR.ambar}>
            {`${coluna('', 10)}${coluna(linha.usdTurno === undefined ? '–' : `▲ ${linha.usdTurno}`, 24)}${coluna(linha.semCacheTurno === undefined ? '–' : `▲ ${linha.semCacheTurno}`, 14)}${linha.comCacheTurno === undefined ? '–' : `▲ ${linha.comCacheTurno}`}`}
          </Text>
        </Box>
      ))}
    </Box>
  )

  return secaoQueDobra(el, dobraDe(quadro, acoes), 'contexto:gastos', { texto: 'Custo e tokens', cor: COR.ciano }, [
      <Text key="gastos-nota" dimColor wrap="wrap">
        {`O ▲ é o que o último pedido somou. Com cache soma o contexto relido a cada resposta.${cotacao > 0 ? ` Em reais, a R$ ${decimal(cotacao, 2)} por dólar.` : ''}`}
      </Text>,
      desenho === undefined ? (
        emTexto
      ) : (
        <Box key="gastos-grade">
          <el.Svg
            source={desenho.source}
            alt={linhas
              .map(
                linha =>
                  `${linha.nome}: ${linha.usd}${linha.usdTurno === undefined ? '' : ` (▲ ${linha.usdTurno})`}, ${linha.semCache} tokens sem cache, ${linha.comCache} com cache`,
              )
              .join('; ')}
            width={largura}
            height={desenho.height}
          />
        </Box>
      ),
    ])
}

const estadoDoComando = (comando: LensComando): Estado => {
  if (comando.estado === 'rodando' || comando.estado === 'fundo') {
    return ESTADOS.rodando
  }

  if (comando.estado === 'negado') {
    return ESTADOS.negado
  }

  return comando.estado === 'ok' ? ESTADOS.ok : ESTADOS.falhou
}

// `volta`: o turno de onde o comando é aberto. Dentro de outro cartão, o
// comando que ainda roda não ganha o seu.
export const linhaDoComando = (
  el: Elementos,
  comando: LensComando,
  quadro: Quadro,
  acoes: Acoes,
  // `isSemQuem`: no detalhe de um agente, todos são dele (o nome não repete).
  opcoes: { volta?: string; isSemCartao?: boolean; isSemQuem?: boolean } = {},
): RenderElement => {
  const { Box, Text } = el
  const estado = estadoDoComando(comando)
  const tempo =
    comando.estado === 'rodando'
      ? duracaoViva(quadro.agora - comando.inicio)
      : comando.duracaoMs === undefined
        ? undefined
        : duracao(comando.duracaoMs)
  const partes = [
    comando.estado === 'rodando' ? 'rodando' : undefined,
    comando.estado === 'fundo' ? 'em segundo plano' : undefined,
    comando.estado === 'negado' ? 'negado' : undefined,
    comando.saida === undefined ? undefined : `exit ${comando.saida}`,
    comando.nota,
    tempo,
    comando.quem === 'principal' || opcoes.isSemQuem === true ? undefined : comando.quem,
  ].filter((parte): parte is string => parte !== undefined)

  const status = partes.join(' · ')
  const texto = curto(
    umaLinha(semRaiz(comando.comando, quadro.raiz)),
    // O comando fica com o que sobra do status (que não pode sumir), da
    // marca e da moldura do cartão.
    Math.max(16, quadro.largura - status.length - (opcoes.isSemCartao === true ? 14 : 8)),
  )

  if (quadro.isCompacto) {
    return (
      <Text wrap="truncate-end">
        <Text color={estado.cor}>{`${estado.glifo} `}</Text>
        <Text>{texto}</Text>
        <Text dimColor>{` · ${partes.join(' · ')}`}</Text>
      </Text>
    )
  }

  const abrir = () =>
    acoes.abrir({ tipo: 'comando', id: comando.id, ...(opcoes.volta === undefined ? {} : { volta: opcoes.volta }) })
  const linha = (
    <Box key={`linha-comando-${comando.id}`} flexDirection="row" columnGap={1}>
      {glifo(el, estado)}
      {titulo(el, `ver-comando-${comando.id}`, texto, corDaAba(4), abrir)}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text dimColor wrap="truncate-end">{partes.length > 0 ? ` ${partes.join(' · ')}` : ''}</Text>
      </Box>
    </Box>
  )

  // O comando que ainda roda ganha um cartão, como o "Em execução" do Claude Code.
  return (comando.estado === 'rodando' || comando.estado === 'fundo') && opcoes.isSemCartao !== true
    ? cartao(el, `cartao-comando-${comando.id}`, estado.cor, false, [linha])
    : linha
}

// Os agentes de um turno: os criados nele e os que uma rodada nova começou
// dentro dele (o mesmo agente, acordado por um recado). Um agente que só
// trocou recados sem voltar a trabalhar não entra: ele não rodou no turno.
export const agentesDoGrupo = (agentes: readonly LensAgente[], grupo: Grupo): LensAgente[] =>
  agentes.filter(agente => rodadasNoTurno(agente, grupo, agentes).length > 0)

// Onde os agentes estão sendo mostrados, quando isso recorta as rodadas deles:
// um turno (as que começaram nele) ou outro agente (as que ele criou ou acordou).
// Dentro de uma rodada de outro agente, só o que começou na janela dela.
type ContextoDosAgentes =
  | { tipo: 'turno'; grupo: Grupo }
  | { tipo: 'agente'; pai: LensAgente; janela?: { inicio: number; fim: number } }

const rodadasNoContexto = (dados: Dados, agente: LensAgente, contexto: ContextoDosAgentes, agora: number): number[] => {
  if (contexto.tipo === 'turno') {
    return rodadasNoTurno(agente, contexto.grupo, dados.agentes)
  }

  const ficha = dados.fichas.agentesDoTurno?.[agente.id]
  const abertas = rodadasAbertasPor(agente, ficha, contexto.pai.id, dados.mensagens, agora)
  const janela = contexto.janela

  return janela === undefined
    ? abertas
    : rodadasVistas(agente, ficha, dados.mensagens, agora)
        .filter(rodada => abertas.includes(rodada.n) && isNaJanela(rodada.inicio, janela))
        .map(rodada => rodada.n)
}

// No detalhe de um turno, os subagentes que ele criou: o grafo só deles (e das
// mensagens entre eles) e um cartão por agente, com o pedido que recebeu, a
// resposta e o botão que abre o detalhe (e cujo Voltar traz de volta ao turno).
const subagentesDoTurno = (
  el: Elementos,
  dados: Dados,
  grupo: Grupo,
  quadro: Quadro,
  acoes: Acoes,
): RenderElement | null => {
  // Só os agentes que rodaram no turno: os criados nele e os acordados nele
  // (um cartão por rodada deles que aconteceu aqui).
  const agentes = agentesDoGrupo(dados.agentes, grupo)

  if (agentes.length === 0) {
    return null
  }

  const volta = String(grupo.ordem)
  const cor = corDaAba(1)
  const { cartoes, rodadas } = cartoesDosAgentes(el, dados, agentes, quadro, acoes, volta, { tipo: 'turno', grupo })

  return (
    secaoQueDobra(
      el,
      dobraDe(quadro, acoes),
      'turno:subagentes',
      {
        texto: 'Subagentes',
        cor,
        contagem: `· ${agentes.length}${rodadas > agentes.length ? ` (${plural(rodadas, 'rodada', 'rodadas')})` : ''}`,
      },
      [
        // O grafo tem um nó por agente, com todas as rodadas dele.
        redeDosAgentes(el, dados, quadro, acoes, { agentes, isTrabalhando: grupo.isAndando, volta, isSemTitulo: true }),
        ...cartoes,
      ],
      respiro(quadro),
    )
  )
}

// Os cartões dos agentes de um contexto (um turno, ou os de dentro de outro
// agente), com o pedido e a resposta das fichas e a origem de cada um. Um
// agente que trabalhou mais de uma vez ganha um cartão por rodada que
// aconteceu no contexto; sem contexto (ou sem rodada ali), o cartão dele
// inteiro, com a lista das rodadas. `rodadas`: quantas os cartões cobrem.
const cartoesDosAgentes = (
  el: Elementos,
  dados: Dados,
  lista: readonly LensAgente[],
  quadro: Quadro,
  acoes: Acoes,
  volta?: string,
  contexto?: ContextoDosAgentes,
): { cartoes: RenderElement[]; rodadas: number } => {
  const cartoes: RenderElement[] = []
  let rodadas = 0

  for (const agente of lista) {
    const ficha = dados.fichas.agentesDoTurno?.[agente.id]
    const vistas = rodadasVistas(agente, ficha, dados.mensagens, quadro.agora)
    const escopo = escopoDo(agente, dados.inventario.itens)
    const numeros = contexto === undefined || vistas.length <= 1 ? [] : rodadasNoContexto(dados, agente, contexto, quadro.agora)
    const daqui = vistas.filter(rodada => numeros.includes(rodada.n))

    if (daqui.length === 0) {
      rodadas += 1
      cartoes.push(
        linhaDoAgente(el, agente, quadro, acoes, {
          ...(volta === undefined ? {} : { volta }),
          escopo,
          ...(ficha?.pedido === undefined ? {} : { pedido: ficha.pedido }),
          ...(ficha?.resposta === undefined ? {} : { resposta: ficha.resposta }),
          rodadas: vistas,
        }),
      )

      continue
    }

    rodadas += daqui.length

    for (const rodada of daqui) {
      cartoes.push(cartaoDaRodada(el, agente, rodada, dados.agentes, quadro, acoes, { ...(volta === undefined ? {} : { volta }), escopo }))
    }
  }

  return { cartoes, rodadas }
}

// Os agentes de um contexto em linhas de uma só (no cartão de um turno, no
// último turno da Visão geral, nas outras execuções de um agente): o estado,
// o nome, que abre o detalhe, e, apagados, o tipo, a origem, o modelo, o
// tempo e o custo. `grupo`: o turno em que as linhas estão; um agente que
// trabalhou mais de uma vez vira uma linha por rodada que aconteceu nele
// ("… · rodada 2"), e cada linha abre direto a tela da rodada. A contagem
// diz quantos agentes e quantas rodadas as linhas cobrem.
export type ListaDeAgentes = { linhas: RenderElement[]; agentes: number; rodadas: number }

const linhasCurtasDosAgentes = (
  el: Elementos,
  dados: Dados,
  lista: readonly LensAgente[],
  quadro: Quadro,
  acoes: Acoes,
  volta?: string,
  grupo?: Grupo,
): ListaDeAgentes => {
  const { Box, Button, Text } = el
  const linhas: RenderElement[] = []
  let rodadas = 0
  // O que vai apagado no fim de cada linha: o tipo, a origem e os números.
  const cauda = (agente: LensAgente, escopo: EscopoDoAgente, numeros: readonly string[]) => (
    <Box flexShrink={1} minWidth={0}>
      <Text wrap="truncate-end">
        {agente.descricao !== '' && <Text dimColor>{` (${tipoDe(agente)})`}</Text>}
        {escopo !== 'embutido' && <Text color={COR_DO_ESCOPO[escopo]}>{` ${NOME_DO_ESCOPO[escopo]}`}</Text>}
        {numeros.length > 0 && <Text dimColor>{` · ${numeros.join(' · ')}`}</Text>}
      </Text>
    </Box>
  )

  for (const agente of lista) {
    const estado = estadoDoAgente(agente)
    const escopo = escopoDo(agente, dados.inventario.itens)
    const quantas = rodadasDoAgente(agente)
    const vistas = quantas > 1 ? rodadasVistas(agente, dados.fichas.agentesDoTurno?.[agente.id], dados.mensagens, quadro.agora) : []
    const doTurno = grupo === undefined || quantas <= 1 ? [] : rodadasNoTurno(agente, grupo, dados.agentes)
    const daqui = vistas.filter(rodada => doTurno.includes(rodada.n))

    if (daqui.length === 0) {
      // O agente inteiro: com várias rodadas, quantas (e as deste turno, se o
      // detalhe delas não foi guardado).
      const numeros = [
        periodoDoAgente(agente),
        agente.modelo === undefined ? undefined : nomeDoModelo(agente.modelo),
        tempoDoAgente(agente, quadro.agora),
        quantas > 1 ? `${quantas} rodadas${doTurno.length > 0 ? ` (${nomeDasRodadas(doTurno)} neste turno)` : ''}` : undefined,
        agente.custo === undefined ? undefined : dolar(agente.custo),
      ].filter((parte): parte is string => parte !== undefined)
      rodadas += 1
      linhas.push(
        <Box key={`curta-${agente.id}`} flexDirection="row">
          <Text color={estado.cor}>{`${estado.glifo} `}</Text>
          <Box flexShrink={1} minWidth={0}>
            <Button
              key={`curta-abrir-${agente.id}`}
              label={agente.descricao === '' ? agente.tipo : agente.descricao}
              plain
              hover={{ underline: true, color: corDaAba(1) }}
              onPress={() => acoes.abrir({ tipo: 'agente', id: agente.id, ...(volta === undefined ? {} : { volta }) })}
            />
          </Box>
          {cauda(agente, escopo, numeros)}
        </Box>,
      )

      continue
    }

    // Uma linha por rodada que aconteceu aqui, com os números dela; o nome
    // abre a tela da rodada, com o caminho por este contexto.
    for (const rodada of daqui) {
      const marca = marcaDaRodada(rodada.estado)
      const numeros = [
        periodoDaRodada(rodada),
        ((modelo: string | undefined) => (modelo === undefined ? undefined : nomeDoModelo(modelo)))(modeloDaRodada(rodada, agente)),
        tempoDaRodada(rodada, quadro.agora),
        rodada.custo === undefined ? undefined : dolar(rodada.custo),
        rodada.chamadas === undefined ? undefined : plural(rodada.chamadas, 'chamada', 'chamadas'),
      ].filter((parte): parte is string => parte !== undefined)
      rodadas += 1
      linhas.push(
        <Box key={`curta-${agente.id}-${rodada.n}`} flexDirection="row">
          <Text color={marca.cor}>{`${marca.glifo} `}</Text>
          <Box flexShrink={1} minWidth={0}>
            <Button
              key={`rodada-${agente.id}-${rodada.n}`}
              label={`${agente.descricao === '' ? agente.tipo : agente.descricao} · rodada ${rodada.n}`}
              plain
              hover={{ underline: true, color: COR.roxo }}
              onPress={() => abrirRodada(acoes, agente, rodada.n, volta)}
            />
          </Box>
          <Text color={COR.roxo}>{` de ${rodada.total}`}</Text>
          {cauda(agente, escopo, numeros)}
        </Box>,
      )
    }
  }

  return { linhas, agentes: lista.length, rodadas }
}

// Os comandos Bash de um turno: os marcados com o pedido e, os gravados antes
// disso, os que começaram enquanto o turno corria.
export const comandosDoGrupo = (comandos: readonly LensComando[], grupo: Grupo): LensComando[] =>
  comandos.filter(comando =>
    comando.ordem === undefined
      ? comando.inicio >= grupo.inicio && (grupo.isAndando || comando.inicio <= grupo.inicio + grupo.duracaoMs)
      : comando.ordem === grupo.ordem,
  )

const linhaDoGrupo = (
  el: Elementos,
  grupo: Grupo,
  edicoes: number,
  comandos: readonly LensComando[],
  quadro: Quadro,
  acoes: Acoes,
  // Os agentes que o turno chamou, uma linha por agente (ou por rodada de um
  // agente que trabalhou mais de uma vez); os cartões inteiros ficam no
  // detalhe do turno.
  agentes: ListaDeAgentes = { linhas: [], agentes: 0, rodadas: 0 },
): RenderElement => {
  const { Box, Text } = el
  const tempo = grupo.isAndando ? duracaoViva(quadro.agora - grupo.inicio) : duracao(grupo.duracaoMs)
  // O pedido e a resposta em até duas linhas cada, cortados com "…".
  const porLinha = Math.max(30, quadro.largura - 16)
  const pedido = curto(umaLinha(semMarcas(grupo.cabeca?.pedido ?? '')), porLinha * 2)
  const resposta = curto(umaLinha(grupo.cabeca?.resposta ?? ''), porLinha * 2)
  const linhasDe = (texto: string) => (texto === '' ? 0 : Math.ceil((texto.length + 10) / porLinha))
  const partes = [
    grupo.variacao === undefined
      ? undefined
      : `${grupo.variacao >= 0 ? '+' : '−'}${tokens(grupo.variacao)} de contexto`,
    grupo.custo === undefined ? undefined : dolar(grupo.custo),
    plural(grupo.ferramentas, 'ferramenta', 'ferramentas'),
    edicoes > 0 ? plural(edicoes, 'edição', 'edições') : undefined,
    comandos.length > 0 ? plural(comandos.length, 'comando Bash', 'comandos Bash') : undefined,
    grupo.retornos.length > 0
      ? plural(grupo.retornos.length, 'retorno de agente', 'retornos de agentes')
      : undefined,
  ].filter((parte): parte is string => parte !== undefined)
  const estado = (
    <Text wrap="truncate-end">
      {grupo.isAndando && <Text color={ESTADOS.rodando.cor}>{`em andamento · ${tempo}`}</Text>}
      {!grupo.isAndando && <Text dimColor>{tempo}</Text>}
      {grupo.isAbortado && <Text color={COR.vermelho}>{' · interrompido'}</Text>}
      {grupo.falhas > 0 && (
        <Text color={COR.vermelho}>{` · ${plural(grupo.falhas, 'falha', 'falhas')}`}</Text>
      )}
    </Text>
  )

  if (quadro.isCompacto) {
    return (
      <Box flexDirection="column">
        <Text wrap="truncate-end">
          <Text bold>{`Turno ${grupo.ordem} · `}</Text>
          {estado}
        </Text>
        <Text dimColor wrap="truncate-end">{partes.join(' · ')}</Text>
      </Box>
    )
  }

  const abrir = () => acoes.abrir({ tipo: 'turno', id: String(grupo.ordem) })
  // A cor do turno: azul em andamento, vermelho com falha, a da aba se correu bem.
  const cor = grupo.isAndando
    ? ESTADOS.rodando.cor
    : grupo.falhas > 0 || grupo.isAbortado
      ? ESTADOS.falhou.cor
      : corDaAba(4)

  // Cada turno num cartão, separado do próximo: a borda acende com o mouse em
  // qualquer ponto dele, e o cabeçalho inteiro (título, pedido e números) abre
  // o detalhe, por botões invisíveis por cima; os comandos seguem clicáveis.
  return cartaoClicavel(el, `cartao-turno-${grupo.ordem}`, 'subtle', cor, 2 + Math.max(1, linhasDe(pedido)) + linhasDe(resposta), quadro, abrir, [
    <Box flexDirection="row" columnGap={1}>
      <Text color={cor}>{grupo.isAndando ? '◉' : '●'}</Text>
      {titulo(el, `ver-turno-${grupo.ordem}`, `Turno ${grupo.ordem}`, corDaAba(4), abrir)}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        {estado}
      </Box>
    </Box>,
    <Text wrap="wrap">
      <Text color={corDaAba(4)} bold>{'Pedido  '}</Text>
      <Text>{pedido === '' ? '—' : pedido}</Text>
    </Text>,
    resposta !== '' && (
      <Text wrap="wrap">
        <Text color={corDaAba(4)} bold>{'Resposta  '}</Text>
        <Text dimColor>{resposta}</Text>
      </Text>
    ),
    agentes.linhas.length > 0 && (
      <Box key={`agentes-turno-${grupo.ordem}`} flexDirection="column">
        <Text color={corDaAba(4)} bold>{`Agentes ${contagemDaLista(agentes)}`}</Text>
        {/* Até 10 linhas; passando disso, as primeiras 8 e um link para o
            turno (com 7, cortar 1 escondia um agente sem motivo). */}
        {agentes.linhas.length <= 10 ? agentes.linhas : agentes.linhas.slice(0, 8)}
        {agentes.linhas.length > 10 && (
          <Box flexShrink={0}>
            <el.Button
              key={`mais-agentes-${grupo.ordem}`}
              label={`+ ${agentes.linhas.length - 8} no detalhe do turno ›`}
              plain
              dimColor
              hover={{ underline: true, color: corDaAba(4) }}
              onPress={abrir}
            />
          </Box>
        )}
      </Box>
    ),
    etiquetas(
      el,
      `numeros-turno-${grupo.ordem}`,
      partes.map(texto =>
        texto.startsWith('US$')
          ? { texto, tom: 'verde' as const, isNegrito: true }
          : texto.endsWith('de contexto')
            ? { texto, tom: 'ciano' as const }
            : { texto },
      ),
    ),
  ])
}

const abaTurnos = (el: Elementos, dados: Dados, quadro: Quadro, acoes: Acoes): RenderElement => {
  const { Box, Text } = el
  const grupos = gruposDeTurnos(dados.rodadas)
  const maximo = quadro.isCompacto ? 2 : 30
  const edicoesDe = (ordem: number): number =>
    dados.turnos.find(turno => turno.n === ordem)?.edicoes.length ?? 0
  // As ferramentas mais chamadas na sessão, somando todos os turnos.
  const somadas = new Map<string, number>()

  for (const rodada of dados.rodadas) {
    for (const [nome, vezes] of Object.entries(rodada.porFerramenta ?? {})) {
      somadas.set(nome, (somadas.get(nome) ?? 0) + vezes)
    }
  }

  const ferramentas = [...somadas.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <Box key="turnos" flexDirection="column" rowGap={quadro.isCompacto ? 0 : 0}>
      <Box flexDirection="column" marginBottom={respiro(quadro)}>
        {secao(
          el,
          'Turnos',
          corDaAba(4),
          `· ${grupos.length}${dados.contexto.custo === undefined ? '' : ` · ${dolar(dados.contexto.custo)} na sessão`}`,
          quadro.isTerminal || quadro.isCompacto ? undefined : quadro.largura,
          quadro.tomDaAba,
        )}
        {!quadro.isCompacto && grupos.length > 0 && (
          <Text dimColor wrap="wrap">Cada pedido seu e o que o Claude fez nele. Clique no turno para ver o detalhe, com os comandos Bash dele.</Text>
        )}
        {grupos.length === 0 && <Text dimColor>Nenhum turno nesta sessão ainda.</Text>}
      </Box>
      {temSvg(el, quadro) && grupos.length > 1 && (
        // No Desktop, a duração de cada turno numa barra (os 20 mais recentes).
        <Box flexDirection="column" marginBottom={1}>
          <el.Svg
            source={barrasDosTurnos(
              [...grupos].slice(0, 20).reverse().map(grupo => ({
                rotulo: String(grupo.ordem),
                valor: grupo.isAndando ? quadro.agora - grupo.inicio : grupo.duracaoMs,
                estado: grupo.isAndando ? 'andando' : grupo.falhas > 0 || grupo.isAbortado ? 'falha' : 'ok',
                titulo: `Turno ${grupo.ordem}${(grupo.cabeca?.pedido ?? '') === '' ? '' : ` · ${curto(umaLinha(semMarcas(grupo.cabeca?.pedido ?? '')), 48)}`}`,
                dica: [
                  grupo.isAndando ? `em andamento há ${duracaoViva(quadro.agora - grupo.inicio)}` : duracao(grupo.duracaoMs),
                  grupo.custo === undefined ? undefined : dolar(grupo.custo),
                  plural(grupo.ferramentas, 'ferramenta', 'ferramentas'),
                  grupo.falhas > 0 ? plural(grupo.falhas, 'falha', 'falhas') : undefined,
                ]
                  .filter((parte): parte is string => parte !== undefined)
                  .join(' · '),
              })),
              Math.min(1000, (quadro.largura - 2) * PIXELS_POR_COLUNA),
            )}
            alt="A duração de cada turno, do mais antigo ao mais recente"
            width={Math.round(Math.min(1000, (quadro.largura - 2) * PIXELS_POR_COLUNA))}
            height={92}
            isInteractive
          />
          <Text dimColor wrap="wrap">
            {`Duração ${grupos.length > 20 ? 'dos últimos 20 turnos' : 'de cada turno'} · passe o mouse numa barra para ver o detalhe`}
          </Text>
        </Box>
      )}
      {/* Com um turno só, as ferramentas dele já estão no detalhe do turno. */}
      {!quadro.isCompacto && ferramentas.length > 1 && grupos.length > 1 && (
        <Box flexDirection="column" marginBottom={1}>
          {secaoQueDobra(el, dobraDe(quadro, acoes), 'turnos:ferramentas', { texto: 'Ferramentas mais chamadas', cor: corDaAba(4) }, [
            barrasDeContagem(el, ferramentas, quadro, 'roxo', corDaAba(4), 'As ferramentas mais chamadas na sessão'),
          ])}
        </Box>
      )}
      {(() => {
        const lista = (
          <Box key="turnos-lista" flexDirection="column" rowGap={respiro(quadro)}>
            {grupos
              .slice(0, maximo)
              .map(grupo =>
                linhaDoGrupo(
                  el,
                  grupo,
                  edicoesDe(grupo.ordem),
                  comandosDoGrupo(dados.comandos, grupo),
                  quadro,
                  acoes,
                  quadro.isCompacto ? undefined : linhasCurtasDosAgentes(el, dados, agentesDoGrupo(dados.agentes, grupo), quadro, acoes, String(grupo.ordem), grupo),
                ),
              )}
            {grupos.length > maximo && (
              <Text dimColor>{`… e ${plural(grupos.length - maximo, 'turno mais antigo', 'turnos mais antigos')}, fora da lista`}</Text>
            )}
          </Box>
        )

        // Com o gráfico em cima, a lista ganha um título que dobra.
        return !quadro.isCompacto && ferramentas.length > 1 && grupos.length > 1
          ? secaoQueDobra(el, dobraDe(quadro, acoes), 'turnos:lista', { texto: 'Do mais recente ao mais antigo', cor: corDaAba(4) }, [lista], respiro(quadro))
          : lista
      })()}
    </Box>
  )
}

// O nome de um agente da sessão (ou da conversa principal), pelo id.
const nomeDoId = (dados: Dados, id: string): string => {
  const um = dados.agentes.find(outro => outro.id === id)

  return id === 'principal' ? 'Principal' : um === undefined ? `"${id}"` : um.descricao === '' ? um.tipo : um.descricao
}

// Os agentes ligados a um agente: os que ele criou (e os que esses criaram)
// e os que trocaram recados com ele. `janela`: só o que aconteceu nela (a
// tela de uma rodada: os criados e os recados dentro dela).
const ligadosAoAgente = (
  dados: Dados,
  agente: LensAgente,
  janela?: { inicio: number; fim: number },
): { criados: LensAgente[]; conversou: LensAgente[]; recados: LensMensagem[] } => {
  const isNaHora = (quando: number) => janela === undefined || isNaJanela(quando, janela)
  const descendentes = (id: string): LensAgente[] =>
    dados.agentes.filter(um => um.pai === id && isNaHora(um.inicio)).flatMap(filho => [filho, ...descendentes(filho.id)])
  const criados = descendentes(agente.id)
  const recados = dados.mensagens.filter(mensagem => (mensagem.de === agente.id || mensagem.para === agente.id) && isNaHora(mensagem.quando))
  const conversou = dados.agentes.filter(
    outro =>
      outro.id !== agente.id &&
      !criados.some(criado => criado.id === outro.id) &&
      recados.some(mensagem => mensagem.de === outro.id || mensagem.para === outro.id),
  )

  return { criados, conversou, recados }
}

// O grafo de um agente com os ligados a ele, e os cartões deles (um por
// rodada que este agente abriu), com a volta para o detalhe de onde vêm.
const redeDoAgente = (
  el: Elementos,
  dados: Dados,
  agente: LensAgente,
  ligados: ReturnType<typeof ligadosAoAgente>,
  quadro: Quadro,
  acoes: Acoes,
  volta: string,
  janela?: { inicio: number; fim: number },
): RedeVista => {
  const { criados, conversou, recados } = ligados
  const rede =
    criados.length + conversou.length === 0
      ? null
      : redeDosAgentes(el, dados, quadro, acoes, {
          agentes: [agente, ...criados, ...conversou],
          volta,
          isSemTitulo: true,
          destaque: agente.id,
          ...(janela === undefined ? {} : { mensagens: recados }),
        })
  const { cartoes, rodadas } = cartoesDosAgentes(el, dados, [...criados, ...conversou], quadro, acoes, volta, {
    tipo: 'agente',
    pai: agente,
    ...(janela === undefined ? {} : { janela }),
  })
  const quantos = criados.length + conversou.length

  return {
    rede,
    titulo: {
      texto: criados.length > 0 && conversou.length > 0 ? 'Agentes que ele criou e com quem conversou' : criados.length > 0 ? 'Agentes que ele criou' : 'Com quem ele conversou',
      contagem: rodadas > quantos ? `· ${quantos} (${plural(rodadas, 'rodada', 'rodadas')})` : `· ${quantos}`,
    },
    cartoes,
  }
}

// Os recados de um agente, postos de pé para a lista do detalhe.
const recadosVistos = (dados: Dados, agente: LensAgente, recados: readonly LensMensagem[]): RecadoVisto[] =>
  recados.map(mensagem => ({
    isEnviado: mensagem.de === agente.id,
    com: nomeDoId(dados, mensagem.de === agente.id ? mensagem.para : mensagem.de),
    quando: mensagem.quando,
    ...(mensagem.texto === undefined ? {} : { texto: mensagem.texto }),
    ...(mensagem.falha === undefined ? {} : { falha: mensagem.falha }),
  }))

const corpo = (el: Elementos, dados: Dados, quadro: Quadro, acoes: Acoes): RenderElement => {
  const foco = dados.ui.foco

  // Um item aberto em detalhe toma o lugar da lista da aba dele.
  // A tela de uma rodada de um agente: aberta do detalhe dele (ou de um cartão
  // da rodada num turno, ou dentro de outro agente). Igual ao detalhe de um
  // agente de uma rodada só, com o que aconteceu na janela dela: os agentes
  // que ela criou e os recados que trocou.
  if (foco?.tipo === 'rodada' && (dados.ui.aba === 0 || dados.ui.aba === 1 || dados.ui.aba === 4 || foco.volta !== undefined)) {
    const agente = dados.agentes.find(um => um.id === foco.id)
    const vistas = agente === undefined ? [] : rodadasVistas(agente, dados.fichas.agente, dados.mensagens, quadro.agora)
    const rodada = vistas.find(uma => uma.n === (foco.rodada ?? 1))
    const volta = voltaDoFoco(foco)
    const extras =
      agente === undefined || rodada === undefined
        ? {}
        : ((janela: { inicio: number; fim: number }) => {
            const ligados = ligadosAoAgente(dados, agente, janela)

            return { rede: redeDoAgente(el, dados, agente, ligados, quadro, acoes, volta, janela), recados: recadosVistos(dados, agente, ligados.recados) }
          })(janelaDaRodada(rodada, quadro.agora))

    return fichaDaRodada(el, agente, dados.fichas.agente, vistas, foco.rodada ?? 1, quadro, acoes, dados.agentes, foco.volta, extras)
  }

  // O detalhe de um agente: da aba Agentes, ou aberto do detalhe de um turno.
  if (foco?.tipo === 'agente' && (dados.ui.aba === 0 || dados.ui.aba === 1 || dados.ui.aba === 4 || foco.volta !== undefined)) {
    const agente = dados.agentes.find(um => um.id === foco.id)
    // A volta leva o caminho inteiro: o agente e, se ele foi aberto de um
    // turno, o turno ("agente:<id>|<turno>").
    const volta = voltaDoFoco(foco)
    // As rodadas dele e, pelo caminho de entrada, o recorte: vindo de um
    // turno, só as que começaram nele; vindo de outro agente, só as que esse
    // agente criou ou acordou; da aba Agentes (ou de uma tela geral), todas.
    const vistas = agente === undefined ? [] : rodadasVistas(agente, dados.fichas.agente, dados.mensagens, quadro.agora)
    const isEmRodadas = agente !== undefined && Math.max(rodadasDoAgente(agente), vistas.length) > 1
    // Com uma rodada só, o grafo dos ligados a ele e os recados ficam no
    // detalhe; com várias, cada rodada tem os seus (na tela dela).
    const ligados = agente === undefined || isEmRodadas ? undefined : ligadosAoAgente(dados, agente)
    const rede = agente === undefined || ligados === undefined ? undefined : redeDoAgente(el, dados, agente, ligados, quadro, acoes, volta)
    const recados = agente === undefined || ligados === undefined ? [] : recadosVistos(dados, agente, ligados.recados)
    const acima = focoDaVolta(foco.volta)
    const grupoAcima = acima?.tipo === 'turno' ? gruposDeTurnos(dados.rodadas).find(um => String(um.ordem) === acima.id) : undefined
    const paiAcima = acima?.tipo === 'agente' || acima?.tipo === 'rodada' ? dados.agentes.find(um => um.id === acima.id) : undefined
    const recorte: RecorteDasRodadas | undefined =
      agente === undefined
        ? undefined
        : grupoAcima !== undefined
          ? { tipo: 'turno', nome: `turno ${grupoAcima.ordem}`, numeros: rodadasNoTurno(agente, grupoAcima, dados.agentes) }
          : paiAcima !== undefined
            ? { tipo: 'agente', nome: nomeDoId(dados, paiAcima.id), numeros: rodadasAbertasPor(agente, dados.fichas.agente, paiAcima.id, dados.mensagens, quadro.agora) }
            : undefined
    // O mesmo agente instalado (um tipo global, do projeto ou de plugin)
    // chamado outras vezes: cada chamada é outra execução, com o seu pedido e
    // a sua resposta. Os embutidos (Explore, general-purpose) ficam de fora:
    // ali "o mesmo tipo" não quer dizer o mesmo agente.
    const outras =
      agente === undefined || escopoDo(agente, dados.inventario.itens) === 'embutido'
        ? []
        : linhasCurtasDosAgentes(
            el,
            dados,
            dados.agentes.filter(outro => outro.id !== agente.id && outro.tipo === agente.tipo),
            quadro,
            acoes,
            volta,
          ).linhas

    return fichaDoAgente(el, agente, dados.fichas.agente, quadro, acoes, dados.agentes, rede, recados, outras, {
      todas: vistas,
      ...(recorte === undefined ? {} : { recorte }),
      ...(foco.volta === undefined ? {} : { volta: foco.volta }),
    })
  }

  // Um comando: da aba Turnos, ou aberto do detalhe de um agente.
  if (foco?.tipo === 'comando' && (dados.ui.aba === 0 || dados.ui.aba === 4 || foco.volta?.startsWith('agente:') === true)) {
    const comando = dados.comandos.find(um => um.id === foco.id)

    return fichaDoComando(el, comando, dados.fichas.comando, quadro, acoes)
  }

  if (foco?.tipo === 'turno' && (dados.ui.aba === 0 || dados.ui.aba === 4)) {
    const grupo = gruposDeTurnos(dados.rodadas).find(um => String(um.ordem) === foco.id)
    const edicoes = dados.turnos.find(turno => String(turno.n) === foco.id)?.edicoes.length ?? 0
    const doTurno = grupo === undefined ? [] : comandosDoGrupo(dados.comandos, grupo)
    const linhas = doTurno.map(comando => linhaDoComando(el, comando, quadro, acoes, { volta: foco.id }))

    const subagentes = grupo === undefined ? null : subagentesDoTurno(el, dados, grupo, quadro, acoes)

    return fichaDoTurno(el, grupo, dados.fichas.turnos ?? [], dados.agentes, edicoes, linhas, subagentes, quadro, acoes)
  }

  if (dados.ui.aba === 0) {
    // O grafo sem os controles (o zoom, o filtro e o Ampliar ficam na aba Agentes).
    // Sem agentes, o grafo aparece enquanto a conversa principal trabalha: o
    // cérebro sozinho, pensando, mostra que o Claude está trabalhando.
    const isPensando = dados.rodadas.some(rodada => rodada.duracaoMs === undefined)
    const grafo =
      dados.agentes.length === 0 && !isPensando ? null : redeDosAgentes(el, dados, quadro, acoes, { isSemTitulo: true })
    // Os agentes que o último turno chamou, cada um numa linha (o cartão
    // inteiro, com o pedido e a resposta, fica no turno e na aba Agentes).
    const ultimo = gruposDeTurnos(dados.rodadas).reduce<Grupo | undefined>(
      (maior, grupo) => (maior === undefined || grupo.ordem > maior.ordem ? grupo : maior),
      undefined,
    )
    const criadosNoUltimo = ultimo === undefined ? [] : agentesDoGrupo(dados.agentes, ultimo)
    // No contexto do turno: uma linha por rodada que foi nele, que abre a rodada.
    const agentesDoUltimo = linhasCurtasDosAgentes(el, dados, criadosNoUltimo, quadro, acoes, ultimo === undefined ? undefined : String(ultimo.ordem), ultimo)

    return abaVisaoGeral(el, dados, quadro, acoes, grafo, agentesDoUltimo, agentesDisponiveis(el, dados, quadro, acoes))
  }

  if (dados.ui.aba === 1) {
    return abaAgentes(el, dados, quadro, acoes)
  }

  if (dados.ui.aba === 2) {
    return abaDiffs(el, dados, quadro, acoes)
  }

  if (dados.ui.aba === 3) {
    return abaContexto(el, dados, quadro, acoes)
  }

  if (dados.ui.aba === 5) {
    return abaArvore(el, dados, quadro, acoes)
  }

  if (dados.ui.aba === 6) {
    return abaInventario(el, dados, quadro, acoes)
  }

  return abaTurnos(el, dados, quadro, acoes)
}

// A cor de cada selo da linha de resumo: contexto e limite pelo nível, o resto
// fixo; os agentes acendem enquanto algum está rodando.
const tomDoSegmento = (segmento: Segmento): Tom => {
  if (segmento.chave === 'contexto') {
    return TONS[tomDoNivel(segmento.nivel ?? 0)]
  }

  if (segmento.chave === 'limite') {
    return (segmento.nivel ?? 0) >= 80 ? TONS.vermelho : TONS.roxo
  }

  if (segmento.chave === 'agentes') {
    return (segmento.rodando ?? 0) > 0 ? TONS.ciano : TONS.cinza
  }

  return TONS.ciano
}

const CELULAS_DA_BARRA = 8

// O texto do valor de um selo, sem o rótulo: o que ocupa de largura.
const textoDoValor = (segmento: Segmento): string =>
  [
    segmento.valor,
    segmento.chave === 'contexto' ? '━'.repeat(CELULAS_DA_BARRA) : undefined,
    segmento.complemento,
    segmento.extra === undefined ? undefined : `(${segmento.extra})`,
  ]
    .filter((parte): parte is string => parte !== undefined)
    .join(' ')

// Um selo de duas cores: o rótulo num cinza escuro e o valor na cor da parte.
// No contexto, uma barrinha e os tokens; entre parênteses o que o último turno
// somou. Sem `comRotulo`, só o valor.
const seloDoSegmento = (
  el: Pick<Elementos, 'Text'>,
  segmento: Segmento,
  comRotulo: boolean,
): RenderElement => {
  const { Text } = el
  const tom = tomDoSegmento(segmento)
  const cheias =
    segmento.chave === 'contexto'
      ? limitar(Math.round(((segmento.nivel ?? 0) / 100) * CELULAS_DA_BARRA), 0, CELULAS_DA_BARRA)
      : undefined
  const pinta = { backgroundColor: tom.fundo, color: tom.tinta }

  return (
    <Text>
      {comRotulo && (
        <Text backgroundColor={TONS.rotulo.fundo} color={TONS.rotulo.tinta}>
          {` ${segmento.rotulo} `}
        </Text>
      )}
      <Text {...pinta} bold>{` ${segmento.valor}`}</Text>
      {cheias !== undefined && <Text {...pinta}>{` ${'━'.repeat(cheias)}`}</Text>}
      {cheias !== undefined && (
        <Text {...pinta} dimColor>
          {'━'.repeat(CELULAS_DA_BARRA - cheias)}
        </Text>
      )}
      {segmento.complemento !== undefined && <Text {...pinta}>{` ${segmento.complemento}`}</Text>}
      {segmento.extra !== undefined && <Text {...pinta}>{` (${segmento.extra})`}</Text>}
      <Text {...pinta}>{' '}</Text>
    </Text>
  )
}

// O resumo da sessão numa fileira de selos coloridos, na faixa acima do
// prompt: o que antes era a status line do Claude Code. `abaixo` é o que já
// estava na faixa. Sem largura para tudo numa linha, os selos perdem os
// rótulos e a marca encurta; só então descem para a linha de baixo.
export const linhaDeResumo = (
  el: Pick<Elementos, 'Box' | 'Text'>,
  segmentos: readonly Segmento[],
  abaixo: RenderElement,
  largura: number,
): RenderElement => {
  const { Box } = el
  // O valor de cada selo com os espaços dele e o espaço até o selo seguinte.
  const valores = segmentos.reduce((soma, segmento) => soma + textoDoValor(segmento).length + 3, 0)
  const rotulos = segmentos.reduce((soma, segmento) => soma + segmento.rotulo.length + 2, 0)
  // Três degraus: tudo; a marca curta; a marca curta e sem os rótulos. Uma
  // coluna de folga, para a última não encostar na borda.
  const cabe = largura - 1
  const isMarcaInteira = ' ✦ Lens '.length + valores + rotulos <= cabe
  const comRotulo = isMarcaInteira || ' ✦ '.length + valores + rotulos <= cabe

  return (
    <Box flexDirection="column">
      {abaixo}
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {/* A linha em texto (do terminal): o selo também em texto. */}
        {seloDaMarca({ Box: el.Box, Text: el.Text }, !isMarcaInteira)}
        {segmentos.map(segmento => seloDoSegmento(el, segmento, comRotulo))}
      </Box>
    </Box>
  )
}

// A linha de resumo no Desktop: as pílulas num SVG só. Interativo, para a
// dica de cada pílula aparecer ao passar o mouse.

// As pílulas no Desktop: um SVG só e, em cima do repositório e do contexto, um
// botão invisível que abre a aba do painel que fala deles.
export const linhaDePilulas = (
  el: Pick<Elementos, 'Box' | 'Button'> & { Svg: ElementConstructor<SvgProps> },
  desenho: Desenho & { areas: readonly AreaClicavel[] },
  abaixo: RenderElement,
  abrir: (aba: LensAba) => void,
): RenderElement => {
  const { Box, Button, Svg } = el

  return (
    <Box flexDirection="column">
      {abaixo}
      <Box key="pilulas">
        <Svg source={desenho.source} alt={desenho.alt} width={desenho.width} height={desenho.height} isInteractive />
        {desenho.areas.map(area => (
          <Box
            key={`area-${area.chave}`}
            position="absolute"
            top={Math.floor((area.y + 10) / PIXELS_POR_LINHA)}
            // Uma coluna para dentro de cada lado: o botão do app soma um
            // recuo ao rótulo, e do tamanho da pílula ele cobria a vizinha.
            left={Math.round(area.x / PIXELS_POR_COLUNA) + 1}
          >
            <Button
              key={`abrir-${area.chave}`}
              label={ESPACO_DO_BOTAO.repeat(Math.max(2, Math.round(area.width / PIXELS_POR_COLUNA) - 2))}
              plain
              onPress={() => abrir(area.aba)}
            />
          </Box>
        ))}
      </Box>
    </Box>
  )
}

// O caminho de onde a pessoa está, logo abaixo das abas, na mesma linha do
// Voltar: a aba e, num detalhe, cada nível de onde ele foi aberto (o turno, o
// agente, a rodada, o comando), como a volta encadeada os guarda. Cada parte,
// menos a última, é um botão que leva àquele nível; a última, em negrito na
// cor da aba, é onde se está (um turno aberto da Visão geral fica "Visão
// geral › Turno 2"). Na versão compacta, só quando há um detalhe aberto.
const caminho = (el: Elementos, dados: Dados, quadro: Quadro, acoes: Acoes): RenderElement | null => {
  const { Box, Button, Text } = el
  const foco = dados.ui.foco
  const aba = ABAS.find(uma => uma.n === dados.ui.aba)

  if (aba === undefined || (quadro.isCompacto && foco === undefined)) {
    return null
  }

  const cor = TONS[aba.tom].fundo
  const nomeDoAgente = (id: string): string => {
    const agente = dados.agentes.find(um => um.id === id)

    return agente === undefined ? `agente ${id.slice(0, 6)}` : agente.descricao === '' ? agente.tipo : agente.descricao
  }
  const rotulo = (nivel: LensFoco): string => {
    if (nivel.tipo === 'turno') {
      return `Turno ${nivel.id}`
    }

    if (nivel.tipo === 'agente') {
      return curto(nomeDoAgente(nivel.id), 40)
    }

    if (nivel.tipo === 'rodada') {
      return `Rodada ${nivel.rodada ?? 1}`
    }

    const comando = dados.comandos.find(um => um.id === nivel.id)

    return comando === undefined ? 'Comando' : curto(`Bash ${umaLinha(semRaiz(comando.comando, quadro.raiz))}`, 32)
  }
  const niveis = foco === undefined ? [] : cadeiaDoFoco(foco)
  const partes: { chave: string; texto: string; abrir?: () => void }[] = [
    { chave: 'caminho-aba', texto: `${aba.icone} ${aba.nome}`, ...(foco === undefined ? {} : { abrir: () => acoes.aba(aba.n) }) },
    ...niveis.map((nivel, i) => ({
      chave: `caminho-${i}`,
      texto: rotulo(nivel),
      ...(i === niveis.length - 1 ? {} : { abrir: () => acoes.abrir(nivel) }),
    })),
  ]

  return (
    <Box key="caminho" flexDirection="row" flexWrap="wrap" columnGap={1} marginTop={quadro.isCompacto ? 0 : 1}>
      {/* O Voltar sobe um nível do caminho (o detalhe volta para onde foi
          aberto); está aqui, e não em cada ficha, para ficar sempre no mesmo
          lugar, junto do caminho. */}
      {foco !== undefined && (
        <Box key="caminho-voltar" flexShrink={0} marginRight={1}>
          <Button key="voltar" label={comTecla(quadro, '‹ Voltar', 'v')} hotkey="v" onPress={acoes.voltar} />
        </Box>
      )}
      {partes.map((parte, i) => (
        <Box key={`caminho-caixa-${i}`} flexDirection="row" columnGap={1} flexShrink={0}>
          {i > 0 && <Text color={cor}>›</Text>}
          {parte.abrir === undefined ? (
            <Box key="caminho-atual" flexShrink={0}>
              <Text bold color={cor}>{parte.texto}</Text>
            </Box>
          ) : (
            <Button key={parte.chave} label={parte.texto} plain dimColor hover={{ underline: true, color: cor }} onPress={parte.abrir} />
          )}
        </Box>
      ))}
    </Box>
  )
}

export const desenhar = (
  el: Elementos,
  dados: Dados,
  quadro: Quadro,
  acoes: Acoes,
): RenderElement => {
  const { Box, Text } = el
  const resumo = dados.resumo
  // Os títulos de todas as seções na cor da aba aberta.
  const tomDaAba = ABAS.find(aba => aba.n === dados.ui.aba)?.tom
  const quadroDaAba: Quadro = tomDaAba === undefined ? quadro : { ...quadro, tomDaAba }

  // Uma coluna de margem à direita: a moldura dos cartões não encosta na borda do painel.
  return (
    <Box flexDirection="column" rowGap={respiro(quadro)} paddingRight={quadro.isCompacto ? 0 : 1}>
      <Box flexDirection="column">
        {!quadro.isCompacto && (
          <Box flexDirection="row" columnGap={2} marginBottom={1}>
            {seloDaMarca(el)}
            {/* Na Visão geral, os indicadores logo abaixo já dizem o mesmo. */}
            {!(dados.ui.aba === 0 && dados.ui.foco === undefined) && (
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text dimColor wrap="truncate-end">{resumo}</Text>
              </Box>
            )}
          </Box>
        )}
        {abas(el, dados, quadroDaAba, acoes)}
        {/* No Desktop o ─ é mais largo que uma coluna e a régua quebrava em duas linhas. */}
        {!quadro.isCompacto && quadro.isTerminal && regua(el, limitar(quadro.largura - 1, 10, 200), corDaAba(dados.ui.aba))}
        {caminho(el, dados, quadroDaAba, acoes)}
      </Box>
      {corpo(el, dados, quadroDaAba, acoes)}
    </Box>
  )
}
