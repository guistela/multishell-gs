import { useEffect, useState } from "react";
import { api } from "../../api";

const REFRESH_MS = 5000;

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
