// A aba Visão geral, a primeira: o essencial de cada aba numa tela só. No
// alto, os indicadores (o contexto, o custo, o limite de uso, os agentes, os
// turnos e as alterações), cada um abrindo a aba dele; os avisos, só quando há
// algo a fazer; o que está acontecendo agora; o grafo de quem chamou quem; o
// último turno e as últimas edições. O detalhe de cada coisa fica na aba dela.
// Como em telas.tsx, nada aqui chama `$`; o grafo chega já desenhado.

import type { RenderElement } from 'claude-code'

import type { LensAgente, LensEdicao } from '../types'
import { COR, TONS, corDoNivel, tomDoNivel } from './cores'
import { custoDoUltimoTurno, gruposDeTurnos, rodadasDoAgente } from './dados'
import { desenharDiff } from './diff-svg'
import { diffDaEdicao } from './diffs-lista'
import type { Grupo } from './dados'
import { PIXELS_POR_COLUNA, PIXELS_POR_LINHA, curto, dolar, duracao, duracaoViva, nomeDoLimite, plural, relativo, renovaEm, semMarcas, tokens, umaLinha } from './formato'
import { painelDeIndicadores } from './graficos'
import type { Indicador } from './graficos'
import { ESTADOS, cartaoClicavel, comMoldura, dobraDe, etiquetas, secaoQueDobra } from './pecas'
import { contagemDaLista } from './rodadas'
import type { Acoes, Dados, Elementos, ListaDeAgentes, Quadro } from './telas'

const COR_DA_VISAO = COR.marca
// O rótulo dos botões invisíveis: o espaço de figura, da largura de um dígito.
const ESPACO = ' '

type Aviso = { texto: string; cor: string }

// O que pede atenção agora: o contexto ou um limite perto do fim, falhas no
// último turno e agentes que falharam. Nada disso: nenhum aviso.
const avisosDe = (dados: Dados, ultimo: Grupo | undefined): Aviso[] => {
  const contexto = dados.contexto
  const avisos: Aviso[] = []

  if ((contexto.percentual ?? 0) >= 80) {
    avisos.push({ texto: `Contexto em ${contexto.percentual}%: o Claude Code vai compactar a conversa em breve.`, cor: COR.vermelho })
  }

  for (const limite of contexto.limites) {
    if (limite.percentual >= 80) {
      avisos.push({ texto: `Limite de uso de ${nomeDoLimite(limite.tipo)} em ${limite.percentual}%.`, cor: COR.vermelho })
    }
  }

  if (ultimo !== undefined && ultimo.falhas > 0) {
    avisos.push({ texto: `O turno ${ultimo.ordem} teve ${plural(ultimo.falhas, 'chamada que falhou', 'chamadas que falharam')}.`, cor: COR.ambar })
  }

  const falharam = dados.agentes.filter(agente => agente.estado === 'falhou').length

  if (falharam > 0) {
    avisos.push({ texto: `${plural(falharam, 'agente falhou', 'agentes falharam')} nesta sessão.`, cor: COR.ambar })
  }

  return avisos
}

// As últimas edições, uma por arquivo (a mais recente), da mais nova à mais antiga.
const ultimasEdicoes = (dados: Dados, quantas: number): { edicao: LensEdicao; turno: number }[] => {
  const todas = dados.turnos.flatMap(turno => turno.edicoes.map(edicao => ({ edicao, turno: turno.n })))
  const vistas = new Set<string>()
  const saida: { edicao: LensEdicao; turno: number }[] = []

  for (const item of [...todas].reverse()) {
    if (vistas.has(item.edicao.caminho)) {
      continue
    }

    vistas.add(item.edicao.caminho)
    saida.push(item)

    if (saida.length >= quantas) {
      break
    }
  }

  return saida
}

// O começo de um texto longo para ler de relance: os primeiros parágrafos até
// `maximo` letras, cortados numa quebra de linha (o Markdown não fica pela
// metade), e um aviso de que há mais.
const comecoDoTexto = (texto: string, maximo: number): string => {
  if (texto.length <= maximo) {
    return texto
  }

  const corte = texto.lastIndexOf('\n', maximo)

  return `${texto.slice(0, corte > maximo / 3 ? corte : maximo).trimEnd()}\n\n*… continua no turno.*`
}

// Como nas outras telas: a tarefa primeiro e o tipo, entre parênteses, depois.
const nomeDoAgente = (agente: LensAgente): string =>
  agente.descricao === '' ? agente.tipo : `${agente.descricao} (${agente.tipo})`

export const abaVisaoGeral = (
  el: Elementos,
  dados: Dados,
  quadro: Quadro,
  acoes: Acoes,
  // O grafo de quem chamou quem, já desenhado (sem os controles da aba Agentes).
  grafo: RenderElement | null,
  // Os agentes que o último turno chamou, uma linha por agente (ou por
  // rodada de um agente que trabalhou mais de uma vez), já desenhados.
  agentesDoUltimo: ListaDeAgentes = { linhas: [], agentes: 0, rodadas: 0 },
  // Os agentes instalados (globais, do projeto e de plugin), chamados ou não.
  disponiveis: RenderElement | null = null,
): RenderElement => {
  const { Box, Button, Text } = el
  const dobra = dobraDe(quadro, acoes)
  const contexto = dados.contexto
  const grupos = gruposDeTurnos(dados.rodadas)
  const ultimo = grupos.reduce<Grupo | undefined>((maior, grupo) => (maior === undefined || grupo.ordem > maior.ordem ? grupo : maior), undefined)
  const rodando = dados.agentes.filter(agente => agente.estado === 'rodando')
  const ok = dados.agentes.filter(agente => agente.estado === 'concluido').length
  const falhas = dados.agentes.filter(agente => agente.estado === 'falhou').length
  const git = dados.arvore.git
  const mais = git.arquivos.reduce((soma, arquivo) => soma + (arquivo.mais ?? 0), 0)
  const menos = git.arquivos.reduce((soma, arquivo) => soma + (arquivo.menos ?? 0), 0)
  const limite = contexto.limites[0]
  const custoDoTurno = custoDoUltimoTurno(contexto)
  const isPensando = ultimo !== undefined && ultimo.isAndando

  // Os indicadores, cada um com a aba que ele abre.
  const indicadores: (Indicador & { aba: 1 | 2 | 3 | 4 })[] = [
    {
      rotulo: 'Contexto',
      valor: contexto.percentual === undefined ? '–' : `${contexto.percentual}%`,
      detalhe: `${contexto.tokens === undefined ? '–' : tokens(contexto.tokens)} de ${contexto.janela > 0 ? tokens(contexto.janela) : '–'}`,
      cor: TONS[tomDoNivel(contexto.percentual ?? 0)].fundo,
      nivel: contexto.percentual ?? 0,
      aba: 3,
    },
    {
      rotulo: 'Custo da sessão',
      valor: contexto.custo === undefined ? '–' : dolar(contexto.custo),
      detalhe: custoDoTurno === undefined ? 'sem leitura do turno' : `▲ ${dolar(custoDoTurno)} no turno`,
      cor: TONS.verde.fundo,
      aba: 3,
    },
    ...(limite === undefined
      ? []
      : [
          {
            // Por extenso: em maiúsculas, "5 h" virava "5 H".
            rotulo: `Limite de ${nomeDoLimite(limite.tipo).replace(/ h$/, ' horas')}`,
            valor: `${limite.percentual}%`,
            detalhe: ((renova: string | undefined) =>
              renova === undefined ? 'da sua conta' : renova === 'agora' ? 'renova agora' : `renova em ${renova}`)(renovaEm(limite.renova, quadro.agora)),
            cor: TONS[tomDoNivel(limite.percentual)].fundo,
            nivel: limite.percentual,
            aba: 3 as const,
          },
        ]),
    {
      rotulo: 'Agentes',
      valor: rodando.length > 0 ? `${rodando.length} rodando` : String(dados.agentes.length),
      // Só o que tem: "✓ 0 ok" era ruído.
      detalhe:
        [ok > 0 ? `✓ ${ok} ok` : undefined, falhas > 0 ? `✗ ${falhas} falha${falhas === 1 ? '' : 's'}` : undefined].filter(Boolean).join(' · ') ||
        (dados.agentes.length === 0 ? 'nenhum ainda' : 'todos trabalhando'),
      ...(rodando.length > 0 ? { cor: TONS.azul.fundo } : {}),
      aba: 1,
    },
    {
      rotulo: 'Turnos',
      valor: String(grupos.length),
      detalhe:
        ultimo === undefined
          ? 'nenhum ainda'
          : isPensando
            ? `o ${ultimo.ordem}º em andamento`
            : `último: ${duracao(ultimo.duracaoMs)}`,
      ...(isPensando ? { cor: TONS.laranja.fundo } : {}),
      aba: 4,
    },
    {
      // O mesmo nome da aba que ele abre.
      rotulo: 'Diffs',
      valor: git.isRepo ? `+${mais} −${menos}` : '–',
      detalhe: git.isRepo ? plural(git.arquivos.length, 'arquivo no git', 'arquivos no git') : 'sem repositório git',
      aba: 2,
    },
  ]

  // No Desktop, os indicadores desenhados, com um botão invisível por cima de
  // cada um; no terminal, em texto.
  // Com folga: do tamanho exato, o desenho passava da borda direita no app.
  const largura = Math.round(Math.min(1600, (quadro.largura - 8) * PIXELS_POR_COLUNA * 0.94))
  const isDesenho = el.Svg !== null && !quadro.isTerminal && !quadro.isCompacto
  const painel = isDesenho ? painelDeIndicadores(indicadores, largura) : undefined
  const blocoDosIndicadores =
    painel !== undefined && el.Svg !== null ? (
      <Box key="visao-indicadores">
        <el.Svg
          source={painel.source}
          alt={`Indicadores: ${indicadores.map(indicador => `${indicador.rotulo} ${indicador.valor}`).join(', ')}`}
          width={painel.width}
          height={painel.height}
        />
        {painel.caixas.map((caixa, i) => {
          const indicador = indicadores[i]
          const colunas = Math.max(4, Math.floor(caixa.w / PIXELS_POR_COLUNA) - 6)
          const linhas = Math.max(1, Math.floor(caixa.h / PIXELS_POR_LINHA))

          return indicador === undefined ? null : (
            <Box
              key={`indicador-${i}`}
              position="absolute"
              top={Math.floor(caixa.y / PIXELS_POR_LINHA)}
              left={Math.floor(caixa.x / PIXELS_POR_COLUNA)}
              flexDirection="column"
            >
              {Array.from({ length: linhas }, (_, k) => (
                <Button
                  key={k === 0 ? `visao-${indicador.rotulo}` : `visao-${indicador.rotulo}-${k}`}
                  label={ESPACO.repeat(colunas)}
                  plain
                  onPress={() => acoes.aba(indicador.aba)}
                />
              ))}
            </Box>
          )
        })}
      </Box>
    ) : (
      <Box key="visao-indicadores" flexDirection="column">
        {indicadores.map(indicador => (
          <Box key={`indicador-${indicador.rotulo}`} flexDirection="row" columnGap={1}>
            <Box width={16} flexShrink={0}>
              <Button key={`visao-${indicador.rotulo}`} label={indicador.rotulo} plain hover={{ underline: true }} onPress={() => acoes.aba(indicador.aba)} />
            </Box>
            <Text wrap="truncate-end">
              <Text bold {...(indicador.rotulo === 'Contexto' ? { color: corDoNivel(contexto.percentual ?? 0) } : {})}>
                {indicador.valor}
              </Text>
              {indicador.detalhe !== undefined && <Text dimColor>{`  ${indicador.detalhe}`}</Text>}
            </Text>
          </Box>
        ))}
      </Box>
    )

  const avisos = avisosDe(dados, ultimo)
  const agora = (
    <Box key="visao-agora-linhas" flexDirection="column">
      <Text wrap="truncate-end">
        <Text color={COR.marca} bold>{'✦ Principal '}</Text>
        {isPensando && ultimo !== undefined ? (
          <Text color={COR.marca}>{`pensando há ${duracaoViva(quadro.agora - ultimo.inicio)} · turno ${ultimo.ordem}`}</Text>
        ) : (
          <Text dimColor>
            {ultimo === undefined
              ? 'esperando o primeiro pedido'
              : `parado · o turno ${ultimo.ordem} terminou há ${duracaoViva(Math.max(0, quadro.agora - (ultimo.inicio + ultimo.duracaoMs)))}`}
          </Text>
        )}
      </Text>
      {rodando.map(agente => (
        <Box key={`agora-${agente.id}`} flexDirection="row">
          <Text color={ESTADOS.rodando.cor}>{`${ESTADOS.rodando.glifo} `}</Text>
          <Box flexShrink={1} minWidth={0}>
            <Button
              key={`visao-agente-${agente.id}`}
              label={nomeDoAgente(agente)}
              plain
              hover={{ underline: true, color: COR.ciano }}
              onPress={() => acoes.abrir({ tipo: 'agente', id: agente.id })}
            />
          </Box>
          {/* O mesmo agente que um recado acordou: em que rodada ele está. */}
          {rodadasDoAgente(agente) > 1 && <Text color={COR.roxo}>{` · rodada ${rodadasDoAgente(agente)}`}</Text>}
          {agente.ferramenta !== undefined && (
            <Box flexShrink={1} minWidth={0}>
              <Text dimColor wrap="truncate-end">{` ▸ ${agente.ferramenta} ${agente.argumento ?? ''}`.trimEnd()}</Text>
            </Box>
          )}
        </Box>
      ))}
      {dados.arvore.toques
        .filter(toque => toque.agora !== undefined)
        .map(toque => (
          <Text key={`agora-toque-${toque.caminho}`} wrap="truncate-end">
            <Text color={toque.agora === 'lendo' ? COR.roxo : COR.laranja}>{`◉ ${toque.agora} `}</Text>
            <Text bold>{relativo(toque.caminho, quadro.raiz)}</Text>
            <Text dimColor>{` · ${toque.quem.join(', ')}`}</Text>
          </Text>
        ))}
    </Box>
  )

  const edicoes = ultimasEdicoes(dados, quadro.isCompacto ? 3 : 6)
  // O último turno: o pedido em até três linhas, a resposta formatada (o
  // começo dela) e quantos agentes ele chamou.
  const fichaDoUltimo = dados.fichas.turnos?.find(ficha => ficha.n === ultimo?.cabeca?.n)
  const porLinha = Math.max(30, quadro.largura - 8)
  const pedido = ultimo === undefined ? '' : curto(umaLinha(semMarcas(fichaDoUltimo?.pedido || ultimo.cabeca?.pedido || '')), porLinha * 3)
  const respostaDoUltimo = fichaDoUltimo?.resposta ?? ultimo?.cabeca?.resposta ?? ''
  // Os que ele chamou: os criados nele e os que a conversa principal acordou nele.
  const chamados = agentesDoUltimo.agentes
  const abrirTurno = () => (ultimo === undefined ? undefined : acoes.abrir({ tipo: 'turno', id: String(ultimo.ordem) }))

  return (
    <Box key="visao" flexDirection="column" rowGap={quadro.isCompacto ? 0 : 1}>
      {blocoDosIndicadores}
      {avisos.length > 0 && (
        <Box key="visao-avisos" flexDirection="column">
          {avisos.map(aviso => (
            <Text key={aviso.texto} color={aviso.cor} wrap="wrap">{`⚠ ${aviso.texto}`}</Text>
          ))}
        </Box>
      )}
      {secaoQueDobra(el, dobra, 'visao:agora', { texto: 'Agora', cor: COR_DA_VISAO, contagem: rodando.length > 0 ? `· ${rodando.length} rodando` : '' }, [agora])}
      {grafo !== null &&
        !quadro.isCompacto &&
        secaoQueDobra(el, dobra, 'visao:grafo', { texto: 'Quem chamou quem', cor: COR.ciano, contagem: dados.agentes.length === 0 ? '· nenhum agente ainda' : `· ${dados.agentes.length}` }, [grafo])}
      {ultimo !== undefined &&
        secaoQueDobra(el, dobra, 'visao:turno', { texto: 'Último turno', cor: COR.roxo }, [
          // O cartão inteiro abre o turno (o cabeçalho, por botões invisíveis
          // por cima); embaixo, a resposta formatada.
          cartaoClicavel(el, 'visao-ultimo-turno', 'subtle', COR.verde, 3 + Math.ceil((pedido.length + 10) / porLinha), quadro, abrirTurno, [
            <Box key="visao-turno-cabeca" flexDirection="row" columnGap={1}>
              <Box flexGrow={1} flexShrink={1} minWidth={0}>
                <Text wrap="truncate-end">
                  <Text bold>{`Turno ${ultimo.ordem}`}</Text>
                  <Text dimColor>{` · ${ultimo.isAndando ? `em andamento há ${duracaoViva(quadro.agora - ultimo.inicio)}` : duracao(ultimo.duracaoMs)}`}</Text>
                  {ultimo.falhas > 0 && <Text color={COR.vermelho}>{` · ${plural(ultimo.falhas, 'falha', 'falhas')}`}</Text>}
                </Text>
              </Box>
              <Box flexShrink={0}>
                <Button
                  key="visao-abrir-turno"
                  label="Abrir turno"
                  {...comMoldura(quadro)}
                  hover={{ underline: true, color: COR.roxo }}
                  onPress={abrirTurno}
                />
              </Box>
            </Box>,
            etiquetas(el, 'visao-turno-numeros', [
              ultimo.custo !== undefined && { texto: dolar(ultimo.custo), tom: 'verde', isNegrito: true },
              ultimo.variacao !== undefined && { texto: `${ultimo.variacao >= 0 ? '+' : '−'}${tokens(Math.abs(ultimo.variacao))} de contexto`, tom: 'ciano' },
              { texto: plural(ultimo.ferramentas, 'ferramenta', 'ferramentas') },
              chamados > 0 && {
                texto: `${plural(chamados, 'agente chamado', 'agentes chamados')}${agentesDoUltimo.rodadas > chamados ? ` · ${plural(agentesDoUltimo.rodadas, 'rodada', 'rodadas')}` : ''}`,
                tom: 'azul',
              },
            ]),
            pedido !== '' && (
              <Text key="visao-turno-pedido" wrap="wrap">
                <Text color={COR.roxo} bold>{'Pedido  '}</Text>
                <Text>{pedido}</Text>
              </Text>
            ),
            // Os agentes que o turno chamou, entre a pergunta e a resposta.
            agentesDoUltimo.linhas.length > 0 && (
              <Box key="visao-turno-agentes" flexDirection="column">
                <Box flexDirection="row" columnGap={2}>
                  <Text color={COR.roxo} bold>{`Agentes que ele chamou ${contagemDaLista(agentesDoUltimo)}`}</Text>
                  <Button key="visao-ver-agentes" label="ver na aba Agentes" plain dimColor hover={{ underline: true, color: COR.ciano }} onPress={() => acoes.aba(1)} />
                </Box>
                {agentesDoUltimo.linhas}
              </Box>
            ),
            <Box key="visao-turno-resposta" flexDirection="column">
              <Text color={COR.roxo} bold>Resposta</Text>
              {respostaDoUltimo === '' ? (
                <Text dimColor>{ultimo.isAndando ? 'O turno ainda está em andamento.' : 'Sem texto de resposta.'}</Text>
              ) : (
                <el.Markdown text={comecoDoTexto(respostaDoUltimo, quadro.isCompacto ? 300 : 900)} />
              )}
            </Box>,
          ]),
        ])}
      {secaoQueDobra(el, dobra, 'visao:edicoes', { texto: 'Últimas edições', cor: COR.verde, contagem: `· ${edicoes.length}` }, [
        <Text key="visao-edicoes-ajuda" dimColor wrap="wrap">
          A edição mais recente de cada arquivo nesta sessão. ▸ abre o diff aqui; o nome leva à aba Diffs.
        </Text>,
        edicoes.length === 0 && <Text key="visao-sem-edicoes" dimColor>Nenhuma edição nesta sessão ainda.</Text>,
        ...edicoes.map(({ edicao, turno }) => {
          const chave = `aberta:edicao:${edicao.caminho}`
          const isAberta = (quadro.fechadas ?? []).includes(chave)
          const texto = diffDaEdicao(edicao.linhas).texto
          const desenho = isAberta && el.Svg !== null && !quadro.isTerminal ? desenharDiff(texto, (quadro.largura - 6) * PIXELS_POR_COLUNA) : undefined

          return (
            <Box key={`visao-edicao-${edicao.caminho}`} flexDirection="column">
              <Box flexDirection="row" columnGap={1}>
                <Box flexShrink={0}>
                  <Button
                    key={`visao-diff-${edicao.caminho}`}
                    label={isAberta ? '▾ diff' : '▸ diff'}
                    {...comMoldura(quadro)}
                    hover={{ color: COR.verde, bold: true }}
                    onPress={() => acoes.alternarSecao(chave)}
                  />
                </Box>
                <Text color={edicao.isNovo ? COR.verde : edicao.isApagado === true ? COR.vermelho : COR.ambar} bold>
                  {edicao.isNovo ? 'A' : edicao.isApagado === true ? 'D' : 'M'}
                </Text>
                <Box flexShrink={1} minWidth={0}>
                  <Button
                    key={`visao-arquivo-${edicao.caminho}`}
                    label={relativo(edicao.caminho, quadro.raiz)}
                    plain
                    hover={{ underline: true, color: COR.verde }}
                    onPress={() => acoes.diffDoArquivo(edicao.caminho)}
                  />
                </Box>
                <Text color={COR.verde}>{`+${edicao.mais}`}</Text>
                <Text color={COR.vermelho}>{`−${edicao.menos}`}</Text>
                <Box flexShrink={1} minWidth={0}>
                  <Text dimColor wrap="truncate-end">{`turno ${turno}${edicao.quem === undefined ? '' : ` · por ${edicao.quem}`}`}</Text>
                </Box>
              </Box>
              {isAberta && desenho !== undefined && el.Svg !== null && (
                <el.Svg source={desenho.source} alt={desenho.alt} width={desenho.width} height={desenho.height} isInteractive />
              )}
              {isAberta && desenho === undefined && <el.Code source={texto} format="diff" path={edicao.caminho} wrap="truncate-end" />}
            </Box>
          )
        }),
      ])}
      {disponiveis}
    </Box>
  )
}
