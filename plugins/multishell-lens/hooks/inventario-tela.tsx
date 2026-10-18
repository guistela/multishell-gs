// O desenho da aba Inventário: uma seção por tipo de peça (plugins, skills,
// comandos, agentes, hooks, MCP, o resto e o que dá para instalar), cada
// peça com a origem, a descrição e se está ativa nesta sessão.

import type { RenderElement } from 'claude-code'

import type { LensItem, LensSecaoDoInventario, LensTipoDeItem } from '../types'
import { COR } from './cores'
import { duracao, plural } from './formato'
import { cartao, comMoldura, comTecla, secao, selo } from './pecas'
import type { Acoes, Dados, Elementos, Quadro } from './telas'

export const SECOES: readonly {
  id: LensSecaoDoInventario
  nome: string
  tipos: readonly LensTipoDeItem[]
  ajuda: string
}[] = [
  { id: 'plugin', nome: 'Plugins', tipos: ['plugin'], ajuda: 'Plugins instalados. Ativo = habilitado nas configurações.' },
  { id: 'skill', nome: 'Skills', tipos: ['skill'], ajuda: 'Skills. Ativa = listada para o modelo nesta sessão.' },
  { id: 'comando', nome: 'Comandos', tipos: ['comando'], ajuda: 'Comandos de barra que dá para rodar agora.' },
  { id: 'agente', nome: 'Agentes', tipos: ['agente'], ajuda: 'Tipos de subagente, além dos embutidos.' },
  { id: 'hook', nome: 'Hooks', tipos: ['hook'], ajuda: 'Das configurações e dos plugins: o comando de cada evento.' },
  { id: 'mcp', nome: 'MCP', tipos: ['mcp'], ajuda: 'Servidores MCP. Ativo = conectado, com ferramentas na sessão.' },
  {
    id: 'outros',
    nome: 'Outros',
    tipos: ['estilo', 'memoria', 'ferramenta'],
    ajuda: 'Estilos de saída, memória (CLAUDE.md) e ferramentas embutidas.',
  },
  {
    id: 'disponivel',
    nome: 'Para instalar',
    tipos: ['disponivel'],
    ajuda: 'Dos seus marketplaces, ainda não instalados: /plugin install nome@marketplace.',
  },
]

const COR_DO_INVENTARIO = COR.ambar
// Quantos itens aparecem de cada vez: 200 cartões numa tela só (um marketplace
// grande no "Para instalar") travavam o app. O "Mostrar mais" soma outros 30.
export const ITENS_POR_VEZ = 30
// O filtro não estica até a borda: um campo de busca curto basta.
const LARGURA_DO_FILTRO = 48

const NOMES_DOS_TIPOS: Readonly<Record<LensTipoDeItem, string>> = {
  plugin: 'plugin',
  disponivel: 'disponível',
  skill: 'skill',
  comando: 'comando',
  agente: 'agente',
  hook: 'hook',
  mcp: 'MCP',
  estilo: 'estilo de saída',
  memoria: 'memória',
  ferramenta: 'ferramenta',
}

const nomeDoItem = (item: LensItem): string => (item.tipo === 'comando' ? `/${item.nome}` : item.nome)

const linhaDoItem = (el: Elementos, item: LensItem, quadro: Quadro, i: number): RenderElement => {
  const { Box, Text } = el
  const chave = `item-${i}-${item.tipo}-${item.origem}-${item.nome}-${item.extra ?? ''}`
  const isDisponivel = item.tipo === 'disponivel'
  const marca = item.isAtivo ? '●' : '○'
  const cor = item.isAtivo ? COR.verde : COR.cinza

  if (quadro.isCompacto) {
    return (
      <Text wrap="truncate-end">
        <Text color={cor}>{`${marca} `}</Text>
        <Text bold={item.isAtivo} dimColor={!item.isAtivo}>{nomeDoItem(item)}</Text>
        {item.descricao !== undefined && <Text dimColor>{` · ${item.descricao}`}</Text>}
      </Text>
    )
  }

  // Cada item num cartão de moldura neutra: o estado já está no glifo e no
  // selo (a moldura verde repetia o "ativo").
  return cartao(el, chave, 'subtle', false, [
    <Box key={`${chave}-cabeca`} flexDirection="row" columnGap={1}>
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        <Text wrap="truncate-end">
          <Text color={isDisponivel ? COR.azul : cor}>{isDisponivel ? '+ ' : `${marca} `}</Text>
          <Text bold={item.isAtivo || isDisponivel} dimColor={!item.isAtivo && !isDisponivel}>
            {nomeDoItem(item)}
          </Text>
          {item.extra !== undefined && <Text color={COR_DO_INVENTARIO}>{`  ${item.extra}`}</Text>}
        </Text>
      </Box>
      {!isDisponivel && (
        // Numa Box que não encolhe: o selo nunca quebra em duas linhas.
        <Box flexShrink={0}>
          {item.isAtivo ? selo(el, 'ativo', 'verde', false) : selo(el, 'inativo', 'cinza', false)}
        </Box>
      )}
    </Box>,
    item.descricao !== undefined && (
      <Text key={`${chave}-descricao`} dimColor wrap="wrap">{item.descricao}</Text>
    ),
    item.detalhe !== undefined && (
      <Text key={`${chave}-detalhe`} color={COR.ciano} wrap="wrap">{item.detalhe}</Text>
    ),
  ])
}

// Os itens de uma seção, agrupados pela origem: os grupos com algo ativo
// primeiro, e dentro de cada um os ativos antes.
const grupos = (itens: readonly LensItem[]): [string, LensItem[]][] => {
  const porOrigem = new Map<string, LensItem[]>()

  for (const item of itens) {
    porOrigem.set(item.origem, [...(porOrigem.get(item.origem) ?? []), item])
  }

  return [...porOrigem.entries()]
    .map(([origem, lista]): [string, LensItem[]] => [
      origem,
      [...lista].sort((a, b) => Number(b.isAtivo) - Number(a.isAtivo) || a.nome.localeCompare(b.nome)),
    ])
    .sort(
      (a, b) =>
        Number(b[1].some(item => item.isAtivo)) - Number(a[1].some(item => item.isAtivo)) ||
        a[0].localeCompare(b[0]),
    )
}

export const abaInventario = (
  el: Elementos,
  dados: Dados,
  quadro: Quadro,
  acoes: Acoes,
): RenderElement => {
  const { Box, Button, Input, Text } = el
  const atual = dados.ui.secaoDoInventario ?? 'plugin'
  const filtro = (dados.ui.filtroDoInventario ?? '').trim().toLowerCase()
  const todos = dados.inventario.itens
  const daSecao = (id: LensSecaoDoInventario) => {
    const tipos = SECOES.find(uma => uma.id === id)?.tipos ?? []

    return todos.filter(item => tipos.includes(item.tipo))
  }
  const escolhida = SECOES.find(uma => uma.id === atual) ?? SECOES[0]
  const itens = daSecao(atual).filter(
    item =>
      filtro === '' ||
      [item.nome, item.origem, item.descricao ?? '', item.extra ?? '', item.detalhe ?? '']
        .join(' ')
        .toLowerCase()
        .includes(filtro),
  )
  const lido = dados.inventario.lidoEm
  const visiveis = itens.slice(0, quadro.isCompacto ? 4 : (dados.ui.itensDoInventario ?? ITENS_POR_VEZ))

  const seletor = SECOES.map(uma => {
    const daUma = daSecao(uma.id)
    const ativos = daUma.filter(item => item.isAtivo).length
    const rotulo =
      uma.id === 'disponivel' ? `${uma.nome} ${daUma.length}` : `${uma.nome} ${ativos}/${daUma.length}`

    return uma.id === atual ? (
      selo(el, rotulo, 'ambar')
    ) : (
      <Box key={`guia-inv-${uma.id}`}>
        <Button
          key={`inv-${uma.id}`}
          label={rotulo}
          {...comMoldura(quadro)}
          hover={{ color: COR_DO_INVENTARIO, bold: true }}
          onPress={() => acoes.secao(uma.id)}
        />
      </Box>
    )
  })

  return (
    <Box key="inventario" flexDirection="column" rowGap={quadro.isCompacto ? 0 : 1}>
      <Box flexDirection="column">
        {secao(
          el,
          'Inventário',
          COR_DO_INVENTARIO,
          lido === undefined
            ? '· lendo…'
            : quadro.agora - lido < 5000
              ? '· atualizado agora'
              : `· atualizado há ${duracao(quadro.agora - lido)}`,
          quadro.isTerminal || quadro.isCompacto ? undefined : quadro.largura,
          quadro.tomDaAba,
        )}
        {!quadro.isCompacto && <Text dimColor>Lido do disco e das listas da sessão, sem gastar tokens.</Text>}
        {/* Uma folga entre a faixa do título e as seções (no app, colados, os
            botões pareciam pendurados na faixa). O Atualizar vai no fim da
            mesma fileira, e as setas ‹ › só levam as teclas j e k: as pílulas
            já trocam de seção no clique. */}
        <Box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={quadro.isTerminal ? 0 : 1} marginTop={quadro.isTerminal ? 0 : 1}>
          {seletor}
          {!quadro.isCompacto && (
            <Box key="inventario-controles" flexDirection="row" columnGap={1}>
              <Button key="inventario-atualizar" label={comTecla(quadro, '↻ Atualizar', 'u')} hotkey="u" onPress={acoes.atualizarInventario} />
              <Button key="inventario-anterior" label="‹" hotkey="j" plain dimColor onPress={() => acoes.secaoVizinha(-1)} />
              <Button key="inventario-proxima" label="›" hotkey="k" plain dimColor onPress={() => acoes.secaoVizinha(1)} />
            </Box>
          )}
        </Box>
      </Box>
      {!quadro.isCompacto && Input !== null && (
        // O filtro sozinho na linha, estreito: não precisa da largura toda.
        <Box flexDirection="row" width={Math.min(quadro.largura, LARGURA_DO_FILTRO)}>
          <Input
            key="filtro-inventario"
            label="Filtro"
            placeholder="nome, origem ou descrição"
            value={dados.ui.filtroDoInventario ?? ''}
            submitLabel="filtrar"
            onInput={texto => acoes.filtroDoInventario(texto)}
            onSubmit={texto => acoes.filtroDoInventario(texto)}
          />
        </Box>
      )}
      {!quadro.isCompacto && escolhida !== undefined && (
        <Box flexDirection="column">
          <Text dimColor wrap="wrap">{escolhida.ajuda}</Text>
          {/* O resumo da seção: quantos, quantos ativos e de quantas origens. */}
          {itens.length > 0 && (
            <Text wrap="wrap">
              <Text bold>{plural(itens.length, NOMES_DOS_TIPOS[escolhida.tipos[0] ?? 'plugin'], `${NOMES_DOS_TIPOS[escolhida.tipos[0] ?? 'plugin']}s`)}</Text>
              {atual !== 'disponivel' && (
                <Text color={COR.verde}>{` · ${plural(itens.filter(item => item.isAtivo).length, 'ativo', 'ativos')}`}</Text>
              )}
              {atual !== 'disponivel' && itens.some(item => !item.isAtivo) && (
                <Text dimColor>{` · ${plural(itens.filter(item => !item.isAtivo).length, 'inativo', 'inativos')}`}</Text>
              )}
              <Text dimColor>{` · ${plural(new Set(itens.map(item => item.origem)).size, 'origem', 'origens')}`}</Text>
            </Text>
          )}
        </Box>
      )}
      {itens.length === 0 && (
        <Text dimColor>
          {lido === undefined
            ? 'Lendo o que está instalado…'
            : filtro === ''
              ? `Nenhum ${NOMES_DOS_TIPOS[escolhida?.tipos[0] ?? 'plugin']} encontrado.`
              : 'Nada passa no filtro.'}
        </Text>
      )}
      {quadro.isCompacto
        ? visiveis.map((item, i) => linhaDoItem(el, item, quadro, i))
        : grupos(visiveis).map(([origem, lista]) => {
            // O nome do grupo abre e fecha os itens dele; aberto, eles vêm
            // em cartões, um embaixo do outro.
            const chave = `${atual}:${origem}`
            const isFechado = (dados.ui.gruposFechados ?? []).includes(chave)
            const ativos = lista.filter(item => item.isAtivo).length

            return (
              // Os cartões com uma linha de folga entre eles (colados, um
              // parecia a continuação do outro).
              <Box key={`grupo-${origem}`} flexDirection="column" rowGap={quadro.isTerminal ? 0 : 1}>
                <Box flexDirection="row" columnGap={1}>
                  <Box flexShrink={0}>
                    <Button
                      key={`grupo-inv-${origem}`}
                      label={`${isFechado ? '▸' : '▾'} ${origem}`}
                      {...comMoldura(quadro)}
                      hover={{ color: COR_DO_INVENTARIO, bold: true }}
                      onPress={() => acoes.grupoDoInventario(chave)}
                    />
                  </Box>
                  <Box flexGrow={1} flexShrink={1} minWidth={0}>
                    <Text dimColor wrap="truncate-end">
                      {`${plural(lista.length, 'item', 'itens')}${atual === 'disponivel' ? '' : ` · ${plural(ativos, 'ativo', 'ativos')}`}${isFechado ? ' · fechado' : ''}`}
                    </Text>
                  </Box>
                </Box>
                {!isFechado && lista.map((item, i) => linhaDoItem(el, item, quadro, i))}
              </Box>
            )
          })}
      {itens.length > visiveis.length &&
        (quadro.isCompacto ? (
          <Text dimColor>{`… mais ${plural(itens.length - visiveis.length, 'item', 'itens')}`}</Text>
        ) : (
          <Box key="inventario-mais" flexDirection="row" columnGap={1}>
            <Button
              key="inventario-mais"
              label={`Mostrar mais ${Math.min(ITENS_POR_VEZ, itens.length - visiveis.length)}`}
              {...comMoldura(quadro)}
              onPress={acoes.maisDoInventario}
            />
            <Text dimColor>{`${visiveis.length} de ${itens.length} · o filtro procura em todos`}</Text>
          </Box>
        ))}
    </Box>
  )
}
