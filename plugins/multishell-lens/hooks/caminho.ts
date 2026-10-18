// O caminho de um detalhe aberto: de onde ele foi aberto, nível a nível. O
// "Voltar" sobe um nível; o caminho no alto do painel mostra todos e abre
// qualquer um. Nada aqui chama `$`.

import type { LensFoco } from '../types'

// A volta de um detalhe é uma cadeia: o nível de onde ele foi aberto e, depois
// de "|", a volta desse nível. Cada nível: só o número (um turno, o formato
// de antes das cadeias), "agente:<id>", "rodada:<n>:<id>" ou "comando:<id>".
export const voltaDoFoco = (foco: LensFoco): string => {
  const nivel =
    foco.tipo === 'turno'
      ? foco.id
      : foco.tipo === 'rodada'
        ? `rodada:${foco.rodada ?? 1}:${foco.id}`
        : `${foco.tipo}:${foco.id}`

  return foco.volta === undefined || foco.volta === '' ? nivel : `${nivel}|${foco.volta}`
}

// O foco a que uma volta leva, com a volta dele (o resto da cadeia).
export const focoDaVolta = (volta: string | undefined): LensFoco | undefined => {
  if (volta === undefined || volta === '') {
    return undefined
  }

  const corte = volta.indexOf('|')
  const nivel = corte < 0 ? volta : volta.slice(0, corte)
  const resto = corte < 0 ? '' : volta.slice(corte + 1)
  const com = (foco: LensFoco): LensFoco => (resto === '' ? foco : { ...foco, volta: resto })
  const rodada = /^rodada:(\d+):(.+)$/.exec(nivel)

  if (rodada !== null) {
    return com({ tipo: 'rodada', id: rodada[2] ?? '', rodada: Number(rodada[1]) })
  }

  if (nivel.startsWith('agente:')) {
    return com({ tipo: 'agente', id: nivel.slice('agente:'.length) })
  }

  if (nivel.startsWith('comando:')) {
    return com({ tipo: 'comando', id: nivel.slice('comando:'.length) })
  }

  return /^\d+$/.test(nivel) ? com({ tipo: 'turno', id: nivel }) : undefined
}

// A cadeia de um foco, de fora para dentro: de onde ele veio, passo a passo,
// até ele mesmo. Cada nível leva a sua própria volta: abri-lo refaz o caminho.
export const cadeiaDoFoco = (foco: LensFoco): LensFoco[] => {
  const cadeia: LensFoco[] = [foco]
  let acima = focoDaVolta(foco.volta)

  // Uma cadeia nunca passa de uns poucos níveis; o limite é só contra um laço.
  while (acima !== undefined && cadeia.length < 12) {
    cadeia.unshift(acima)
    acima = focoDaVolta(acima.volta)
  }

  return cadeia
}

// O foco com a volta dada (sem volta quando ela é vazia).
export const comVolta = (foco: LensFoco, volta: string | undefined): LensFoco => {
  const { volta: _antiga, ...resto } = foco

  return volta === undefined || volta === '' ? resto : { ...resto, volta }
}
