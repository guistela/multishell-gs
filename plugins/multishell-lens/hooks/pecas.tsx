// As peças visuais que as abas repetem: selos, títulos de seção, cartões e a
// marca de estado. Como em telas.tsx, nada aqui chama `$`.

import type { RenderElement } from 'claude-code'

import { COR, TONS, tomDaCor } from './cores'
import type { NomeDoTom, Tom } from './cores'
import { PIXELS_POR_COLUNA, PIXELS_POR_LINHA, limitar } from './formato'
import { ALTURA_DA_BARRA_DE_TITULO, ALTURA_DA_BARRA_HORIZONTAL, barraDeTitulo, barrasHorizontais, pilulasSoltas } from './graficos'
import type { CorDoGrafico } from './graficos'
import type { Elementos, Quadro } from './telas'

// O app Desktop desenha SVG; o terminal, não (lá, os selos são texto com fundo).
type ComSvg = { Svg?: Elementos['Svg'] }

// Um selo: texto em negrito sobre um fundo colorido. No app, uma pílula de
// pontas redondas, como as acima do prompt (o fundo de um texto do painel só
// sai quadrado); no terminal, o texto com um espaço de cada lado. `altura`:
// o da aba aberta tem a altura dos botões das outras.
export const selo = (
  el: Pick<Elementos, 'Text'> & ComSvg,
  texto: string,
  tom: Tom | NomeDoTom,
  isNegrito = true,
  altura?: number,
): RenderElement => {
  const { Text } = el
  const cor = typeof tom === 'string' ? TONS[tom] : tom

  if (el.Svg !== undefined && el.Svg !== null) {
    const desenho = pilulasSoltas([{ texto, fundo: cor.fundo, tinta: cor.tinta, isNegrito }], altura === undefined ? {} : { altura, corpo: 13.5 })

    return <el.Svg source={desenho.source} alt={texto} width={desenho.width} height={desenho.height} />
  }

  return (
    <Text backgroundColor={cor.fundo} color={cor.tinta} bold={isNegrito}>
      {` ${texto} `}
    </Text>
  )
}

// O rótulo de um botão com moldura que tem tecla: o app desenha a tecla junto
// do botão; o terminal, não (lá ela vai no rótulo). Num botão sem moldura, o
// terminal já escreve a tecla antes do rótulo ("e: Turno 3").
export const comTecla = (quadro: { isTerminal: boolean }, rotulo: string, tecla: string): string =>
  quadro.isTerminal ? `${rotulo} (${tecla})` : rotulo

// Um botão que parece botão: no app, com moldura; no terminal, onde a
// moldura gasta linhas, sem ela e apagado (a tecla vai antes do rótulo).
export const comMoldura = (quadro: { isTerminal: boolean }): { plain?: true; dimColor?: true } =>
  quadro.isTerminal ? { plain: true, dimColor: true } : {}

// O título de uma seção: uma faixa da largura do painel, com o fundo na cor
// da aba e o texto na tinta que contrasta com ela (preta ou branca), o nome em
// negrito e, ao lado, a contagem.
export const secao = (
  el: Pick<Elementos, 'Box' | 'Text'> & ComSvg,
  titulo: string,
  cor: string,
  contagem?: number | string,
  // No app, com a largura do painel: uma barra desenhada, de pontas redondas.
  colunas?: number,
  tomDaAba?: NomeDoTom,
): RenderElement => {
  const { Box, Text } = el
  const tom = tomDaAba === undefined ? tomDaCor(cor) : TONS[tomDaAba]

  if (colunas !== undefined && el.Svg !== undefined && el.Svg !== null) {
    const desenho = barraDeTitulo(
      { texto: titulo, ...(contagem === undefined ? {} : { contagem: String(contagem) }), fundo: tom.fundo, tinta: tom.tinta },
      larguraDaBarra(colunas),
    )

    return (
      <el.Svg
        source={desenho.source}
        alt={`${titulo}${contagem === undefined ? '' : ` ${contagem}`}`}
        width={desenho.width}
        height={desenho.height}
      />
    )
  }

  return (
    <Box backgroundColor={tom.fundo} paddingX={1}>
      <Text wrap="truncate-end" color={tom.tinta}>
        <Text bold>{titulo}</Text>
        {contagem !== undefined && <Text>{` ${contagem}`}</Text>}
      </Text>
    </Box>
  )
}

// Os números de um item (o modelo, o tempo, o custo, os tokens) em
// etiquetas, cada uma com o seu fundo, lado a lado: o olho acha cada número
// sem ler a linha inteira. As que não cabem descem para a linha de baixo.
export type Etiqueta = { texto: string; tom?: NomeDoTom; isNegrito?: boolean }

export const etiquetas = (
  el: Pick<Elementos, 'Box' | 'Text'> & ComSvg,
  chave: string,
  itens: readonly (Etiqueta | undefined | false)[],
): RenderElement => {
  const { Box } = el

  // No app, uma fileira de pílulas num desenho só (o alt traz os textos).
  if (el.Svg !== undefined && el.Svg !== null) {
    const validos = itens.filter((item): item is Etiqueta => item !== undefined && item !== false)
    const desenho = pilulasSoltas(
      validos.map(item => {
        const tom = TONS[item.tom ?? 'rotulo']

        return { texto: item.texto, fundo: tom.fundo, tinta: tom.tinta, ...(item.isNegrito === true ? { isNegrito: true } : {}) }
      }),
      { largura: 900 },
    )

    return (
      <Box key={chave} flexDirection="row">
        <el.Svg source={desenho.source} alt={validos.map(item => item.texto).join(' · ')} width={desenho.width} height={desenho.height} />
      </Box>
    )
  }

  return (
    <Box key={chave} flexDirection="row" flexWrap="wrap" columnGap={1}>
      {itens
        .filter((item): item is Etiqueta => item !== undefined && item !== false)
        .map((item, i) => (
          <Box key={`${chave}-${i}`} flexShrink={0}>
            {selo(el, item.texto, item.tom ?? 'rotulo', item.isNegrito ?? false)}
          </Box>
        ))}
    </Box>
  )
}

// O que uma seção que dobra precisa saber: as fechadas, como alternar e se
// é o terminal (onde o botão vai sem moldura).
export type Dobra = {
  fechadas: readonly string[]
  alternar: (chave: string) => void
  isTerminal: boolean
  // A largura do painel (a barra do título vai de ponta a ponta) e o tom da
  // aba aberta (todos os títulos dela nele).
  largura?: number
  tomDaAba?: NomeDoTom
}

export const dobraDe = (
  quadro: { isTerminal: boolean; fechadas?: readonly string[]; largura?: number; tomDaAba?: NomeDoTom },
  acoes: { alternarSecao: (chave: string) => void },
): Dobra => ({
  fechadas: quadro.fechadas ?? [],
  alternar: acoes.alternarSecao,
  isTerminal: quadro.isTerminal,
  ...(quadro.largura === undefined ? {} : { largura: quadro.largura }),
  ...(quadro.tomDaAba === undefined ? {} : { tomDaAba: quadro.tomDaAba }),
})

// O rótulo dos botões invisíveis: o espaço de figura, da largura de um dígito.
const ESPACO_INVISIVEL = '\u2007'

// A largura em pixels de uma barra de ponta a ponta do painel, com folga
// (do tamanho exato, passava da borda direita no app).
const larguraDaBarra = (colunas: number): number => (colunas - 4) * PIXELS_POR_COLUNA * 0.96

// Uma seção que abre e fecha: o botão ▾ ao lado do título fecha, o ▸ abre;
// fechada, fica só o título. A chave é a mesma em qualquer sessão, então a
// seção continua fechada até alguém abrir.
export const secaoQueDobra = (
  el: Pick<Elementos, 'Box' | 'Button' | 'Text'> & ComSvg,
  dobra: Dobra,
  chave: string,
  titulo: { texto: string; cor: string; contagem?: number | string },
  filhos: readonly (RenderElement | false | null | undefined)[],
  rowGap = 0,
): RenderElement => {
  const { Box, Button } = el
  const isFechada = dobra.fechadas.includes(chave)

  // No app, o título é uma barra só, na cor da aba, com a seta dentro, e abre
  // e fecha num clique em qualquer ponto dela (botões invisíveis por cima).
  if (!dobra.isTerminal && dobra.largura !== undefined && el.Svg !== undefined && el.Svg !== null) {
    const tom = TONS[dobra.tomDaAba ?? 'marca']
    const desenho = barraDeTitulo(
      {
        texto: titulo.texto,
        ...(titulo.contagem === undefined ? {} : { contagem: String(titulo.contagem) }),
        seta: isFechada ? '▸' : '▾',
        fundo: tom.fundo,
        tinta: tom.tinta,
      },
      larguraDaBarra(dobra.largura),
    )
    const linhas = Math.max(1, Math.round(ALTURA_DA_BARRA_DE_TITULO / PIXELS_POR_LINHA))
    const colunas = Math.max(4, Math.floor(desenho.width / PIXELS_POR_COLUNA) - 4)

    return (
      <Box key={`secao-${chave}`} flexDirection="column" rowGap={isFechada ? 0 : rowGap}>
        <Box key={`cabeca-${chave}`} marginBottom={isFechada || rowGap > 0 ? 0 : 1}>
          <el.Svg
            source={desenho.source}
            alt={`${isFechada ? '▸' : '▾'} ${titulo.texto}${titulo.contagem === undefined ? '' : ` ${titulo.contagem}`}`}
            width={desenho.width}
            height={desenho.height}
          />
          <Box position="absolute" top={0} left={0} flexDirection="column">
            {Array.from({ length: linhas }, (_, i) => (
              <Button
                key={i === 0 ? `dobra-${chave}` : `dobra-${chave}-${i}`}
                label={ESPACO_INVISIVEL.repeat(colunas)}
                plain
                onPress={() => dobra.alternar(chave)}
              />
            ))}
          </Box>
        </Box>
        {!isFechada && filhos}
      </Box>
    )
  }

  // No Desktop, uma linha de folga entre o título e o que vem embaixo (os
  // botões logo abaixo pareciam presos ao botão de dobrar).
  return (
    <Box key={`secao-${chave}`} flexDirection="column" rowGap={isFechada ? 0 : rowGap}>
      <Box flexDirection="row" columnGap={1} marginBottom={isFechada || dobra.isTerminal || rowGap > 0 ? 0 : 1}>
        <Box flexShrink={0}>
          <Button
            key={`dobra-${chave}`}
            label={isFechada ? '▸' : '▾'}
            {...comMoldura(dobra)}
            onPress={() => dobra.alternar(chave)}
          />
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          {secao(el, titulo.texto, titulo.cor, titulo.contagem, undefined, dobra.tomDaAba)}
        </Box>
      </Box>
      {!isFechada && filhos}
    </Box>
  )
}

// Um cartão: moldura arredondada na cor dada. Na versão compacta, sem moldura.
export const cartao = (
  el: Pick<Elementos, 'Box'>,
  chave: string,
  cor: string,
  isCompacto: boolean,
  filhos: readonly (RenderElement | false | null | undefined)[],
): RenderElement => {
  const { Box } = el

  return isCompacto ? (
    <Box key={chave} flexDirection="column">
      {filhos}
    </Box>
  ) : (
    <Box key={chave} flexDirection="column" borderStyle="round" borderColor={cor} paddingX={1}>
      {filhos}
    </Box>
  )
}

// Um cartão que se abre: a borda acende com o mouse em qualquer ponto dele, e
// as `linhas` de cima (o cabeçalho) abrem o detalhe inteiras, por botões
// invisíveis por cima, e não só no título. O que fica embaixo (comandos, links)
// segue clicável. No terminal, que não tem mouse sobre o cartão, só a moldura.
export const cartaoClicavel = (
  el: Elementos,
  chave: string,
  cor: string,
  corDoHover: string,
  linhas: number,
  quadro: Quadro,
  abrir: () => void,
  filhos: readonly (RenderElement | false | null | undefined)[],
): RenderElement => {
  const { Box, Button } = el
  const largura = Math.max(10, quadro.largura - 6)

  return (
    <Box key={chave} flexDirection="column" borderStyle="round" borderColor={cor} hover={{ borderColor: corDoHover }} paddingX={1}>
      {filhos}
      {!quadro.isTerminal && (
        <Box position="absolute" top={0} left={0} width={largura} overflow="hidden" flexDirection="column">
          {/* O rótulo bem mais curto que a caixa: o botão do app tem margem
              própria, e do tamanho dela o rótulo era cortado com "…", que
              aparecia na borda direita do cartão. */}
          {Array.from({ length: linhas }, (_, i) => (
            <Button key={`${chave}-abrir-${i}`} label={ESPACO_INVISIVEL.repeat(Math.max(4, largura - 12))} plain onPress={abrir} />
          ))}
        </Box>
      )}
    </Box>
  )
}

export type Estado = {
  glifo: string
  cor: string
  rotulo: string
}

// A marca de cada estado: azul enquanto roda, verde quando deu certo,
// vermelho quando falhou; âmbar no que foi negado ou interrompido.
export const ESTADOS = {
  rodando: { glifo: '●', cor: COR.azul, rotulo: 'rodando' },
  ok: { glifo: '✓', cor: COR.verde, rotulo: 'concluído' },
  falhou: { glifo: '✗', cor: COR.vermelho, rotulo: 'falhou' },
  negado: { glifo: '✗', cor: COR.ambar, rotulo: 'negado' },
} as const satisfies Record<string, Estado>

// Uma linha horizontal na cor dada, da largura do painel.
export const regua = (el: Pick<Elementos, 'Text'>, largura: number, cor: string): RenderElement => {
  const { Text } = el

  return <Text color={cor}>{'─'.repeat(Math.max(4, largura))}</Text>
}

// Contagens em barras deitadas, da maior para a menor: no Desktop um gráfico
// em SVG; no terminal (e na versão compacta), barras de blocos.
export const barrasDeContagem = (
  el: Elementos,
  itens: readonly (readonly [string, number])[],
  quadro: Pick<Quadro, 'largura' | 'isTerminal' | 'isCompacto'>,
  cor: CorDoGrafico,
  tinta: string,
  alt: string,
): RenderElement => {
  const { Box, Svg, Text } = el

  if (Svg !== null && !quadro.isTerminal && !quadro.isCompacto) {
    const largura = Math.round(Math.min(1000, (quadro.largura - 2) * PIXELS_POR_COLUNA))

    return (
      <Svg
        source={barrasHorizontais(
          itens.map(([rotulo, valor]) => ({ rotulo, valor, cor })),
          largura,
        )}
        alt={`${alt}: ${itens.map(([rotulo, valor]) => `${rotulo} ${valor}`).join(', ')}`}
        width={largura}
        height={itens.length * ALTURA_DA_BARRA_HORIZONTAL}
      />
    )
  }

  const rotulo = Math.min(16, Math.max(...itens.map(([nome]) => nome.length)) + 1)
  const maximo = Math.max(1, ...itens.map(([, valor]) => valor))
  const largura = limitar(quadro.largura - rotulo - 8, 6, 30)

  return (
    <Box flexDirection="column">
      {itens.map(([nome, valor]) => (
        <Text wrap="truncate-end">
          <Text>{nome.length >= rotulo ? `${nome.slice(0, rotulo - 2)}… ` : nome.padEnd(rotulo)}</Text>
          <Text color={tinta}>{'█'.repeat(Math.max(1, Math.round((valor / maximo) * largura)))}</Text>
          <Text dimColor>{` ${valor}`}</Text>
        </Text>
      ))}
    </Box>
  )
}
