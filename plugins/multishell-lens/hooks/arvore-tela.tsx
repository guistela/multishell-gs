// O desenho da aba Árvore. A linguagem visual vem do claude-code-filetree:
// pasta aberta ▾ e fechada ▸, ■ para pasta e · para arquivo, a letra do git
// colorida à direita (M amarelo, A e ? verde, R azul, D vermelho), as linhas
// +N −N e, nas pastas, a soma do que há embaixo. A mais: o arquivo que uma
// ferramenta está lendo ou escrevendo acende enquanto ela roda.

import type { RenderElement } from 'claude-code'

import type { LensGit, LensToque } from '../types'
import { RECENTE_MS, linhasDaArvore, montarArvore } from './arvore'
import type { NoDaArvore } from './arvore'
import { COR, tomDaCor } from './cores'
import { faixaDoRamo } from './graficos'
import { PIXELS_POR_COLUNA, curtoNoMeio, duracaoViva, limitar, plural, relativo } from './formato'
import { comTecla, secao, selo } from './pecas'
import type { Acoes, Dados, Elementos, Quadro } from './telas'

// As cores do git, com o sentido das do VS Code (e do claude-code-filetree),
// em chaves do tema: amarelo alterado, verde novo, azul renomeado, vermelho
// apagado; legíveis no tema claro e no escuro.
export const COR_DO_GIT: Readonly<Record<string, string>> = {
  A: COR.verde,
  '?': COR.verde,
  M: COR.ambar,
  T: COR.ambar,
  R: COR.azul,
  C: COR.azul,
  D: COR.vermelho,
  U: COR.vermelho,
}

const COR_DA_PASTA = 'ide'
// As letras do git somadas nas pastas, por tipo de mudança: o número na cor
// dele, sem a letra ("?:7 M:49" não se lia). A legenda da aba diz as cores.
const TIPOS_DE_MUDANCA: readonly { letras: readonly string[]; glifo: string; cor: string; nome: string }[] = [
  { letras: ['?', 'A'], glifo: '●', cor: COR.verde, nome: 'novo' },
  { letras: ['M', 'T'], glifo: '●', cor: COR.ambar, nome: 'modificado' },
  { letras: ['R', 'C'], glifo: '●', cor: COR.azul, nome: 'renomeado' },
  { letras: ['D'], glifo: '●', cor: COR.vermelho, nome: 'apagado' },
  { letras: ['U'], glifo: '!', cor: COR.vermelho, nome: 'em conflito' },
]
// O pontilhado do nome até os números: só guia o olho, quase some.
const COR_DOS_PONTOS = 'subtle'
const MAX_LINHAS = 250
// Abaixo disto, o selo "editando…" sai da linha do arquivo: o ◉ colorido já
// diz o mesmo, e o nome precisa do lugar.
const LARGURA_DO_SELO = 70
// O ramo nunca encurta além disto, nem num painel apertado.
const RAMO_MINIMO = 12

// O que a ferramenta faz no arquivo agora, e a cor disso: laranja escreve,
// roxo lê.
const corDaAcao = (acao: 'lendo' | 'editando' | 'lido' | 'editado' | 'criado'): string =>
  acao === 'lendo' || acao === 'lido' ? COR.roxo : COR.laranja

// Um pedaço da coluna da direita: as linhas, as letras do git, o "lido N×".
// Em texto, para a largura dele entrar na conta do que sobra para o nome.
type Pedaco = { texto: string; cor?: string; isNegrito?: boolean; isApagado?: boolean }

const pedacosDasLetras = (letras: Readonly<Record<string, number>>): Pedaco[] =>
  TIPOS_DE_MUDANCA.map(tipo => ({ tipo, n: tipo.letras.reduce((soma, letra) => soma + (letras[letra] ?? 0), 0) }))
    .filter(({ n }) => n > 0)
    .map(({ tipo, n }) => ({ texto: ` ${tipo.glifo}${n}`, cor: tipo.cor }))

const pedacosDasLinhas = (mais: number, menos: number): Pedaco[] => [
  ...(mais > 0 ? [{ texto: ` +${mais}`, cor: COR.verde }] : []),
  ...(menos > 0 ? [{ texto: ` −${menos}`, cor: COR.vermelho }] : []),
]

const larguraDos = (pedacos: readonly Pedaco[]): number =>
  pedacos.reduce((soma, pedaco) => soma + [...pedaco.texto].length, 0)

// A coluna da direita numa Box que não encolhe: as contas nunca quebram em
// duas linhas; é o nome, à esquerda, que perde o fim quando falta lugar.
const colunaDaDireita = (el: Elementos, pedacos: readonly Pedaco[]): RenderElement => {
  const { Box, Text } = el

  return (
    <Box flexShrink={0}>
      <Text>
        {pedacos.map(pedaco => (
          <Text
            {...(pedaco.cor === undefined ? {} : { color: pedaco.cor })}
            {...(pedaco.isNegrito === true ? { bold: true } : {})}
            {...(pedaco.isApagado === true ? { dimColor: true } : {})}
          >
            {pedaco.texto}
          </Text>
        ))}
      </Text>
    </Box>
  )
}

// A marca à direita do nome: o que está acontecendo agora, ou há pouco. Num
// painel estreito, o que acontece agora fica só no ◉ colorido do nome.
// Quantas colunas a marca de um arquivo ocupa (a mesma conta de marcaDoToque).
const larguraDaMarca = (toque: LensToque | undefined, agora: number, isEstreito: boolean): number => {
  if (toque === undefined) {
    return 0
  }

  if (toque.agora !== undefined) {
    return isEstreito ? 0 : [...(toque.agora === 'lendo' ? 'lendo…' : 'editando…')].length + 2
  }

  return toque.ultimo !== undefined && agora - toque.quando < RECENTE_MS
    ? [...` ${toque.ultimo} há ${duracaoViva(agora - toque.quando)}`].length
    : 0
}

const marcaDoToque = (
  el: Elementos,
  toque: LensToque | undefined,
  agora: number,
  isEstreito: boolean,
): RenderElement | null => {
  const { Text } = el

  if (toque === undefined) {
    return null
  }

  if (toque.agora !== undefined) {
    return isEstreito
      ? null
      : selo(el, toque.agora === 'lendo' ? 'lendo…' : 'editando…', toque.agora === 'lendo' ? 'roxo' : 'laranja')
  }

  if (toque.ultimo !== undefined && agora - toque.quando < RECENTE_MS) {
    return <Text color={corDaAcao(toque.ultimo)}>{` ${toque.ultimo} há ${duracaoViva(agora - toque.quando)}`}</Text>
  }

  return null
}

const linhaDoNo = (
  el: Elementos,
  no: NoDaArvore,
  nivel: number,
  aberta: boolean,
  quadro: Quadro,
  acoes: Acoes,
): RenderElement => {
  const { Box, Button, Text } = el
  const guia = '│ '.repeat(nivel)
  const toque = no.toque
  const letra = no.git?.letra
  const isRecente = toque !== undefined && quadro.agora - toque.quando < RECENTE_MS
  const acao = toque?.agora ?? (isRecente ? toque?.ultimo : undefined)
  const isPasta = no.tipo === 'pasta'
  const corDoNome =
    acao !== undefined
      ? corDaAcao(acao)
      : letra !== undefined
        ? COR_DO_GIT[letra]
        : isPasta && no.soma.agora !== undefined
          ? corDaAcao(no.soma.agora)
          : toque !== undefined && toque.editado > 0
            ? COR.laranja
            : undefined
  const glifo = isPasta ? '■' : toque?.agora !== undefined ? '◉' : '·'
  const corDoGlifo = isPasta
    ? no.soma.agora === undefined
      ? COR_DA_PASTA
      : corDaAcao(no.soma.agora)
    : (corDoNome ?? COR.cinza)
  const isApagado = letra === 'D'
  const mais = isPasta ? no.soma.mais : (no.git?.mais ?? toque?.mais ?? 0)
  const menos = isPasta ? no.soma.menos : (no.git?.menos ?? toque?.menos ?? 0)
  // Só lido: nenhum git, nenhuma escrita e nada acontecendo nele agora.
  const soLido =
    !isPasta &&
    letra === undefined &&
    toque !== undefined &&
    toque.editado === 0 &&
    toque.agora === undefined &&
    toque.lido > 0
  // O selo fica fora do texto que trunca: "editando…" inteiro, nunca "e…".
  const marca = isPasta ? null : marcaDoToque(el, toque, quadro.agora, quadro.largura < LARGURA_DO_SELO)
  const direita: Pedaco[] = [
    ...pedacosDasLinhas(mais, menos),
    ...(isPasta ? pedacosDasLetras(no.soma.letras) : []),
    ...(!isPasta && letra !== undefined ? [{ texto: ` ${letra}`, cor: COR_DO_GIT[letra], isNegrito: true }] : []),
    ...(soLido ? [{ texto: ` lido ${toque.lido}×`, isApagado: true }] : []),
  ]
  // Um pontilhado do nome do arquivo até o que aconteceu com ele, à direita.
  // No terminal, os pontos que cabem no que sobra da linha (o recuo, a marca,
  // as contas e as folgas fora); no app, de letra proporcional, pontos de
  // sobra, que o texto corta no fim da linha. O nome fica sempre inteiro.
  const temPontos = !isPasta && (marca !== null || direita.length > 0)
  // No app, o pontilhado vai numa caixa própria que cresce até o que está à
  // direita e corta o que sobra (uma linha só, sem "…"): chega até o número.
  const isPontosNaCaixa = temPontos && !quadro.isTerminal
  const pontos =
    !temPontos || isPontosNaCaixa
      ? 0
      : Math.floor(
          (quadro.largura -
            [...guia].length -
            4 -
            [...no.nome].length -
            larguraDaMarca(toque, quadro.agora, quadro.largura < LARGURA_DO_SELO) -
            larguraDos(direita) -
            (marca === null ? 1 : 2) -
            4) /
            2,
        )

  return (
    <Box key={`no-${no.caminho}`} flexDirection="row" columnGap={1}>
      <Box flexDirection="row" flexGrow={isPontosNaCaixa ? 0 : 1} flexShrink={1} minWidth={0}>
        {/* O recuo nunca encolhe: o que corta é o fim do nome (e o pontilhado). */}
        {nivel > 0 && (
          <Box flexShrink={0}>
            <Text dimColor>{guia}</Text>
          </Box>
        )}
        {isPasta ? (
          <Button
            key={`pasta-${no.caminho}`}
            label={aberta ? '▾' : '▸'}
            plain
            dimColor
            onPress={() => acoes.pasta(no.caminho, aberta)}
          />
        ) : (
          <Text>{' '}</Text>
        )}
        {isPasta && <Text color={corDoGlifo}>{` ${glifo} `}</Text>}
        {isPasta && (
          // O nome da pasta também abre e fecha, e não só a setinha.
          <Button
            key={`nome-da-pasta-${no.caminho}`}
            label={no.nome}
            plain
            hover={{ underline: true, color: corDoNome ?? COR_DA_PASTA, bold: true }}
            onPress={() => acoes.pasta(no.caminho, aberta)}
          />
        )}
        <Text wrap="truncate-end">
          {!isPasta && <Text color={corDoGlifo}>{` ${glifo} `}</Text>}
          {!isPasta && (
            <Text
              {...(corDoNome === undefined ? {} : { color: corDoNome })}
              bold={acao !== undefined}
              strikethrough={isApagado}
              dimColor={soLido && !isRecente}
            >
              {no.nome}
            </Text>
          )}
          {pontos > 0 && <Text color={COR_DOS_PONTOS} dimColor>{` ${'. '.repeat(pontos)}`}</Text>}
          {isPasta && no.soma.agora !== undefined && !aberta && (
            <Text color={corDaAcao(no.soma.agora)}>{` ◉ ${no.soma.agora}…`}</Text>
          )}
        </Text>
      </Box>
      {isPontosNaCaixa && (
        // Largura de partida zero: a caixa só pega a sobra, sem apertar o nome.
        <Box width={0} flexGrow={1} flexShrink={1} minWidth={2} height={1} overflow="hidden">
          <Text color={COR_DOS_PONTOS} dimColor wrap="wrap">{'. '.repeat(Math.max(8, quadro.largura))}</Text>
        </Box>
      )}
      {marca !== null && <Box flexShrink={0}>{marca}</Box>}
      {colunaDaDireita(el, direita)}
    </Box>
  )
}

// A linha do ramo: ⑂ main ↑1 ↓2 origin/main, ou o aviso de que não há git. Um
// ramo comprido perde o meio, nunca as setas: são elas que dizem alguma coisa.
const linhaDoRamo = (el: Elementos, git: LensGit, raiz: NoDaArvore, quadro: Quadro): RenderElement => {
  const { Box, Text } = el

  if (!git.isRepo) {
    return <Text dimColor>± sem repositório git · só os arquivos tocados na sessão</Text>
  }

  const contas: Pedaco[] =
    git.arquivos.length === 0
      ? [{ texto: ' limpo', isApagado: true }]
      : [...pedacosDasLinhas(raiz.soma.mais, raiz.soma.menos), ...pedacosDasLetras(raiz.soma.letras)]
  const setas = `${(git.frente ?? 0) > 0 ? ` ↑${git.frente}` : ''}${(git.atras ?? 0) > 0 ? ` ↓${git.atras}` : ''}`
  // O que sobra para o ramo: a largura menos o ⑂, as setas, as contas e as folgas.
  const sobra = quadro.largura - 2 - [...setas].length - larguraDos(contas) - 2
  const ramo = curtoNoMeio(git.ramo ?? 'HEAD', Math.max(RAMO_MINIMO, sobra))
  // O remoto vem depois, no que sobrar; sem lugar que preste, sai.
  const sobraDoRemoto = sobra - [...ramo].length - 1
  const remoto =
    git.remoto === undefined || sobraDoRemoto < RAMO_MINIMO ? undefined : curtoNoMeio(git.remoto, sobraDoRemoto)

  // No app, a linha do ramo em destaque, desenhada: o nome em letra grande.
  if (el.Svg !== null && !quadro.isTerminal && !quadro.isCompacto) {
    // A letra do desenho é maior (~11 px) que uma coluna do painel (7,4 px):
    // o ramo perde o meio antes, e o remoto só vai se sobrar lugar.
    const larguraEmPixels = (quadro.largura - 2) * PIXELS_POR_COLUNA
    const letras = Math.floor((larguraEmPixels - larguraDos(contas) * 9 - [...setas].length * 10 - 40) / 11)
    const nomeCurto = curtoNoMeio(git.ramo ?? 'HEAD', Math.max(RAMO_MINIMO, letras))
    const sobraParaRemoto = letras - [...nomeCurto].length - 2
    const remotoCurto =
      git.remoto === undefined || sobraParaRemoto < RAMO_MINIMO ? undefined : curtoNoMeio(git.remoto, sobraParaRemoto)
    const desenho = faixaDoRamo(
      {
        nome: nomeCurto,
        frente: git.frente ?? 0,
        atras: git.atras ?? 0,
        ...(remotoCurto === undefined ? {} : { remoto: remotoCurto }),
        contas: contas.map(conta => ({
          texto: conta.texto,
          ...(conta.cor === undefined ? {} : { cor: tomDaCor(conta.cor).fundo }),
        })),
      },
      (quadro.largura - 2) * PIXELS_POR_COLUNA,
    )

    return (
      <el.Svg
        source={desenho.source}
        alt={`Ramo ${nomeCurto}${setas}${remotoCurto === undefined ? '' : ` ${remotoCurto}`} ·${contas.map(conta => conta.texto).join('')}`}
        width={desenho.width}
        height={desenho.height}
      />
    )
  }

  return (
    <Box flexDirection="row" columnGap={1}>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          <Text color={COR.roxo}>{'⑂ '}</Text>
          <Text bold>{ramo}</Text>
          {(git.frente ?? 0) > 0 && <Text color={COR.verde}>{` ↑${git.frente}`}</Text>}
          {(git.atras ?? 0) > 0 && <Text color={COR.ambar}>{` ↓${git.atras}`}</Text>}
          {remoto !== undefined && <Text dimColor>{` ${remoto}`}</Text>}
        </Text>
      </Box>
      {colunaDaDireita(el, contas)}
    </Box>
  )
}

export const abaArvore = (
  el: Elementos,
  dados: Dados,
  quadro: Quadro,
  acoes: Acoes,
): RenderElement => {
  const { Box, Button, Text } = el
  const isToda = dados.ui.isArvoreToda === true
  const raiz = montarArvore({
    raiz: quadro.raiz,
    toques: dados.arvore.toques,
    git: dados.arvore.git,
    pastas: dados.arvore.pastas,
    isToda,
    agora: quadro.agora,
  })
  const linhas = linhasDaArvore(raiz, dados.ui)
  const vivos = dados.arvore.toques.filter(toque => toque.agora !== undefined)
  const maximo = quadro.isCompacto ? 4 : MAX_LINHAS
  const cor = COR.laranja
  const tocados = dados.arvore.toques.length
  const alterados = dados.arvore.git.arquivos.length

  // O "◉ editando" não encolhe; o caminho é que perde o começo quando falta lugar.
  const agoraMesmo = vivos.slice(0, 3).map(toque => (
    <Box key={`agora-${toque.caminho}`} flexDirection="row">
      <Box flexShrink={0}>
        <Text color={corDaAcao(toque.agora ?? 'lendo')}>{`◉ ${toque.agora} `}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-start">
          <Text bold>{relativo(toque.caminho, quadro.raiz)}</Text>
          <Text dimColor>{` · há ${duracaoViva(quadro.agora - toque.quando)} · ${toque.quem.at(-1) ?? ''}`}</Text>
        </Text>
      </Box>
    </Box>
  ))

  return (
    <Box key="arvore" flexDirection="column" rowGap={quadro.isCompacto ? 0 : 1}>
      <Box flexDirection="column">
        {secao(
          el,
          raiz.nome === '' ? 'Árvore' : raiz.nome,
          cor,
          `· ${plural(tocados, 'tocado', 'tocados')} na sessão · ${plural(alterados, 'alterado', 'alterados')} no git`,
          quadro.isTerminal || quadro.isCompacto ? undefined : quadro.largura,
          quadro.tomDaAba,
        )}
        {!quadro.isCompacto && (
          <Text dimColor wrap="wrap">
            O que a sessão leu e editou (acende ao vivo enquanto o Claude lê ou escreve) e o que o git vê alterado.
          </Text>
        )}
        {linhaDoRamo(el, dados.arvore.git, raiz, quadro)}
      </Box>
      {!quadro.isCompacto && (
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Button key="arvore-git" label={comTecla(quadro, '↻ Atualizar', 'g')} hotkey="g" onPress={acoes.atualizarArvore} />
          <Button
            key="arvore-toda"
            label={comTecla(quadro, isToda ? 'Só tocados e alterados' : 'Projeto inteiro', 'a')}
            hotkey="a"
            onPress={acoes.arvoreToda}
          />
          <Button key="arvore-expandir" label={comTecla(quadro, 'Expandir tudo', 'x')} hotkey="x" onPress={acoes.expandir} />
          <Button key="arvore-recolher" label={comTecla(quadro, 'Recolher tudo', 'r')} hotkey="r" onPress={acoes.recolher} />
        </Box>
      )}
      {/* A legenda das cores das contas das pastas, logo antes da árvore. */}
      {!quadro.isCompacto && (
        <Text dimColor wrap="wrap">
          {TIPOS_DE_MUDANCA.slice(0, 4).map((tipo, i) => (
            <Text key={`legenda-${tipo.nome}`}>
              {i > 0 && <Text>{' · '}</Text>}
              <Text color={tipo.cor}>{`${tipo.glifo} ${tipo.nome}`}</Text>
            </Text>
          ))}
        </Text>
      )}
      {vivos.length > 0 && <Box flexDirection="column">{agoraMesmo}</Box>}
      <Box flexDirection="column">
        {linhas.length === 0 && (
          <Text dimColor>
            {isToda ? 'Carregando a pasta do projeto…' : 'Nenhum arquivo tocado na sessão nem alterado no git.'}
          </Text>
        )}
        {linhas
          .slice(0, maximo)
          .map(linha => linhaDoNo(el, linha.no, linha.nivel, linha.isAberta, quadro, acoes))}
        {linhas.length > maximo && (
          <Text dimColor>{`… mais ${plural(linhas.length - maximo, 'linha', 'linhas')}`}</Text>
        )}
      </Box>
      {!quadro.isCompacto && (
        <Text dimColor wrap="wrap">
          <Text color={COR.laranja}>◉</Text>
          {' editando  '}
          <Text color={COR.roxo}>◉</Text>
          {' lendo  '}
          <Text color={COR_DO_GIT.M}>M</Text>
          {' modificado  '}
          <Text color={COR_DO_GIT.A}>A ?</Text>
          {' novo  '}
          <Text color={COR_DO_GIT.D}>D</Text>
          {' apagado  '}
          <Text color={COR_DO_GIT.R}>R</Text>
          {` renomeado · acesos por ${limitar(RECENTE_MS / 1000, 1, 60)}s`}
        </Text>
      )}
    </Box>
  )
}
