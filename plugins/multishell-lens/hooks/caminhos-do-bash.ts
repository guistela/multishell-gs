// Os arquivos que um comando Bash lê e escreve, adivinhados pelo texto do
// comando: os subagentes tocam arquivo por cat, sed, grep, redirecionamento,
// e a aba Árvore só via os Read/Edit/Write. Função pura, sem olhar o disco:
// um palpite bom, não uma certeza. Nunca lança: devolve o que achou.

export type ArquivoDoComando = { caminho: string; acao: 'lendo' | 'editando' }

type Acao = ArquivoDoComando['acao']
type Anotar = (texto: string, acao: Acao) => void
type Palavra = { texto: string; redireciona?: Acao | 'nada' }

const MAX_ARQUIVOS = 30

// Palavras antes do comando que só mudam como ele roda.
const PREFIXOS = new Set(['sudo', 'time', 'command', 'env', 'nohup', 'exec', 'builtin'])

// Comandos cujos argumentos são arquivos lidos.
const LEITORES = new Set([
  'cat', 'head', 'tail', 'less', 'more', 'wc', 'nl', 'sort', 'uniq', 'diff', 'cmp', 'file', 'stat',
  'md5', 'md5sum', 'shasum', 'sha1sum', 'sha256sum', 'bat', 'tac', 'strings', 'source', '.',
])
// Comandos cujos argumentos são arquivos escritos (o mv conta os dois lados).
const EDITORES = new Set(['tee', 'rm', 'mv'])
const PADROES = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ugrep', 'ag'])
const AWKS = new Set(['awk', 'gawk', 'mawk'])
const INTERPRETES = new Set(['python', 'python3', 'python2', 'node', 'bash', 'sh', 'zsh', 'ruby'])

// Opções que engolem o argumento seguinte, por comando: cada letra do formato
// é um argumento engolido, e um "a" é um arquivo lido ("-f PADROES").
const PADRAO_OPCOES = {
  '-e': 't', '-f': 'a', '-m': 't', '-A': 't', '-B': 't', '-C': 't', '-d': 't', '-g': 't', '-t': 't', '-j': 't',
  '--regexp': 't', '--file': 'a', '--include': 't', '--exclude': 't', '--exclude-dir': 't', '--glob': 't',
  '--type': 't', '--max-count': 't', '--max-depth': 't',
}
const SED_OPCOES = { '-e': 't', '-f': 'a', '--expression': 't', '--file': 'a' }
const AWK_OPCOES = { '-F': 't', '-v': 't', '-f': 'a' }
const JQ_OPCOES = {
  '-f': 'a', '--from-file': 'a', '--arg': 'tt', '--argjson': 'tt', '--slurpfile': 'ta', '--rawfile': 'ta',
  '--indent': 't', '-L': 't',
}
const INTERPRETE_OPCOES = { '-c': 't', '-m': 't', '-e': 't', '--eval': 't', '-r': 't', '-W': 't', '-X': 't', '-o': 't' }
const TOUCH_OPCOES = { '-t': 't', '-d': 't', '-r': 't' }
const PATCH_OPCOES = { '-i': 'a', '--input': 'a', '-p': 't', '-d': 't' }

// Um heredoc some inteiro: o corpo é dado, não caminho. A linha de abertura
// fica, menos o `<<EOF`, porque pode ter um `> saida.txt` depois dele.
const semHeredocs = (comando: string): string => {
  const saida: string[] = []
  let fim: string | undefined

  for (const linha of comando.split('\n')) {
    if (fim !== undefined) {
      fim = linha.trim() === fim ? undefined : fim
      continue
    }

    const abertura = /(?<!<)<<(?!<)-?\s*(['"]?)(\w+)\1/.exec(linha)

    if (abertura === null) {
      saida.push(linha)
      continue
    }

    fim = abertura[2]
    saida.push(linha.replace(abertura[0], ' '))
  }

  return saida.join('\n')
}

// `''.includes('')` é verdadeiro: no fim do texto a letra é undefined.
const um = (letra: string | undefined, conjunto: string): boolean => letra !== undefined && conjunto.includes(letra)

// Separa o comando em trechos (entre &&, ||, ;, |, &, quebras de linha e
// parênteses) e cada trecho em palavras, respeitando aspas. Um > ou < fora
// de aspas vira uma palavra de redirecionamento, que marca a palavra seguinte.
const trechos = (comando: string): Palavra[][] => {
  const todos: Palavra[][] = []
  let trecho: Palavra[] = []
  let texto = ''

  const fechar = (): void => {
    if (texto !== '') {
      trecho.push({ texto })
    }

    texto = ''
  }

  const cortar = (): void => {
    fechar()

    if (trecho.length > 0) {
      todos.push(trecho)
    }

    trecho = []
  }

  for (let i = 0; i < comando.length; i += 1) {
    const c = comando[i] ?? ''
    const proximo = comando[i + 1] ?? ''

    if (c === "'") {
      const fim = comando.indexOf("'", i + 1)
      texto += comando.slice(i + 1, fim === -1 ? undefined : fim)
      i = fim === -1 ? comando.length : fim
    } else if (c === '"') {
      i += 1

      while (i < comando.length && comando[i] !== '"') {
        const isEscape = comando[i] === '\\' && um(comando[i + 1], '"\\$`')
        texto += (isEscape ? comando[i + 1] : comando[i]) ?? ''
        i += isEscape ? 2 : 1
      }
    } else if (c === '\\') {
      texto += proximo === '\n' ? '' : proximo
      i += 1
    } else if (c === '#' && texto === '') {
      const fim = comando.indexOf('\n', i)
      i = fim === -1 ? comando.length : fim - 1
    } else if (c === ' ' || c === '\t' || c === '\r') {
      fechar()
    } else if (c === '&' && proximo !== '>') {
      i += proximo === '&' ? 1 : 0
      cortar()
    } else if (';\n()`'.includes(c) || c === '|') {
      i += c === '|' && proximo === '|' ? 1 : 0
      cortar()
    } else if (c === '<' || c === '>' || c === '&') {
      // "2>": o número colado antes é o descritor, não um arquivo.
      texto = /^\d+$/.test(texto) ? '' : texto
      fechar()
      let op = c

      while (um(comando[i + 1], '<>&|')) {
        i += 1
        op += comando[i] ?? ''
      }

      // "2>&1" e ">&2" só trocam descritores: não há arquivo.
      if (op.endsWith('&') && /[\d-]/.test(comando[i + 1] ?? '')) {
        while (/[\d-]/.test(comando[i + 1] ?? '')) {
          i += 1
        }
      } else {
        trecho.push({ texto: op, redireciona: op.includes('<<') ? 'nada' : op.includes('>') ? 'editando' : 'lendo' })
      }
    } else {
      texto += c
    }
  }

  cortar()

  return todos
}

const normalizar = (caminho: string): string => {
  const partes: string[] = []

  for (const parte of caminho.split('/')) {
    if (parte === '..') {
      partes.pop()
    } else if (parte !== '' && parte !== '.') {
      partes.push(parte)
    }
  }

  return `/${partes.join('/')}`
}

// O que dá para chamar de arquivo: tem barra ou extensão, não é opção, não
// é só número, não termina em barra (isso é pasta).
const pareceArquivo = (texto: string): boolean =>
  !texto.startsWith('-') &&
  !texto.endsWith('/') &&
  !texto.startsWith('/dev/') &&
  !/^[\d.]+$/.test(texto) &&
  (texto.includes('/') || /\.\w+$/.test(texto))

// Separa opções de argumentos posicionais, engolindo o argumento das opções
// que têm um e anotando como lido o que o formato marca com "a".
const posicionais = (args: readonly string[], formatos: Record<string, string>, anotar: Anotar): string[] => {
  const sobram: string[] = []

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? ''

    if (arg === '--') {
      sobram.push(...args.slice(i + 1))
      break
    }

    if (!arg.startsWith('-')) {
      sobram.push(arg)
      continue
    }

    for (const letra of formatos[arg] ?? '') {
      i += 1

      if (letra === 'a') {
        anotar(args[i] ?? '', 'lendo')
      }
    }
  }

  return sobram
}

// grep, sed, awk, jq: o primeiro posicional é o padrão ou o programa, a não
// ser que ele já tenha vindo por -e/-f.
const depoisDoPadrao = (args: readonly string[], formatos: Record<string, string>, anotar: Anotar): string[] => {
  const sobram = posicionais(args, formatos, anotar)
  const temPadrao = args.some(arg => /^(-[ef]|--(expression|regexp|file|from-file)(=|$))/.test(arg))

  return temPadrao ? sobram : sobram.slice(1)
}

const temOpcao = (args: readonly string[], letra: string, longa: string): boolean =>
  args.some(arg => new RegExp(`^-[a-zA-Z]*${letra}`).test(arg) || arg.startsWith(longa))

// O que cada comando faz com seus argumentos.
const examinar = (nome: string, args: readonly string[], anotar: Anotar): void => {
  const tudo = (acao: Acao, formatos: Record<string, string> = {}): void =>
    posicionais(args, formatos, anotar).forEach(arg => anotar(arg, acao))

  if (LEITORES.has(nome)) {
    tudo('lendo')
  } else if (EDITORES.has(nome)) {
    tudo('editando')
  } else if (nome === 'touch' || nome === 'truncate') {
    tudo('editando', nome === 'touch' ? TOUCH_OPCOES : { '-s': 't' })
  } else if (nome === 'cp') {
    // As origens são lidas e o destino escrito; se o destino é uma pasta,
    // não dá para saber daqui.
    const sobram = posicionais(args, {}, anotar)

    if (sobram.length > 1) {
      sobram.forEach((arg, i) => anotar(arg, i === sobram.length - 1 ? 'editando' : 'lendo'))
    }
  } else if (PADROES.has(nome)) {
    // Num grep recursivo o argumento costuma ser pasta: só o que tem extensão.
    const isRecursivo = nome === 'rg' || temOpcao(args, '[rR]', '--recursive')
    depoisDoPadrao(args, PADRAO_OPCOES, anotar)
      .filter(arg => !isRecursivo || /\.\w+$/.test(arg))
      .forEach(arg => anotar(arg, 'lendo'))
  } else if (nome === 'sed') {
    const acao = temOpcao(args, 'i', '--in-place') ? 'editando' : 'lendo'
    depoisDoPadrao(args, SED_OPCOES, anotar).forEach(arg => anotar(arg, acao))
  } else if (AWKS.has(nome) || nome === 'jq') {
    depoisDoPadrao(args, nome === 'jq' ? JQ_OPCOES : AWK_OPCOES, anotar).forEach(arg => anotar(arg, 'lendo'))
  } else if (nome === 'perl') {
    // "-pe CODIGO", "-ne", "-E": o código vem na palavra seguinte.
    const formatos = Object.fromEntries(args.filter(arg => /^-\w*[eE]$/.test(arg)).map((arg): [string, string] => [arg, 't']))
    const acao = temOpcao(args, 'i', '--in-place') ? 'editando' : 'lendo'
    posicionais(args, formatos, anotar).forEach(arg => anotar(arg, acao))
  } else if (INTERPRETES.has(nome)) {
    // "python3 script.py arg": o script é lido; o resto é dele, não nosso.
    const [script] = posicionais(args, INTERPRETE_OPCOES, anotar)
    const isInline = args.some(arg => /^(-c|-e|--eval)$/.test(arg))

    if (script !== undefined && !isInline) {
      anotar(script, 'lendo')
    }
  } else if (nome === 'patch') {
    // O alvo do patch está dentro do .patch: só o -i dá para ver.
    posicionais(args, PATCH_OPCOES, anotar)
  }
}

export const arquivosDoComando = (comando: string, cwd: string): ArquivoDoComando[] => {
  const achados: ArquivoDoComando[] = []
  let pasta: string | undefined = cwd.startsWith('/') ? normalizar(cwd) : undefined

  // Variável, glob, URL, ~: não dá para saber o arquivo sem rodar.
  const resolver = (texto: string): string | undefined => {
    if (/[$*?[`{]/.test(texto) || texto.startsWith('~') || texto.includes('://')) {
      return undefined
    }

    if (texto.startsWith('/')) {
      return normalizar(texto)
    }

    return pasta === undefined ? undefined : normalizar(`${pasta}/${texto}`)
  }

  const anotar: Anotar = (texto, acao) => {
    const caminho = pareceArquivo(texto) ? resolver(texto) : undefined

    if (caminho !== undefined) {
      achados.push({ caminho, acao })
    }
  }

  try {
    for (const trecho of trechos(semHeredocs(comando))) {
      const palavras: string[] = []
      // Os alvos dos redirecionamentos, anotados depois dos argumentos do
      // comando: "cat a.txt > b.txt" lê a antes de escrever b.
      const redirecionados: [string, Acao][] = []

      for (let i = 0; i < trecho.length; i += 1) {
        const palavra = trecho[i] ?? { texto: '' }

        if (palavra.redireciona === undefined) {
          palavras.push(palavra.texto)
          continue
        }

        i += 1
        const alvo = trecho[i]

        if (palavra.redireciona !== 'nada' && alvo !== undefined) {
          redirecionados.push([alvo.texto, palavra.redireciona])
        }
      }

      while (palavras.length > 0 && (PREFIXOS.has(palavras[0] ?? '') || /^\w+=/.test(palavras[0] ?? ''))) {
        palavras.shift()
      }

      const [primeira, ...args] = palavras
      const nome = (primeira ?? '').replace(/^.*\//, '')

      // Um cd vale para os trechos seguintes, mesmo dentro de parênteses: um
      // subshell que muda de pasta é raro demais para valer o parser.
      if (nome === 'cd' || nome === 'pushd') {
        const alvo = args.find(arg => !arg.startsWith('-'))
        pasta = alvo === undefined ? undefined : resolver(alvo)
      } else if (nome !== '' && nome !== 'git') {
        examinar(nome, args, anotar)
      }

      redirecionados.forEach(([texto, acao]) => anotar(texto, acao))
    }
  } catch {
    // Um comando esquisito demais: fica o que já deu para ver.
  }

  // Um arquivo lido e depois escrito conta como editado, na ordem em que
  // apareceu.
  const unicos = new Map<string, Acao>()

  for (const achado of achados) {
    if (unicos.get(achado.caminho) !== 'editando') {
      unicos.set(achado.caminho, achado.acao)
    }
  }

  return [...unicos].slice(0, MAX_ARQUIVOS).map(([caminho, acao]) => ({ caminho, acao }))
}
