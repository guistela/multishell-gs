# Origem e licença

Este plugin é um fork de **CSR Lens**, de Cesar Schutz, sob licença MIT.

- Original: https://github.com/cesarschutz/claude-code-kit/tree/main/plugins/csr-lens
- Versão de origem do fork: `csr-lens` 1.0.1
- A licença original está em [`LICENSE-csr-lens`](./LICENSE-csr-lens) e continua valendo.

## O que mudou no fork

- **Sem pílula de custo.** A barra acima do prompt mostra contexto e limites, não dinheiro.
- **Sem marca de produto.** A pílula `✦ CSR` saiu e o cabeçalho do painel virou `✦ Lens`.
- **Sem a opção de cotação do dólar**, que só servia ao custo.
- O recado de "parar agente" cita o Multishell, não o painel original.

## Rede

O plugin não abre conexão nenhuma. Não há `fetch`, `node:http`, `node:https`,
`node:net`, `node:dns`, `node:tls`, `child_process` nem chamada a `curl`/`wget`
no código. Isso é verificado pelo teste `tests/offline.test.ts`, que roda no CI.
