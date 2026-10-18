// O desenho da aba Diffs, no jeito do VS Code e do Cursor: à esquerda, os
// arquivos alterados numa árvore (letra M/A/D colorida, +N −N, o escolhido
// em destaque); à direita, o diff dele no elemento Code, com o realce de
// sintaxe e as margens de número do próprio Claude Code. Sem largura para os
// dois lado a lado, a lista vai em cima e o diff embaixo.

import type { RenderElement } from 'claude-code'

import { COR_DO_GIT } from './arvore-tela'
import { COR, TONS } from './cores'
import { desenharDiff } from './diff-svg'
import {
  arquivoEscolhido,
  arquivosAlterados,
  diffDaEdicao,
  fonteDe,
  listaEmArvore,
  turnoEmVista,
  turnosComEdicoes,
} from './diffs-lista'
import type { ArquivoAlterado, FonteDoDiff, LinhaDaLista } from './diffs-lista'
import { PIXELS_POR_COLUNA, curtoNoMeio, limitar, plural, relativo } from './formato'
import { cartao, comMoldura, comTecla, secao, selo } from './pecas'
import type { Acoes, Dados, Elementos, Quadro } from './telas'

// A cor da seleção do VS Code, com a tinta clara por cima.
const SELECAO = TONS.selecao.fundo
const TINTA_DA_SELECAO = TONS.selecao.tinta
const COR_DOS_DIFFS = COR.verde
// Abaixo disto, a lista vai em cima do diff.
const LARGURA_LADO_A_LADO = 90
// O nome de um arquivo da lista nunca encurta além disto.
const NOME_MINIMO = 8

const corDaLetra = (letra: string): string => COR_DO_GIT[letra] ?? COR.cinza

const NOMES_DAS_LETRAS: Readonly<Record<string, string>> = {
  M: 'alterado',
  A: 'novo',
  '?': 'não rastreado',
  D: 'apagado',
  R: 'renomeado',
  C: 'copiado',
  U: 'em conflito',
  T: 'tipo mudou',
}

// As contas em texto, para a largura delas entrar na conta do que sobra para o nome.
const textoDasContas = (arquivo: ArquivoAlterado): string =>
  `${arquivo.mais > 0 ? ` +${arquivo.mais}` : ''}${arquivo.menos > 0 ? ` −${arquivo.menos}` : ''}`

const contas = (el: Elementos, arquivo: ArquivoAlterado): RenderElement => {
  const { Text } = el

  return (
    <Text>
      {arquivo.mais > 0 && <Text color={COR.verde}>{` +${arquivo.mais}`}</Text>}
      {arquivo.menos > 0 && <Text color={COR.vermelho}>{` −${arquivo.menos}`}</Text>}
    </Text>
  )
}

// Quantas células tem a barrinha do quanto entrou e saiu.
const CELULAS_DA_PROPORCAO = 12

// Uma barrinha fina da proporção de linhas que entraram (verde) e saíram
// (vermelho). Os cinco quadradinhos do GitHub, aqui, mais pareciam enfeite:
// a barra contínua lê-se de relance como "quase tudo entrou" ou "meio a meio".
export const proporcao = (el: Pick<Elementos, 'Text'>, mais: number, menos: number): RenderElement | null => {
  const { Text } = el
  const total = mais + menos

  if (total === 0) {
    return null
  }

  // Um lado que existe nunca some de todo: ganha pelo menos uma célula.
  const verdes =
    mais === 0
      ? 0
      : menos === 0
        ? CELULAS_DA_PROPORCAO
        : limitar(Math.round((mais / total) * CELULAS_DA_PROPORCAO), 1, CELULAS_DA_PROPORCAO - 1)

  return (
    <Text>
      <Text>{'  '}</Text>
      {verdes > 0 && <Text color={COR.verde}>{'━'.repeat(verdes)}</Text>}
      {verdes < CELULAS_DA_PROPORCAO && <Text color={COR.vermelho}>{'━'.repeat(CELULAS_DA_PROPORCAO - verdes)}</Text>}
    </Text>
  )
}

const linhaDaLista = (
  el: Elementos,
  linha: LinhaDaLista,
  escolhido: string | undefined,
  // As colunas de dentro da lista, para o nome caber ao lado das contas.
  colunas: number,
  acoes: Acoes,
): RenderElement => {
  const { Box, Button, Text } = el
  const recuo = '  '.repeat(linha.nivel)

  if (linha.tipo === 'pasta') {
    return (
      <Text wrap="truncate-end">
        <Text dimColor>{`${recuo}▾ `}</Text>
        <Text bold dimColor>{linha.nome}</Text>
      </Text>
    )
  }

  const arquivo = linha.arquivo
  const isEscolhido = arquivo.caminho === escolhido
  // O nome cortado pelo meio antes de virar o rótulo do botão (que não trunca):
  // o fim é o que distingue handler.ts de handler.spec.ts. Fora o recuo, a
  // letra com os espaços dela e as contas, que não encolhem.
  const nome = curtoNoMeio(
    linha.nome,
    Math.max(NOME_MINIMO, colunas - recuo.length - 4 - textoDasContas(arquivo).length),
  )
  const letra = (
    <Text color={isEscolhido ? TINTA_DA_SELECAO : corDaLetra(arquivo.letra)} bold>
      {arquivo.letra}
    </Text>
  )

  // O escolhido: a faixa da seleção, como no VS Code.
  return isEscolhido ? (
    <Box key={`arquivo-${arquivo.caminho}`} flexDirection="row" backgroundColor={SELECAO}>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end" color={TINTA_DA_SELECAO}>
          <Text>{`${recuo}  `}</Text>
          {letra}
          <Text bold>{` ${nome}`}</Text>
        </Text>
      </Box>
      <Box flexShrink={0}>{contas(el, arquivo)}</Box>
    </Box>
  ) : (
    <Box key={`arquivo-${arquivo.caminho}`} flexDirection="row">
      <Box flexDirection="row" flexGrow={1} flexShrink={1} minWidth={0}>
        <Text>{`${recuo}  `}</Text>
        {letra}
        <Text>{' '}</Text>
        <Button
          key={`ver-arquivo-${arquivo.caminho}`}
          label={nome}
          plain
          hover={{ underline: true, color: corDaLetra(arquivo.letra) }}
          onPress={() => acoes.arquivo(arquivo.caminho)}
        />
      </Box>
      <Box flexShrink={0}>{contas(el, arquivo)}</Box>
    </Box>
  )
}


// O corpo do diff: no Desktop, o SVG com cara de diff nativo (fonte
// monoespaçada, fundo por linha, destaque da palavra, sintaxe); no terminal,
// o elemento Code, que já desenha com as cores do próprio Claude Code.
const corpoDoDiff = (
  el: Elementos,
  texto: string,
  caminho: string,
  quadro: Quadro,
  colunas: number,
): RenderElement => {
  const { Code, Svg } = el

  if (Svg !== null && !quadro.isTerminal && !quadro.isCompacto) {
    const desenho = desenharDiff(texto, colunas * PIXELS_POR_COLUNA)

    return (
      <Svg
        source={desenho.source}
        alt={desenho.alt}
        width={desenho.width}
        height={desenho.height}
        isInteractive
      />
    )
  }

  return <Code source={texto} format="diff" path={caminho} wrap="truncate-end" />
}

// O diff do arquivo escolhido: na sessão, uma caixa por edição do Claude, da
// mais antiga à mais nova; no git, o diff do arquivo contra o HEAD.
const painelDoDiff = (
  el: Elementos,
  dados: Dados,
  arquivo: ArquivoAlterado,
  fonte: FonteDoDiff,
  quadro: Quadro,
  colunas: number,
): RenderElement => {
  const { Box, Text } = el
  const nome = arquivo.caminho.split('/').at(-1) ?? arquivo.caminho
  const pasta = relativo(arquivo.caminho, quadro.raiz).split('/').slice(0, -1).join('/')
  const cabecalho = (
    <Box flexDirection="column">
      <Text wrap="truncate-end">
        <Text bold>{nome}</Text>
        {pasta !== '' && <Text dimColor>{`  ${pasta}`}</Text>}
      </Text>
      <Text wrap="truncate-end">
        <Text color={corDaLetra(arquivo.letra)} bold>{arquivo.letra}</Text>
        <Text dimColor>{` ${NOMES_DAS_LETRAS[arquivo.letra] ?? ''}`}</Text>
        {contas(el, arquivo)}
        {proporcao(el, arquivo.mais, arquivo.menos)}
        {fonte !== 'git' && <Text dimColor>{` · ${plural(arquivo.edicoes.length, 'edição', 'edições')}`}</Text>}
      </Text>
    </Box>
  )

  if (fonte === 'git') {
    const doGit = dados.diffGit
    const isDeste = doGit.caminho === arquivo.caminho

    return (
      <Box key="painel-do-diff" flexDirection="column" rowGap={1} flexGrow={1} flexShrink={1} minWidth={0}>
        {cabecalho}
        {!isDeste && <Text dimColor>Lendo o diff…</Text>}
        {isDeste && doGit.texto !== undefined && doGit.texto !== '' && (
          corpoDoDiff(el, doGit.texto, arquivo.caminho, quadro, colunas)
        )}
        {isDeste && doGit.aviso !== undefined && <Text dimColor wrap="wrap">{doGit.aviso}</Text>}
        {isDeste && (doGit.cortadas ?? 0) > 0 && (
          <Text dimColor>{`… mais ${plural(doGit.cortadas ?? 0, 'linha', 'linhas')}`}</Text>
        )}
      </Box>
    )
  }

  const edicoes = arquivo.edicoes.slice(-20)

  return (
    <Box key="painel-do-diff" flexDirection="column" rowGap={1} flexGrow={1} flexShrink={1} minWidth={0}>
      {cabecalho}
      {edicoes.map(({ edicao, turno }, i) => {
        const diff = diffDaEdicao(edicao.linhas)
        const resto = diff.cortadas + edicao.cortadas
        const origem = edicao.isNovo
          ? `${edicao.ferramenta}, arquivo novo`
          : edicao.isApagado === true
            ? `${edicao.ferramenta}, arquivo apagado`
            : edicao.ferramenta

        return (
          <Box key={`edicao-${edicao.id}`} flexDirection="column">
            <Text wrap="truncate-end">
              <Text color={COR_DOS_DIFFS}>{'● '}</Text>
              <Text bold>{`Edição ${arquivo.edicoes.length - edicoes.length + i + 1}`}</Text>
              <Text dimColor>{` · ${origem} · turno ${turno}`}</Text>
              {edicao.quem !== undefined && <Text color={COR.ciano}>{` · por ${edicao.quem}`}</Text>}
              <Text color={COR.verde}>{`  +${edicao.mais}`}</Text>
              <Text color={COR.vermelho}>{` −${edicao.menos}`}</Text>
            </Text>
            {/* De um Bash: o comando que mudou o arquivo. */}
            {edicao.comando !== undefined && (
              <Text color={COR.ciano} wrap="truncate-end">{`$ ${edicao.comando}`}</Text>
            )}
            {diff.texto === '' ? (
              <Text dimColor>{edicao.isApagado === true ? 'Arquivo apagado.' : 'Sem diferença de texto (um binário, ou só a permissão mudou).'}</Text>
            ) : (
              corpoDoDiff(el, diff.texto, edicao.caminho, quadro, colunas)
            )}
            {resto > 0 && <Text dimColor>{`… mais ${plural(resto, 'linha', 'linhas')}`}</Text>}
          </Box>
        )
      })}
    </Box>
  )
}

const ROTULOS_DAS_FONTES: readonly { fonte: FonteDoDiff; rotulo: string; tecla: string }[] = [
  { fonte: 'sessao', rotulo: 'Sessão', tecla: 's' },
  { fonte: 'turno', rotulo: 'Turno', tecla: 'e' },
  { fonte: 'git', rotulo: 'Git', tecla: 'g' },
]

export const abaDiffs = (el: Elementos, dados: Dados, quadro: Quadro, acoes: Acoes): RenderElement => {
  const { Box, Button, Text } = el
  const fonte = fonteDe(dados.ui)
  const arquivos = arquivosAlterados(dados.ui, dados.turnos, dados.arvore.git, quadro.raiz)
  const escolhido = arquivoEscolhido(dados.ui, arquivos)
  const linhas = listaEmArvore(arquivos, quadro.raiz)
  const mais = arquivos.reduce((soma, arquivo) => soma + arquivo.mais, 0)
  const menos = arquivos.reduce((soma, arquivo) => soma + arquivo.menos, 0)
  const turno = turnoEmVista(dados.ui, dados.turnos)
  const comEdicoes = turnosComEdicoes(dados.turnos)
  const indiceDoTurno = turno === undefined ? -1 : comEdicoes.indexOf(turno)
  const isLadoALado = !quadro.isCompacto && quadro.largura >= LARGURA_LADO_A_LADO
  // Um terço do painel, até 60 colunas: num painel largo, os nomes compridos cabem.
  const larguraDaLista = limitar(Math.round(quadro.largura * 0.34), 26, 60)
  // Dentro do cartão da lista: sem a moldura e a folga dele.
  const colunasDaLista = isLadoALado ? larguraDaLista - 4 : quadro.largura - 5

  const fontes = (
    <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
      {ROTULOS_DAS_FONTES.map(({ fonte: uma, rotulo, tecla }) => {
        const texto = uma === 'turno' && turno !== undefined ? `${rotulo} ${turno.n}` : rotulo
        // O botão sem moldura já mostra a tecla: o terminal antes do rótulo
        // ("e: Turno 3"), o app ao lado.
        const rotuloDoBotao = texto

        return uma === fonte ? (
          selo(el, texto, 'verde')
        ) : (
          <Box key={`guia-fonte-${uma}`}>
            <Button
              key={`diff-${uma}`}
              label={rotuloDoBotao}
              hotkey={tecla}
              {...comMoldura(quadro)}
              hover={{ color: COR_DOS_DIFFS, bold: true }}
              onPress={() => acoes.fonteDoDiff(uma)}
            />
          </Box>
        )
      })}
      {fonte === 'turno' && indiceDoTurno > 0 && (
        <Button key="turno-anterior" label={comTecla(quadro, '‹ Turno', 't')} hotkey="t" onPress={() => acoes.turno(-1)} />
      )}
      {fonte === 'turno' && indiceDoTurno >= 0 && indiceDoTurno < comEdicoes.length - 1 && (
        <Button key="turno-seguinte" label={comTecla(quadro, 'Turno ›', 'y')} hotkey="y" onPress={() => acoes.turno(1)} />
      )}
    </Box>
  )

  const vazio =
    fonte === 'git'
      ? dados.arvore.git.isRepo
        ? 'Nada alterado no git: a árvore de trabalho está igual ao HEAD.'
        : 'Esta pasta não é um repositório git.'
      : 'Nenhum Edit ou Write nesta sessão (da conversa principal ou dos subagentes).'

  // O que está sendo comparado, numa linha apagada sob a faixa: a faixa fica
  // só com o nome da aba e a contagem.
  const comparacao =
    fonte === 'sessao'
      ? 'Edições do Claude nos últimos 10 turnos.'
      : fonte === 'git'
        ? 'Árvore de trabalho contra o HEAD.'
        : turno === undefined
          ? 'Edições do Claude em um turno.'
          : `Edições do Claude no turno ${turno.n}.`

  // Na faixa do título, o que se lê na tinta dela; as contas, em verde e
  // vermelho, na linha de baixo (no fundo verde, sumiriam).
  const titulo = (
    <Box flexDirection="column">
      {secao(
        el,
        'Diffs',
        COR_DOS_DIFFS,
        `· ${plural(arquivos.length, 'arquivo', 'arquivos')}`,
        quadro.isTerminal || quadro.isCompacto ? undefined : quadro.largura,
        quadro.tomDaAba,
      )}
      {!quadro.isCompacto && <Text dimColor wrap="truncate-end">{comparacao}</Text>}
      {mais + menos > 0 && (
        <Text wrap="truncate-end">
          <Text color={COR.verde}>{mais > 0 ? `+${mais}` : ''}</Text>
          <Text color={COR.vermelho}>{menos > 0 ? `${mais > 0 ? ' ' : ''}−${menos}` : ''}</Text>
          {proporcao(el, mais, menos)}
        </Text>
      )}
    </Box>
  )

  if (arquivos.length === 0 || escolhido === undefined) {
    return (
      <Box key="diffs" flexDirection="column" rowGap={quadro.isCompacto ? 0 : 1}>
        {titulo}
        {fontes}
        <Text dimColor>{vazio}</Text>
      </Box>
    )
  }

  if (quadro.isCompacto) {
    return (
      <Box key="diffs" flexDirection="column">
        {titulo}
        {linhas
          .filter(linha => linha.tipo === 'arquivo')
          .slice(0, 3)
          .map(linha => linhaDaLista(el, { ...linha, nivel: 0 }, escolhido.caminho, quadro.largura - 1, acoes))}
      </Box>
    )
  }

  // Empilhado, a lista mostra uma janela em volta do escolhido.
  const indice = linhas.findIndex(linha => linha.tipo === 'arquivo' && linha.arquivo === escolhido)
  const janela = isLadoALado ? 400 : 10
  const de = limitar(indice - Math.floor(janela / 2), 0, Math.max(0, linhas.length - janela))
  const lista = (
    <Box flexDirection="column">
      {de > 0 && <Text dimColor>{`  ↑ mais ${de}`}</Text>}
      {linhas.slice(de, de + janela).map(linha => linhaDaLista(el, linha, escolhido.caminho, colunasDaLista, acoes))}
      {linhas.length > de + janela && <Text dimColor>{`  ↓ mais ${linhas.length - de - janela}`}</Text>}
    </Box>
  )
  // As colunas que sobram para o diff: ao lado da lista, ou a largura toda.
  const colunasDoDiff = isLadoALado ? quadro.largura - larguraDaLista - 7 : quadro.largura - 2
  const diff = painelDoDiff(el, dados, escolhido, fonte, quadro, colunasDoDiff)
  const botoes = (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      <Button key="anterior" label={comTecla(quadro, '‹ Arquivo', 'p')} hotkey="p" onPress={() => acoes.arquivoVizinho(-1)} />
      <Button key="proximo" label={comTecla(quadro, 'Arquivo ›', 'n')} hotkey="n" onPress={() => acoes.arquivoVizinho(1)} />
      {fonte === 'git' && (
        <Button key="diff-atualizar" label={comTecla(quadro, '↻ Atualizar', 'u')} hotkey="u" onPress={acoes.atualizarArvore} />
      )}
    </Box>
  )

  return (
    <Box key="diffs" flexDirection="column" rowGap={1}>
      <Box flexDirection="column">
        {titulo}
        {fontes}
      </Box>
      {isLadoALado ? (
        <Box flexDirection="row" columnGap={1}>
          <Box width={larguraDaLista} flexShrink={0} flexDirection="column">
            {cartao(el, 'lista-de-arquivos', COR.cinza, false, [lista])}
          </Box>
          <Box flexGrow={1} flexShrink={1} minWidth={0} flexDirection="column">
            {cartao(el, 'diff-do-arquivo', COR_DOS_DIFFS, false, [diff])}
          </Box>
        </Box>
      ) : (
        <Box flexDirection="column" rowGap={1}>
          {cartao(el, 'lista-de-arquivos', COR.cinza, false, [lista])}
          {diff}
        </Box>
      )}
      {botoes}
    </Box>
  )
}
