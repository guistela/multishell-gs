// O que a Árvore acende de um comando Bash: os arquivos que ele lê e escreve,
// adivinhados só pelo texto.
import { expect, test } from 'claude-code/testing'

import { arquivosDoComando } from '../hooks/caminhos-do-bash'

const em = (comando: string) => arquivosDoComando(comando, '/proj')
const lendo = (caminho: string) => ({ caminho, acao: 'lendo' as const })
const editando = (caminho: string) => ({ caminho, acao: 'editando' as const })

test('cd muda a pasta dos trechos seguintes e os .. se resolvem', async () => {
  expect(em("cd .claude/worktrees/post-dns && sed -i 's/a/b/' src/x.md")).toEqual([
    editando('/proj/.claude/worktrees/post-dns/src/x.md'),
  ])
  expect(em('cd ../outro; cat a.txt')).toEqual([lendo('/outro/a.txt')])
  expect(em('cd /abs/pasta && cat ./sub/../b.txt')).toEqual([lendo('/abs/pasta/b.txt')])
  expect(em('cat /a/b/../c/./d.txt')).toEqual([lendo('/a/c/d.txt')])
  // Um cd para um lugar que não dá para saber desliga os caminhos relativos.
  expect(em('cd ~ && cat a.txt')).toEqual([])
  expect(em('cd $DIR && cat a.txt; cat /etc/hosts')).toEqual([lendo('/etc/hosts')])
})

test('sed -i edita e sed sem -i só lê, pulando o script', async () => {
  expect(em("sed -n '1,20p' hooks/arvore.ts")).toEqual([lendo('/proj/hooks/arvore.ts')])
  expect(em("sed -i '' 's/a/b/' README.md")).toEqual([editando('/proj/README.md')])
  expect(em("sed -i.bak -e 's/a/b/' x.ts y.ts")).toEqual([editando('/proj/x.ts'), editando('/proj/y.ts')])
  expect(em("sed --in-place 's#x/y#z#' a.md")).toEqual([editando('/proj/a.md')])
  expect(em("sed -E 's/a/b/' < in.txt > out.txt")).toEqual([lendo('/proj/in.txt'), editando('/proj/out.txt')])
})

test('grep pula o padrão e lê os arquivos; o -f é um arquivo de padrões', async () => {
  expect(em("grep -n 'foo/bar' src/x.ts README.md")).toEqual([lendo('/proj/src/x.ts'), lendo('/proj/README.md')])
  expect(em("grep -e 'a/b' -f padroes.txt x.ts")).toEqual([lendo('/proj/padroes.txt'), lendo('/proj/x.ts')])
  expect(em('grep -rn foo src/')).toEqual([])
  expect(em('rg -t ts foo src/hooks src/x.ts')).toEqual([lendo('/proj/src/x.ts')])
  expect(em("awk -F: '{print $1}' /etc/passwd")).toEqual([lendo('/etc/passwd')])
  expect(em("jq -r '.name' package.json")).toEqual([lendo('/proj/package.json')])
})

test('redirecionamentos: > e >> escrevem, < lê, 2>&1 e /dev/null não são arquivos', async () => {
  expect(em('echo oi > out.txt 2>&1')).toEqual([editando('/proj/out.txt')])
  expect(em('make 2> err.log')).toEqual([editando('/proj/err.log')])
  expect(em('cat < in.txt >> out.txt')).toEqual([lendo('/proj/in.txt'), editando('/proj/out.txt')])
  expect(em('echo erro >&2')).toEqual([])
  expect(em('npm test 2>/dev/null')).toEqual([])
  expect(em('cmd &> tudo.log')).toEqual([editando('/proj/tudo.log')])
  expect(em('ls -la src/')).toEqual([])
})

test('tee, cp, mv, touch, rm e truncate', async () => {
  expect(em('make 2>&1 | tee -a build.log')).toEqual([editando('/proj/build.log')])
  expect(em('cp a.txt b.txt dir/c.txt')).toEqual([lendo('/proj/a.txt'), lendo('/proj/b.txt'), editando('/proj/dir/c.txt')])
  expect(em('mv old.ts new.ts')).toEqual([editando('/proj/old.ts'), editando('/proj/new.ts')])
  expect(em('touch a.txt; rm -f b.txt; truncate -s 0 c.log')).toEqual([
    editando('/proj/a.txt'),
    editando('/proj/b.txt'),
    editando('/proj/c.log'),
  ])
  expect(em('mkdir -p src/novo && chmod +x bin/x.sh && ln -s a.txt b.txt')).toEqual([])
})

test('aspas protegem separadores e espaços', async () => {
  expect(em('echo "a; b | c > d.txt" > saida.txt')).toEqual([editando('/proj/saida.txt')])
  expect(em("grep 'x|y' 'meu arquivo.txt'")).toEqual([lendo('/proj/meu arquivo.txt')])
  expect(em('cat meu\\ arquivo.txt')).toEqual([lendo('/proj/meu arquivo.txt')])
  expect(em('echo v$(cat version.txt) > out.txt')).toEqual([lendo('/proj/version.txt'), editando('/proj/out.txt')])
})

test('o corpo de um heredoc não conta', async () => {
  expect(em('cat > config.json <<\'EOF\'\n{"a": "b/c.txt"}\ncat outro.txt\nEOF\n')).toEqual([editando('/proj/config.json')])
  expect(em("python3 - <<'EOF'\nprint(open('x.txt').read())\nEOF")).toEqual([])
  expect(em('cat <<-EOF | tee saida.md\n\tlinha/a.txt\n\tEOF')).toEqual([editando('/proj/saida.md')])
})

test('prefixos de ambiente e sudo/time caem fora', async () => {
  expect(em('FOO=1 BAR=x sudo time cat a.txt')).toEqual([lendo('/proj/a.txt')])
  expect(em('env NODE_ENV=test node scripts/build.js --out dist/x.js')).toEqual([lendo('/proj/scripts/build.js')])
  expect(em("python3 -c 'print(1)' a.txt")).toEqual([])
  expect(em('source .env.local && . ./bin/ativar.sh')).toEqual([lendo('/proj/.env.local'), lendo('/proj/bin/ativar.sh')])
  expect(em("perl -pi -e 's/a/b/' x.md")).toEqual([editando('/proj/x.md')])
  expect(em('patch -p1 -i fix.patch')).toEqual([lendo('/proj/fix.patch')])
})

test('globs, variáveis, URLs, ~ e stdin ficam de fora', async () => {
  expect(em('cat *.ts $HOME/x.ts ~/y.ts src/[ab].ts https://x.com/a.txt - "$X/z.ts"')).toEqual([])
  expect(em('cat {a,b}.txt')).toEqual([])
  expect(em('cat 1.5 2')).toEqual([])
})

test('git fica de fora inteiro', async () => {
  expect(em('git diff src/x.ts && git add README.md && git commit -m "x.ts"')).toEqual([])
  expect(em('git status && cat a.txt')).toEqual([lendo('/proj/a.txt')])
})

test('o mesmo arquivo entra uma vez, e editando ganha de lendo', async () => {
  expect(em("cat x.ts && sed -i 's/a/b/' x.ts && cat x.ts && cat y.ts")).toEqual([editando('/proj/x.ts'), lendo('/proj/y.ts')])
  expect(em('cat a.txt a.txt')).toEqual([lendo('/proj/a.txt')])
})

test('nunca lança e para em 30 arquivos', async () => {
  expect(em('cat "x.txt')).toEqual([lendo('/proj/x.txt')])
  expect(em("cat 'x.txt")).toEqual([lendo('/proj/x.txt')])
  expect(em('')).toEqual([])
  expect(em('>')).toEqual([])
  expect(arquivosDoComando('cat a.txt', '')).toEqual([])
  expect(arquivosDoComando('cat a.txt', 'relativa')).toEqual([])
  expect(em('cat a.txt > b.txt')).toEqual([lendo('/proj/a.txt'), editando('/proj/b.txt')])
  const muitos = Array.from({ length: 40 }, (_, i) => `arquivo${i}.txt`).join(' ')
  expect(em(`cat ${muitos}`)).toHaveLength(30)
})
