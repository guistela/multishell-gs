// Os desenhos do grafo dos agentes (a aba "Agentes") e os ícones da linha de
// status: a conversa principal é um cérebro, cada subagente um robozinho.
// Tudo é SVG sem script (o app desenha o SVG num quadro isolado): a vida vem
// de animações SMIL e de CSS. As cores dos estados vêm das classes `.c-<cor>`
// e a borda do escopo da classe `.borda`, definidas em graficos.ts; o resto
// do que os desenhos precisam está em ESTILO_DOS_DESENHOS, com o tom escuro
// num @media (prefers-color-scheme: dark).

type EstadoDoAgente = 'rodando' | 'ok' | 'falhou'
type EscopoDoAgente = 'global' | 'projeto' | 'plugin' | 'embutido'

const num = (valor: number): string => String(Math.round(valor * 10) / 10)

const COR_DO_ESTADO: Record<EstadoDoAgente, string> = { rodando: 'azul', ok: 'verde', falhou: 'vermelho' }

// A borda diz de onde vem a definição do agente: tracejada (as configurações
// globais), pontilhada (um plugin), contínua (o projeto) ou nenhuma (os
// agentes do próprio Claude Code).
const TRACO_DO_ESCOPO: Record<EscopoDoAgente, string> = {
  global: ' stroke-dasharray="3 2"',
  projeto: '',
  plugin: ' stroke-dasharray="1 2.4" stroke-linecap="round"',
  embutido: '',
}

// Um retângulo arredondado como caminho, para compor com furos (fill-rule evenodd).
const retangulo = (x: number, y: number, w: number, h: number, r: number): string =>
  `M${num(x + r)} ${num(y)} H${num(x + w - r)} A${num(r)} ${num(r)} 0 0 1 ${num(x + w)} ${num(y + r)} V${num(y + h - r)} ` +
  `A${num(r)} ${num(r)} 0 0 1 ${num(x + w - r)} ${num(y + h)} H${num(x + r)} A${num(r)} ${num(r)} 0 0 1 ${num(x)} ${num(y + h - r)} ` +
  `V${num(y + r)} A${num(r)} ${num(r)} 0 0 1 ${num(x + r)} ${num(y)} Z`

const circulo = (cx: number, cy: number, r: number): string =>
  `M${num(cx - r)} ${num(cy)} A${num(r)} ${num(r)} 0 1 0 ${num(cx + r)} ${num(cy)} A${num(r)} ${num(r)} 0 1 0 ${num(cx - r)} ${num(cy)} Z`

type Ponto = readonly [number, number]

// Uma ranhura: um traço curvo de pontas redondas e largura `w`, como caminho
// fechado, para vazar uma dobra num desenho cheio (fill-rule evenodd). Segue
// a quadrática de `p0` a `p1` com o controle `c`, amostrada em `n` pontos
// afastados pela normal de cada um.
const ranhura = (p0: Ponto, c: Ponto, p1: Ponto, w: number, n = 8): string => {
  const lados = Array.from({ length: n + 1 }, (_, k) => {
    const t = k / n
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t ** 2 * p1[0]
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t ** 2 * p1[1]
    const dx = 2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0])
    const dy = 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])
    const tamanho = Math.hypot(dx, dy) || 1
    const nx = (-dy / tamanho) * (w / 2)
    const ny = (dx / tamanho) * (w / 2)

    return { ida: `${num(x + nx)} ${num(y + ny)}`, volta: `${num(x - nx)} ${num(y - ny)}` }
  })
  const ida = lados.map(lado => lado.ida)
  const volta = lados.map(lado => lado.volta).reverse()
  const r = num(w / 2)
  const comeco = ida[0] ?? ''

  return `M${ida.join(' L')} A${r} ${r} 0 0 1 ${volta.join(' L')} A${r} ${r} 0 0 1 ${comeco} Z`
}

// Um hemisfério do cérebro: o contorno em gomos (os giros) ao longo de meia
// elipse de raios `rx` e `ry`, afastada `ox` da fissura do meio, fechado por
// ela. `s` é o lado (-1 à esquerda, 1 à direita); `gomos`, quantos giros; o
// `bojo`, o quanto cada giro estufa para fora da elipse.
const hemisferio = (cx: number, cy: number, s: number, rx: number, ry: number, ox: number, gomos: number, bojo: number): string => {
  const ponto = (a: number, escala = 1) => ({ x: cx + s * (ox + rx * escala * Math.cos(a)), y: cy + ry * escala * Math.sin(a) })
  const topo = ponto(-Math.PI / 2)
  const passos = Array.from({ length: gomos }, (_, k) => {
    const meio = ponto(-Math.PI / 2 + (Math.PI * (k + 0.5)) / gomos, bojo)
    const fim = ponto(-Math.PI / 2 + (Math.PI * (k + 1)) / gomos)

    return `Q${num(meio.x)} ${num(meio.y)} ${num(fim.x)} ${num(fim.y)}`
  })

  return `M${num(topo.x)} ${num(topo.y)} ${passos.join(' ')} Z`
}

// Os vales entre os giros de um hemisfério, cada um com um entalhe curto para
// dentro: os sulcos que dão o desenho do cérebro.
const sulcos = (cx: number, cy: number, s: number, rx: number, ry: number, ox: number, gomos: number, fundo: number): string =>
  Array.from({ length: gomos - 1 }, (_, k) => {
    const a = -Math.PI / 2 + (Math.PI * (k + 1)) / gomos
    const x = cx + s * (ox + rx * Math.cos(a))
    const y = cy + ry * Math.sin(a)
    // Para dentro: na direção do meio do hemisfério.
    const dx = cx + s * (ox + rx * 0.3) - x
    const dy = cy - y
    const tamanho = Math.max(1, Math.hypot(dx, dy))

    return `M${num(x)} ${num(y)} L${num(x + (dx / tamanho) * fundo)} ${num(y + (dy / tamanho) * fundo)}`
  }).join(' ')

// Um agente, desenhado como um robozinho: a cabeça e o corpo na cor do estado
// (com a borda do escopo da definição), um visor escuro com os olhos acesos,
// a antena, as orelhas e os bracinhos. Rodando, ele quica, os olhos leem de
// um lado para o outro, os braços digitam e a luz da antena pisca âmbar;
// concluído, sorri e flutua devagar; com falha, fica quieto, de olhos em X.
// `i` desencontra as animações de um robô para o outro. Tudo cabe numa caixa
// de 44 x 40 com o centro em (x, y): os rótulos ficam a 21 px dos lados.
export const robo = (x: number, y: number, estado: EstadoDoAgente, escopo: EscopoDoAgente, i: number): string => {
  const cor = COR_DO_ESTADO[estado]
  const isRodando = estado === 'rodando'
  const p = (dx: number, dy: number) => `${num(x + dx)} ${num(y + dy)}`
  // As peças com a borda do escopo. O embutido fica sem a classe `borda` (e
  // sem o traço): assim não há contorno nenhum, sem brigar com o CSS dela.
  const borda = escopo === 'embutido' ? '' : ` borda borda-${escopo}`
  const traco = TRACO_DO_ESCOPO[escopo]
  // Um atraso que desencontra o começo das animações de um robô para o outro.
  const fase = (periodo: number) => ` begin="-${num((i * 0.37 * periodo) % periodo)}s"`

  // A luz da antena: âmbar piscando (com uma aura) trabalhando; parado, na
  // cor do estado, respirando; com falha, apagada.
  const luz = isRodando
    ? `<circle class="c-ambar" cx="${num(x)}" cy="${num(y - 17)}" r="5" opacity=".35"><animate attributeName="opacity" values=".35;.05;.35" dur="${num(0.9 + (i % 3) * 0.2)}s"${fase(0.9)} repeatCount="indefinite"/></circle>` +
      `<circle class="c-ambar" cx="${num(x)}" cy="${num(y - 17)}" r="2.6"><animate attributeName="opacity" values="1;.3;1" dur="${num(0.9 + (i % 3) * 0.2)}s"${fase(0.9)} repeatCount="indefinite"/></circle>`
    : estado === 'ok'
      ? `<circle class="c-${cor}" cx="${num(x)}" cy="${num(y - 17)}" r="2.5"><animate attributeName="opacity" values="1;.45;1" dur="3.2s"${fase(3.2)} repeatCount="indefinite"/></circle>`
      : `<circle class="c-${cor}" cx="${num(x)}" cy="${num(y - 17)}" r="2.5" opacity=".55"/>`
  const haste = `<path class="robo-haste" d="M${p(0, -11)} L${p(0, -14.6)}"/>`

  // Os olhos acesos no visor: piscam (rápido trabalhando, de vez em quando
  // parado) e, trabalhando, correm de um lado para o outro, como quem lê.
  const pisca = `<animate attributeName="ry" values="2.1;2.1;.3;2.1" keyTimes="0;.92;.96;1" dur="${num(isRodando ? 2.4 + (i % 4) * 0.4 : 5.5 + (i % 4) * 0.9)}s"${fase(2.4)} repeatCount="indefinite"/>`
  const olho = (dx: number) =>
    `<ellipse class="robo-olho" cx="${num(x + dx)}" cy="${num(y - 3.2)}" rx="2.1" ry="2.1">${pisca}</ellipse>`
  const olhoEmX = (dx: number) =>
    `<path class="robo-boca" d="M${p(dx - 2, -5.2)} L${p(dx + 2, -1.2)} M${p(dx + 2, -5.2)} L${p(dx - 2, -1.2)}"/>`
  const olhos =
    estado === 'falhou'
      ? olhoEmX(-4.3) + olhoEmX(4.3)
      : `<g>${
          isRodando
            ? `<animateTransform attributeName="transform" type="translate" values="-1 0;1.1 0;1.1 0;-1 0" keyTimes="0;.45;.6;1" dur="${num(1.8 + (i % 3) * 0.3)}s"${fase(1.8)} repeatCount="indefinite"/>`
            : ''
        }${olho(-4.3)}${olho(4.3)}</g>`

  // A boca: trabalhando, três pontinhos que acendem em sequência (como quem
  // digita); concluído, um sorriso; com falha, um bico para baixo.
  const boca = isRodando
    ? [-2.7, 0, 2.7]
        .map(
          (dx, k) =>
            `<circle class="robo-olho" cx="${num(x + dx)}" cy="${num(y + 1.7)}" r=".95"><animate attributeName="opacity" values=".2;1;.2" dur=".9s" begin="-${num(0.9 - k * 0.25)}s" repeatCount="indefinite"/></circle>`,
        )
        .join('')
    : estado === 'ok'
      ? `<path class="robo-boca" d="M${p(-3.2, 0.6)} Q${p(0, 3.2)} ${p(3.2, 0.6)}"/>`
      : `<path class="robo-boca" d="M${p(-3, 2.7)} Q${p(0, 0.2)} ${p(3, 2.7)}"/>`

  // Trabalhando, ele quica; concluído, flutua devagar; com falha, fica quieto
  // e um pouco caído para o lado.
  const balanco = isRodando
    ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2.2;0 0" dur="${num(1.1 + (i % 3) * 0.15)}s"${fase(1.1)} repeatCount="indefinite"/>`
    : estado === 'ok'
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -1;0 0" dur="${num(3.6 + (i % 3) * 0.5)}s"${fase(3.6)} repeatCount="indefinite"/>`
      : ''
  const caido = estado === 'falhou' ? ` transform="rotate(-6 ${p(0, 0)})"` : ''

  // Os braços: trabalhando, sobem e descem alternados, como quem digita.
  const braco = (bx: number, atraso: number) =>
    `<rect class="c-${cor}${borda}" x="${num(bx)}" y="${num(y + 9.6)}" width="3.8" height="7" rx="1.9">` +
    (isRodando
      ? `<animateTransform attributeName="transform" type="translate" values="0 0;0 -2;0 0" dur=".45s" begin="${num(atraso)}s" repeatCount="indefinite"/>`
      : '') +
    '</rect>'
  // As orelhas: dois parafusos de lado, por baixo da cabeça.
  const orelha = (ox: number) => `<rect class="c-${cor}${borda}" x="${num(ox)}" y="${num(y - 5)}" width="4" height="6" rx="1.6"/>`

  return (
    `<g${caido}>${balanco}` +
    haste +
    luz +
    orelha(x - 15) +
    orelha(x + 11) +
    braco(x - 15.8, 0) +
    braco(x + 12, 0.22) +
    `<rect class="robo-pescoco" x="${num(x - 2.6)}" y="${num(y + 6)}" width="5.2" height="4.4"/>` +
    // O corpo, com um painelzinho escuro no peito.
    `<rect class="c-${cor}${borda}" x="${num(x - 9)}" y="${num(y + 9.6)}" width="18" height="7.6" rx="3.2"${traco}/>` +
    `<rect class="robo-visor" x="${num(x - 3.6)}" y="${num(y + 11.8)}" width="7.2" height="3.2" rx="1.4"/>` +
    // A cabeça, com um brilho no canto e o visor escuro com a cara.
    `<rect class="c-${cor}${borda}" x="${num(x - 12)}" y="${num(y - 11)}" width="24" height="18" rx="6.5"${traco}/>` +
    `<rect class="robo-visor" x="${num(x - 9)}" y="${num(y - 8)}" width="18" height="12" rx="4"/>` +
    `<ellipse class="robo-brilho" cx="${num(x - 5.5)}" cy="${num(y - 9.5)}" rx="3.4" ry="1"/>` +
    olhos +
    boca +
    '</g>'
  )
}

// A conversa principal, desenhada como um cérebro num disco na cor do Claude:
// dois hemisférios em gomos, com os sulcos e as dobras, sobre um disco com um
// brilho suave. Pensando, ondas saem do disco, faíscas giram em volta e os
// pontos de sinapse acendem nas dobras; parado, só um halo que respira. O
// disco tem raio 24; as ondas chegam ao raio 48.
export const cerebro = (x: number, y: number, isTrabalhando: boolean): string => {
  const p = (dx: number, dy: number) => `${num(x + dx)} ${num(y + dy)}`
  const massa = (s: number) => hemisferio(x, y, s, 14, 12.2, 1.5, 5, 1.26)
  const vales = (s: number) => sulcos(x, y, s, 14, 12.2, 1.5, 5, 2.6)
  // Três dobras por hemisfério, em curvas que acompanham os giros.
  const dobras = (s: number) =>
    `M${p(s * 4, -7.2)} C${p(s * 7.5, -9.6)} ${p(s * 11.5, -7)} ${p(s * 10, -3.4)} ` +
    `M${p(s * 13.4, 0.4)} C${p(s * 9.6, -1.6)} ${p(s * 5.6, 1.4)} ${p(s * 7.6, 5.2)} ` +
    `M${p(s * 3.6, 8.6)} C${p(s * 6, 5)} ${p(s * 9.6, 5.8)} ${p(s * 11.4, 3.2)}`

  const gradiente =
    '<defs><radialGradient id="cerebro-luz" cx=".36" cy=".3" r=".72">' +
    '<stop offset="0" stop-color="#ffffff" stop-opacity=".42"/>' +
    '<stop offset=".55" stop-color="#ffffff" stop-opacity="0"/>' +
    '<stop offset="1" stop-color="#000000" stop-opacity=".14"/>' +
    '</radialGradient></defs>'

  // Pensando, o disco pulsa; parado, respira devagar. `r` é o raio em repouso.
  const pulso = (r: number) =>
    isTrabalhando
      ? `<animate attributeName="r" values="${num(r)};${num(r + 1.2)};${num(r)}" dur="1.2s" repeatCount="indefinite"/>`
      : `<animate attributeName="r" values="${num(r)};${num(r + 0.6)};${num(r)}" dur="4s" repeatCount="indefinite"/>`

  const ondas = isTrabalhando
    ? [0, 1]
        .map(
          atraso =>
            `<circle class="cerebro-onda" cx="${num(x)}" cy="${num(y)}" r="26"><animate attributeName="r" values="26;48" dur="2s" begin="${atraso}s" repeatCount="indefinite"/>` +
            `<animate attributeName="opacity" values=".5;0" dur="2s" begin="${atraso}s" repeatCount="indefinite"/></circle>`,
        )
        .join('')
    : ''
  // As faíscas: três estrelinhas de quatro pontas, em órbita, cintilando.
  const estrela = (cx: number, cy: number, r: number) =>
    `M${num(cx)} ${num(cy - r)} Q${num(cx)} ${num(cy)} ${num(cx + r)} ${num(cy)} Q${num(cx)} ${num(cy)} ${num(cx)} ${num(cy + r)} ` +
    `Q${num(cx)} ${num(cy)} ${num(cx - r)} ${num(cy)} Q${num(cx)} ${num(cy)} ${num(cx)} ${num(cy - r)} Z`
  const faiscas = isTrabalhando
    ? `<g><animateTransform attributeName="transform" type="rotate" from="0 ${p(0, 0)}" to="360 ${p(0, 0)}" dur="4s" repeatCount="indefinite"/>` +
      [
        { angulo: 0, raio: 32, tamanho: 3.4, dur: 1.3 },
        { angulo: 120, raio: 33.5, tamanho: 2.6, dur: 1.7 },
        { angulo: 240, raio: 31, tamanho: 3, dur: 1.5 },
      ]
        .map(({ angulo, raio, tamanho, dur }, k) => {
          const a = (angulo * Math.PI) / 180

          return (
            `<path class="cerebro-faisca" d="${estrela(x + raio * Math.cos(a), y + raio * Math.sin(a), tamanho)}">` +
            `<animate attributeName="opacity" values=".45;1;.45" dur="${num(dur)}s" begin="-${num(k * 0.4)}s" repeatCount="indefinite"/></path>`
          )
        })
        .join('') +
      '</g>'
    : ''
  // Parado: um halo suave que respira em volta do disco.
  const halo = isTrabalhando
    ? ''
    : `<circle class="cerebro-halo" cx="${num(x)}" cy="${num(y)}" r="28" opacity=".12"><animate attributeName="r" values="27;31;27" dur="4s" repeatCount="indefinite"/><animate attributeName="opacity" values=".08;.18;.08" dur="4s" repeatCount="indefinite"/></circle>`
  // Pensando, pontinhos acendem nas pontas das dobras, um depois do outro.
  const pontas: readonly [number, number][] = [
    [-10, -3.4],
    [7.6, 5.2],
    [-11.4, 3.2],
    [4, -7.2],
    [11.4, 3.2],
    [-7.6, 5.2],
  ]
  const sinapses = isTrabalhando
    ? pontas
        .map(
          ([dx, dy], k) =>
            `<circle class="cerebro-sinapse" cx="${num(x + dx)}" cy="${num(y + dy)}" r="1.6" opacity="0">` +
            `<animate attributeName="opacity" values="0;0;1;0;0" keyTimes="0;.1;.2;.35;1" dur="2.4s" begin="${num(k * 0.4)}s" repeatCount="indefinite"/>` +
            `<animate attributeName="r" values="1;1;2;1;1" keyTimes="0;.1;.2;.35;1" dur="2.4s" begin="${num(k * 0.4)}s" repeatCount="indefinite"/></circle>`,
        )
        .join('')
    : ''

  return (
    gradiente +
    ondas +
    halo +
    faiscas +
    `<circle class="c-marca" cx="${num(x)}" cy="${num(y)}" r="24">${pulso(24)}</circle>` +
    `<circle fill="url(#cerebro-luz)" cx="${num(x)}" cy="${num(y)}" r="24">${pulso(24)}</circle>` +
    `<circle class="cerebro-aro" cx="${num(x)}" cy="${num(y)}" r="23.5">${pulso(23.5)}</circle>` +
    // A sombra por baixo da massa, para ela se soltar do disco.
    `<path class="cerebro-sombra" d="${hemisferio(x, y + 1.6, -1, 14, 12.2, 1.5, 5, 1.26)} ${hemisferio(x, y + 1.6, 1, 14, 12.2, 1.5, 5, 1.26)}"/>` +
    `<path class="cerebro-massa" d="${massa(-1)} ${massa(1)}"/>` +
    `<path class="cerebro-dobra" d="${vales(-1)} ${vales(1)} ${dobras(-1)} ${dobras(1)}"/>` +
    sinapses
  )
}

// O CSS de que os desenhos precisam, além das classes `.c-<cor>` e `.borda`
// de graficos.ts (que não se redefinem aqui), com o tom escuro de cada coisa.
export const ESTILO_DOS_DESENHOS: string = [
  // O robô: o visor escuro com a cara acesa, o brilho da cabeça, a haste e o
  // pescoço em cinza.
  '.robo-visor{fill:#1f2328;fill-opacity:.84}',
  '.robo-olho{fill:#ffffff}',
  '.robo-boca{fill:none;stroke:#ffffff;stroke-width:1.5;stroke-linecap:round}',
  '.robo-brilho{fill:#ffffff;fill-opacity:.4}',
  '.robo-haste{fill:none;stroke:#8c959f;stroke-width:1.6;stroke-linecap:round}',
  '.robo-pescoco{fill:#8c959f}',
  // O cérebro: a massa de creme com o traço marrom, a sombra por baixo, o aro
  // claro do disco, as ondas e o halo na cor do Claude, as faíscas em âmbar.
  '.cerebro-massa{fill:#fff4ef;stroke:#9c3f1f;stroke-width:1.3;stroke-linejoin:round}',
  '.cerebro-dobra{fill:none;stroke:#9c3f1f;stroke-width:1.1;stroke-linecap:round}',
  '.cerebro-sombra{fill:#6e2410;fill-opacity:.3}',
  '.cerebro-aro{fill:none;stroke:#ffffff;stroke-opacity:.26;stroke-width:1}',
  '.cerebro-onda{fill:none;stroke:#d97757;stroke-width:1.5}',
  '.cerebro-halo{fill:#d97757}',
  '.cerebro-faisca{fill:#f2b84b}',
  '.cerebro-sinapse{fill:#d97757}',
  '@media (prefers-color-scheme: dark){',
  '.robo-visor{fill:#111417;fill-opacity:.9}',
  '.robo-haste{stroke:#9aa4ae}.robo-pescoco{fill:#9aa4ae}',
  '.cerebro-massa{fill:#fbe9df}',
  '.cerebro-onda{stroke:#e6a184}.cerebro-halo{fill:#e6a184}',
  '}',
].join('')

// Um cérebro de 14 px para a linha de status, na cor `cor` (um só tom), visto
// de cima como o do grafo: os dois hemisférios em gomos, a fissura entre eles
// e duas dobras vazadas em gancho em cada um. Diz que a conversa principal
// está trabalhando; animado, ele pulsa de leve.
export const iconeDoCerebro = (cx: number, cy: number, cor: string, isAnimado: boolean): string => {
  const lado = (s: number) =>
    `${hemisferio(cx, cy, s, 5.3, 5.1, 0.9, 4, 1.3)} ` +
    `${ranhura([cx + s * 1.8, cy - 3.2], [cx + s * 4.2, cy - 3.6], [cx + s * 4.3, cy - 0.9], 1.15)} ` +
    ranhura([cx + s * 4.6, cy + 0.9], [cx + s * 2.4, cy + 1.3], [cx + s * 2.6, cy + 3.5], 1.15)
  const massa = `<path d="${lado(-1)} ${lado(1)}" fill-rule="evenodd" style="fill:${cor}"/>`

  if (!isAnimado) {
    return massa
  }

  // A escala gira em volta do centro: translada até ele, escala, volta.
  return (
    `<g><animate attributeName="opacity" values="1;.65;1" dur="1.6s" repeatCount="indefinite"/>` +
    `<g transform="translate(${num(cx)} ${num(cy)})"><g>` +
    '<animateTransform attributeName="transform" type="scale" values="1;1.1;1" dur="1.6s" repeatCount="indefinite"/>' +
    `<g transform="translate(${num(-cx)} ${num(-cy)})">${massa}</g></g></g></g>`
  )
}

// Uma cabeça de robô de 14 px para a linha de status, na cor `cor`: a cabeça
// com os olhos e a boca vazados, as orelhas e a antena. Animado, a luz da
// antena pisca e a cabeça balança de leve: há agentes rodando.
export const iconeDoRobo = (cx: number, cy: number, cor: string, isAnimado: boolean): string => {
  const cabeca =
    retangulo(cx - 5.5, cy - 2.4, 11, 8.4, 2.6) +
    ' ' +
    circulo(cx - 2.4, cy + 1.3, 1.35) +
    ' ' +
    circulo(cx + 2.4, cy + 1.3, 1.35) +
    ' ' +
    retangulo(cx - 2.1, cy + 3.5, 4.2, 1.4, 0.7)
  const corpo =
    `<path d="${cabeca}" fill-rule="evenodd" style="fill:${cor}"/>` +
    `<rect x="${num(cx - 7)}" y="${num(cy + 0.2)}" width="1.9" height="3.8" rx=".9" style="fill:${cor}"/>` +
    `<rect x="${num(cx + 5.1)}" y="${num(cy + 0.2)}" width="1.9" height="3.8" rx=".9" style="fill:${cor}"/>` +
    `<path d="M${num(cx)} ${num(cy - 2.4)} L${num(cx)} ${num(cy - 4.6)}" fill="none" style="stroke:${cor}" stroke-width="1.3" stroke-linecap="round"/>`
  const luz =
    `<circle cx="${num(cx)}" cy="${num(cy - 5.7)}" r="1.4" style="fill:${cor}">` +
    (isAnimado ? '<animate attributeName="opacity" values="1;.2;1" dur=".9s" repeatCount="indefinite"/>' : '') +
    '</circle>'

  if (!isAnimado) {
    return corpo + luz
  }

  return (
    '<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -.6;0 0" dur="1.2s" repeatCount="indefinite"/>' +
    corpo +
    luz +
    '</g>'
  )
}
