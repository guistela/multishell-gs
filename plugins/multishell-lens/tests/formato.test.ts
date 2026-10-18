// Pequenas contas de texto e de custo que as telas usam.

import { expect, test } from 'claude-code/testing'
import { comCustoVisto } from '../hooks/dados'
import { semMarcas, umaLinha } from '../hooks/formato'

test('pedido colado: as marcas <pasted_content> somem, o texto fica', () => {
  const colado = '<pasted_content id="9db2">\nQuero revisar a versão.\n</pasted_content id="9db2">\n\nE mais isto.'

  expect(umaLinha(semMarcas(colado))).toBe('Quero revisar a versão. E mais isto.')
  expect(semMarcas('sem marca nenhuma')).toBe('sem marca nenhuma')
})

test('custo: o total sobe com o que os agentes gastam entre as medidas, e nunca desce', () => {
  const contexto = { janela: 1_000_000, historico: [], limites: [], custo: 2.22 }

  expect(comCustoVisto(contexto, 5.06).custo).toBe(5.06)
  // Menos de um centavo, ou um valor menor, não muda nada (nem redesenha).
  expect(comCustoVisto(contexto, 2.225)).toBe(contexto)
  expect(comCustoVisto(contexto, 1)).toBe(contexto)
  expect(comCustoVisto(contexto, undefined)).toBe(contexto)
})
