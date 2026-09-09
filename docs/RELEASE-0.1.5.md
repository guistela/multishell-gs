# Multishell 0.1.5

- Novo agente: escolha de provider, espaço e pasta, com preferências por espaço.
- Confirmação antes de fechar, reiniciar ou fechar em lote agentes marcados como ativos (inclui inicialização pendente).
- Reabertura dos últimos dez terminais fechados durante a execução do app. Recria configuração e pasta; não recupera processos, saída ou conversa.
- Falhas de envio no Kanban preservam o estado da tarefa e permitem repetir o envio.
- Handoff informa falha de escrita e oferece nova tentativa. Timeout de inicialização não injeta o contexto num shell.
- Handoff usa a pasta efetiva da origem ao criar outro agente.
- Iniciar agente e trocar provider ficam indisponíveis enquanto o agente está marcado como ativo.
- A versão exibida na interface acompanha package.json.

A confirmação usa o estado conhecido do agente; comandos iniciados manualmente num shell não são detectados por esse mecanismo. Confirmação de envio indica escrita no terminal, não aceitação ou conclusão pelo agente.
