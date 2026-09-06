import type { Provider } from "../../types";

/**
 * Ícones dos harnesses. SVG inline monocromático (herda currentColor): sem dependência
 * externa, que a CSP bloquearia, e sem emoji, que destoa do resto da interface.
 */
const PATHS: Record<string, string> = {
  terminal: "M3 5l4 4-4 4M9 13h5",
  sparkles: "M8 2l1.4 3.6L13 7l-3.6 1.4L8 12l-1.4-3.6L3 7l3.6-1.4z",
  cpu: "M5.5 5.5h5v5h-5zM6.5 2v2M9.5 2v2M6.5 12v2M9.5 12v2M2 6.5h2M2 9.5h2M12 6.5h2M12 9.5h2",
  rocket: "M8 1.5c2.2 1.6 3.2 4 3 6.6l-3 3-3-3c-.2-2.6.8-5 3-6.6zM5.5 10L4 13l3-1.2M10.5 10L12 13l-3-1.2",
  "mouse-pointer": "M3.5 2.5l9 4.2-3.7 1.2-1.2 3.7z",
  bot: "M5 6h6v5H5zM8 3v3M4 8.5H3M13 8.5h-1M6.8 8.2h.01M9.2 8.2h.01",
  code: "M6 4L2.5 8 6 12M10 4l3.5 4L10 12",
  wrench: "M12.5 3.5a3 3 0 01-4 4L4 12l-1.5-1.5 4.5-4.5a3 3 0 014-4l-1.8 1.8 1.5 1.5z",
  brain: "M6.5 3.5a2 2 0 00-2 2 2 2 0 000 4 2 2 0 002 2zM9.5 3.5a2 2 0 012 2 2 2 0 010 4 2 2 0 01-2 2",
  cloud: "M4.5 11.5a2.5 2.5 0 010-5 3.5 3.5 0 016.8-1 2.7 2.7 0 01.2 5.4z",
};

/** Nomes que o editor de provedores oferece. */
export const ICON_NAMES = Object.keys(PATHS);

/** Um caractere não-ASCII no campo `icon` é um emoji escolhido pelo usuário: respeita. */
function isEmoji(icon: string): boolean {
  return /^[^\x00-\x7F]/.test(icon);
}

export function ProviderIcon({
  provider,
  size = 13,
  title,
}: {
  /** Sem provider = terminal sem harness: mostra o ícone de shell. */
  provider?: Provider | null;
  size?: number;
  title?: string;
}) {
  const label = title ?? provider?.name ?? "Shell";
  const icon = provider?.icon?.trim() || "terminal";

  if (provider && isEmoji(icon)) {
    return <span className="provider-icon provider-icon-emoji" data-icon="emoji" title={label}>{icon}</span>;
  }

  const path = PATHS[icon];
  if (!path) {
    // Ícone desconhecido: cai na inicial do nome em vez de sumir.
    return (
      <span className="provider-icon provider-icon-letter" data-icon="letter" title={label}>
        {(provider?.name ?? "S").charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <svg
      className="provider-icon"
      data-icon={icon}
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
    >
      <title>{label}</title>
      <path d={path} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
