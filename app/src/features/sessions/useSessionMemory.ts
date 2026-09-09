import { useEffect, useState } from "react";
import { api } from "../../api";
import { setSessionCpu, setSessionOutputAt } from "../terminal/agentActivity";

/** Curto o bastante para o indicador de atividade acompanhar o agente. */
const REFRESH_MS = 2000;

/**
 * Memória por sessão, em bytes. Uma consulta cobre todas as sessões, então
 * um único intervalo atende a faixa de abas inteira.
 */
export function useSessionMemory(): Record<string, number> {
  const [memory, setMemory] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const metrics = await api.sessionMetrics();
        if (!active) return;
        const next: Record<string, number> = {};
        for (const m of metrics) {
          if (m.memory_bytes != null) next[m.session_id] = m.memory_bytes;
          // Alimenta o indicador de atividade: agente calado mas ocupado aparece como trabalhando.
          setSessionCpu(m.session_id, m.cpu_percent);
          // Fonte única do "working": vale também para sessão destacada em outra janela.
          setSessionOutputAt(m.session_id, m.last_output_at ?? null);
        }
        setMemory(next);
      } catch {
        // Métrica é acessório: se falhar, a aba simplesmente não mostra o indicador.
      }
    };
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return memory;
}
