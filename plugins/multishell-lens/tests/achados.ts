// No app Desktop, os selos, as etiquetas e os títulos das seções são desenhos
// (pílulas e barras de pontas redondas); o texto deles fica no `alt`. Achar um
// texto no desenho é achá-lo num Text ou no alt de um Svg (inteiro, ou uma das
// partes separadas por " · ", com ou sem um espaço de cada lado, como nos
// selos de texto do terminal).

type Achado = { text?: string; props: Record<string, unknown> }

export type Achados = {
  find: (query: { type?: string; key?: string; text?: string | RegExp }) => Promise<Achado | undefined>
  findAll: (query: { type?: string; key?: string; text?: string | RegExp }) => Promise<Achado[]>
}

const casa = (texto: string | RegExp, alvo: string): boolean =>
  typeof texto === 'string'
    ? alvo.includes(texto) || ` ${alvo} `.includes(texto)
    : texto.test(alvo) || texto.test(` ${alvo} `)

export const noDesenho = async (ui: Achados, texto: string | RegExp): Promise<boolean> => {
  if ((await ui.find({ type: 'Text', text: texto })) !== undefined) {
    return true
  }

  for (const svg of await ui.findAll({ type: 'Svg' })) {
    const alt = String(svg.props.alt)

    if ([alt, ...alt.split(' · ')].some(parte => casa(texto, parte))) {
      return true
    }
  }

  return false
}
