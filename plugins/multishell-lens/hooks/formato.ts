// Formatação em pt-BR, sem Intl: o ambiente do mod não tem DOM nem Node.

const BLOCOS = '▁▂▃▄▅▆▇█'

// Quantos pixels tem uma célula do painel no app Desktop: uma coluna (a
// largura de um dígito na fonte do app) e uma linha. Medidas nos prints do
// app: a coluna dos nomes da linha do tempo (39 colunas, 305 px) e as linhas
// de texto (19 px uma da outra). Os SVG e os botões invisíveis por cima deles
// (os nós do grafo, os indicadores) convertem pixels em células com elas: uma
// medida errada desloca os botões cada vez mais para a direita e para baixo.
export const PIXELS_POR_COLUNA = 7.8
export const PIXELS_POR_LINHA = 19

export const limitar = (valor: number, minimo: number, maximo: number): number =>
  Math.min(maximo, Math.max(minimo, valor))

export const decimal = (valor: number, casas: number): string =>
  valor.toFixed(casas).replace('.', ',')

const semZero = (texto: string): string => texto.replace(/,0$/, '')

export const tokens = (n: number): string => {
  const valor = Math.abs(n)

  if (valor < 1000) {
    return String(Math.round(valor))
  }

  if (valor < 1_000_000) {
    return `${semZero(decimal(valor / 1000, 1))}k`
  }

  return `${semZero(decimal(valor / 1_000_000, 1))}M`
}

export const dolar = (usd: number | undefined): string =>
  usd === undefined ? 'US$ –' : `US$ ${decimal(Math.max(0, usd), 2)}`

const dois = (n: number): string => String(n).padStart(2, '0')

export const duracao = (ms: number): string => {
  const segundos = Math.max(0, ms) / 1000

  if (segundos < 10) {
    return `${decimal(segundos, 1)}s`
  }

  if (segundos < 60) {
    return `${Math.floor(segundos)}s`
  }

  const minutos = Math.floor(segundos / 60)

  if (minutos < 60) {
    return `${minutos}m${dois(Math.floor(segundos % 60))}s`
  }

  return `${Math.floor(minutos / 60)}h${dois(minutos % 60)}`
}

// O tempo de algo que ainda está correndo: em segundos inteiros no primeiro
// minuto e, depois, só em minutos. Assim o painel não precisa ser redesenhado
// a cada segundo (cada desenho troca os botões no app e recria os gráficos).
export const duracaoViva = (ms: number): string => {
  const segundos = Math.floor(Math.max(0, ms) / 1000)

  if (segundos < 60) {
    return `${segundos}s`
  }

  const minutos = Math.floor(segundos / 60)

  if (minutos < 60) {
    return `${minutos} min`
  }

  return `${Math.floor(minutos / 60)}h${dois(minutos % 60)}`
}

export const renovaEm = (iso: string | undefined, agora: number): string | undefined => {
  if (iso === undefined) {
    return undefined
  }

  const quando = Date.parse(iso)

  if (Number.isNaN(quando)) {
    return undefined
  }

  const minutos = Math.ceil((quando - agora) / 60_000)

  if (minutos <= 0) {
    return 'agora'
  }

  if (minutos < 60) {
    return `${minutos}min`
  }

  const horas = Math.floor(minutos / 60)

  return horas < 48 ? `${horas}h${dois(minutos % 60)}` : `${Math.floor(horas / 24)}d`
}

export const barra = (percentual: number, largura: number): { cheio: string; vazio: string } => {
  const cheios = limitar(Math.round((percentual / 100) * largura), 0, largura)

  return { cheio: '█'.repeat(cheios), vazio: '░'.repeat(largura - cheios) }
}

export const grafico = (valores: readonly number[], teto: number): string => {
  const maximo = teto > 0 ? teto : Math.max(1, ...valores)

  return valores
    .map(valor => BLOCOS[limitar(Math.ceil((valor / maximo) * 8), 1, 8) - 1] ?? '▁')
    .join('')
}

// As marcas que o app põe em volta de um texto colado (<pasted_content id="…">
// e o fechamento): no pedido mostrado, só o texto.
export const semMarcas = (texto: string): string =>
  texto.replace(/<\/?pasted_content\b[^>]*>/g, '').replace(/^\s*\n/, '')

export const umaLinha = (texto: string): string => texto.replace(/\s+/g, ' ').trim()

export const curto = (texto: string, maximo: number): string =>
  texto.length > maximo ? `${texto.slice(0, Math.max(1, maximo - 1))}…` : texto

// Encurtado pelo meio: "feature/checkout-re…keeps-going". Num ramo ou num
// arquivo, o começo e o fim é que distinguem um do outro.
export const curtoNoMeio = (texto: string, maximo: number): string => {
  const letras = [...texto]

  if (letras.length <= maximo) {
    return texto
  }

  const cabem = Math.max(1, maximo - 1)
  const inicio = Math.ceil(cabem / 2)

  return `${letras.slice(0, inicio).join('')}…${letras.slice(letras.length - (cabem - inicio)).join('')}`
}

// O dia e a hora de um instante, no fuso do computador: "05/10" e "21:31".
const doisDigitos = (n: number): string => String(n).padStart(2, '0')

export const diaDoMes = (ms: number): string => {
  const data = new Date(ms)

  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}`
}

export const horaDoDia = (ms: number): string => {
  const data = new Date(ms)

  return `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}`
}

// O dia e a hora de um instante, para um título: "05/10 às 20:30".
// A hora com os segundos: os agentes duram segundos, e dois começam no mesmo minuto.
export const horaExata = (ms: number): string => {
  const data = new Date(ms)

  return `${horaDoDia(ms)}:${doisDigitos(data.getSeconds())}`
}

export const diaEHora = (ms: number): string => `${diaDoMes(ms)} às ${horaDoDia(ms)}`

export const primeiraLinha = (texto: string): string =>
  texto
    .split('\n')
    .map(linha => linha.trim())
    .find(linha => linha !== '') ?? ''

export const modeloCurto = (id: string): string =>
  id.replace(/^claude-/, '').replace(/-\d{8}$/, '')

export const relativo = (caminho: string, raiz: string): string =>
  raiz !== '' && caminho.startsWith(`${raiz}/`) ? caminho.slice(raiz.length + 1) : caminho

export const plural = (n: number, um: string, varios: string): string =>
  `${n} ${n === 1 ? um : varios}`

export const nomeDoLimite = (tipo: string): string => {
  if (tipo === 'five_hour') {
    return '5 h'
  }

  if (tipo === 'seven_day') {
    return '7 dias'
  }

  return tipo === 'spend_limit' ? 'gasto' : tipo
}

export const nomeCurtoDoLimite = (tipo: string): string => {
  if (tipo === 'five_hour') {
    return '5h'
  }

  if (tipo === 'seven_day') {
    return '7d'
  }

  return tipo === 'spend_limit' ? 'gasto' : tipo
}

// Markdown e Code só aceitam tab e quebra de linha como caracteres de
// controle: saem as sequências ANSI e o resto dos controles.
export const limpo = (texto: string): string =>
  texto
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '')

// O fim de um texto longo, com o aviso do que ficou de fora.
export const cauda = (texto: string, maximo: number): string =>
  texto.length > maximo ? `… ${texto.length - maximo} caracteres antes\n${texto.slice(-maximo)}` : texto

export const cabeca = (texto: string, maximo: number): string =>
  texto.length > maximo ? `${texto.slice(0, maximo)}\n… mais ${texto.length - maximo} caracteres` : texto

// Um comando ou padrão com a pasta do projeto encurtada: /proj/src vira src,
// e /proj sozinho vira um ponto.
export const semRaiz = (texto: string, raiz: string): string =>
  raiz.length < 2 ? texto : texto.split(`${raiz}/`).join('').split(raiz).join('.')
