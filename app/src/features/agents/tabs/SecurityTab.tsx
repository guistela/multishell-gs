import { useAppStore } from "../../../store";

export function SecurityTab() {
  const spaces = useAppStore((s) => s.spaces);
  const sessions = useAppStore((s) => s.sessions);
  const selectedSpaceId = useAppStore((s) => s.selectedSpaceId) ?? spaces[0]?.id;
  const space = spaces.find((s) => s.id === selectedSpaceId);
  const sec = space?.security;

  const shared = [
    sec?.share_keychain && "Keychain",
    sec?.share_ssh && "SSH",
    sec?.share_git_config && "Git config",
    sec?.inherit_process_env && "Variáveis do processo",
    sec?.load_user_shell_profile && "Perfil do shell do usuário",
  ].filter(Boolean) as string[];

  const guardOn = sec?.block_destructive_commands === true;
  const bypassCount = sessions.filter((s) => s.space_id === space?.id && s.bypass).length;

  return (
    <div className="security-view">
      <div className="security-grid">
        <div className="security-item active" data-testid="security-isolation">
          <span className="status-indicator">● ATIVO</span>
          <h4>Isolamento do espaço</h4>
          <p>
            HOME do espaço em <code>{`~/.multishell/profiles/${space?.directory_name ?? "work"}`}</code>
            {space?.base_path ? <> • pasta inicial dos terminais: <code>{space.base_path}</code></> : null}.
            {shared.length === 0
              ? " Nada é compartilhado com o host."
              : ` Compartilhado com o host: ${shared.join(", ")}.`}
          </p>
        </div>

        <div className={`security-item ${guardOn ? "active" : ""}`} data-testid="security-guardrail">
          <span className="status-indicator">{guardOn ? "● ATIVO" : "○ DESLIGADO"}</span>
          <h4>Guardrail de comandos digitados</h4>
          <p>
            {guardOn
              ? "Barra rm -rf /, fork bomb, mkfs, dd em disco e reset --hard no que você digita ou cola."
              : "Ligue em Configurações do espaço → Segurança para barrar rm -rf /, fork bomb, mkfs e dd em disco."}
          </p>
          <p className="security-caveat">
            Não vale para o agente: ele roda dentro do terminal e cria processos próprios.
            Comando vindo do histórico ou de <code>eval</code> também escapa. Para conter o agente,
            use o modo sem bypass ou faça um snapshot antes.
          </p>
        </div>

        <div className="security-item active" data-testid="security-secrets">
          <span className="status-indicator">● ATIVO</span>
          <h4>Segredos no keyring do sistema</h4>
          <p>
            Variáveis marcadas como segredo ficam no keyring do sistema, nunca no JSON de configuração do app.
          </p>
        </div>

        <div className={`security-item ${bypassCount > 0 ? "warn" : ""}`} data-testid="security-bypass">
          <span className="status-indicator">{bypassCount > 0 ? "▲ ATENÇÃO" : "● OK"}</span>
          <h4>Terminais com bypass de permissões</h4>
          <p>
            <strong>{bypassCount}</strong> de {sessions.filter((s) => s.space_id === space?.id).length} terminais do espaço
            rodam o agente sem confirmação de permissões.
          </p>
        </div>
      </div>
    </div>
  );
}
