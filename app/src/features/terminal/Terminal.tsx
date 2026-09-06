import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "../../api";
import { ContextMenu, type MenuItem } from "../../components/ContextMenu";
import { useAppStore } from "../../store";
import { themeFor } from "./themes";
import { addTaskFromTerminal } from "../agents/kanbanStore";
import { forgetSession, markOutput } from "./agentActivity";
import { cleanSelection } from "./selection";
import { SelectionBar } from "./SelectionBar";

import type { Session } from "../../types";
import { pty } from "./pty";

interface Props {
  session: Session;
  onOpenSettings?: (tab?: "providers" | "spaces" | "terminal") => void;
}

/** Fonte configurada + fallbacks monoespaçados. Sem isso o Chromium mede a largura errada. */
export function fontStack(family: string): string {
  const base = family.trim();
  const fallbacks = ["Menlo", "Monaco", "Consolas", "Cascadia Mono", "monospace"];
  return [base, ...fallbacks.filter((f) => f !== base)].filter(Boolean).join(", ");
}

export const RESUME_TIMEOUT_MS = 1500;

/**
 * OSC 7 (`file://host/path`) → path decodificado. Null se não é file://.
 * Windows: `file://host/C:/x` → `C:/x`.
 */
export function parseOsc7(data: string): string | null {
  const m = /^file:\/\/[^/]*(\/.*)$/.exec(data);
  if (!m) return null;
  let path: string;
  try { path = decodeURIComponent(m[1]); } catch { return null; }
  if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1);
  return path;
}

/**
 * Sessão restaurada na carga do app com harness rodando: reenvia o harness
 * com os args de resume. Espera o shell subir (primeiro output ou timeout).
 */
async function resumeIfRestored(sessionId: string, firstOutput: Promise<void>, isDisposed: () => boolean): Promise<void> {
  const st = useAppStore.getState();
  if (!st.consumeRestored(sessionId)) return;
  const session = st.sessions.find((s) => s.id === sessionId);
  if (!session?.harness_running || !session.provider_id) return;
  const provider = st.providers.find((p) => p.id === session.provider_id);
  if (!provider) return;
  await Promise.race([firstOutput, new Promise<void>((r) => setTimeout(r, RESUME_TIMEOUT_MS))]);
  if (isDisposed()) return;
  const line = await api.providerResumeLine(provider, session.bypass);
  if (isDisposed()) return;
  await pty.write(sessionId, line + "\n").catch(() => {});
}

/**
 * Inicia o harness automaticamente caso requisitado (ex.: clique nos botões de "Harnesses disponíveis").
 * Aguarda a inicialização do shell para não truncar caracteres.
 */
async function autoStartHarnessIfRequested(sessionId: string, firstOutput: Promise<void>, isDisposed: () => boolean): Promise<void> {
  const st = useAppStore.getState();
  const session = st.sessions.find((s) => s.id === sessionId);
  if (!session?.auto_start_harness || !session.provider_id) return;
  const provider = st.providers.find((p) => p.id === session.provider_id);
  if (!provider) return;
  await Promise.race([firstOutput, new Promise<void>((r) => setTimeout(r, 450))]);
  if (isDisposed()) return;
  await new Promise<void>((r) => setTimeout(r, 150));
  if (isDisposed()) return;
  const line = await api.providerCommandLine(provider, session.bypass);
  if (isDisposed()) return;
  await pty.write(sessionId, line + "\n").catch(() => {});
  st.updateSession(sessionId, { auto_start_harness: false, harness_running: true });
}

/** Um terminal xterm.js ligado a uma sessão PTY do backend. */
export function Terminal({ session, onOpenSettings }: Props) {
  const { t } = useTranslation("session");
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const settings = useAppStore((s) => s.settings);
  const restartSession = useAppStore((s) => s.restartSession);
  const updateSession = useAppStore((s) => s.updateSession);
  const removeSession = useAppStore((s) => s.removeSession);
  const detachSession = useAppStore((s) => s.detachSession);
  const reattachSession = useAppStore((s) => s.reattachSession);
  /** Lido do store para refletir troca de tema desta sessão sem depender da prop. */
  const sessionTheme = useAppStore((s) => s.sessions.find((x) => x.id === session.id)?.theme) ?? session.theme;
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  /** Barra que aparece ao soltar o mouse com texto selecionado. */
  const [selectionBar, setSelectionBar] = useState<{ x: number; y: number; text: string } | null>(null);
  const sessionId = session.id;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const { font_family, font_size, theme } = useAppStore.getState().settings;
    const sessionTheme = useAppStore.getState().sessions.find((s) => s.id === sessionId)?.theme;
    const term = new XTerm({ cursorBlink: true, fontFamily: fontStack(font_family), fontSize: font_size, theme: themeFor(sessionTheme ?? theme) });
    termRef.current = term;
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();

    let disposed = false;
    let ready = false;
    let signalFirstOutput = () => {};
    const firstOutput = new Promise<void>((resolve) => { signalFirstOutput = resolve; });

    const unlisteners: Array<() => void> = [
      pty.onOutput(sessionId, (bytes) => { signalFirstOutput(); markOutput(sessionId); term.write(bytes); }),
      pty.onExit((exit) => {
        if (exit.session_id !== sessionId) return;
        ready = false;
        setExitCode(exit.code);
        forgetSession(sessionId);
        updateSession(sessionId, { exit_code: exit.code, harness_running: false });
      }),
    ];

    // cwd sem polling: o shell do espaço emite OSC 7 a cada prompt.
    const osc7 = term.parser.registerOscHandler(7, (data) => {
      const cwd = parseOsc7(data);
      if (cwd === null) return true;
      const current = useAppStore.getState().sessions.find((s) => s.id === sessionId);
      if (current && current.cwd !== cwd) updateSession(sessionId, { cwd });
      return true;
    });

    (async () => {
      const plan = await api.spaceSpawnPlan(session.space_id, session.provider_id, session.cwd);
      if (disposed) return;
      // nosemgrep: javascript.lang.security.audit.spawn-shell-true.spawn-shell-true
      const result = await pty.spawn({
        session_id: sessionId,
        shell: plan.shell,
        shell_args: plan.shell_args,
        cwd: plan.cwd,
        env: plan.env,
        inherit_env: plan.inherit_env,
        cols: term.cols,
        rows: term.rows,
      });
      if (disposed) return;
      if (result.replay?.length) term.write(result.replay);
      ready = true;
      void pty.resize(sessionId, term.cols, term.rows).catch(() => {});
      if (result.attached) {
        useAppStore.getState().consumeRestored(sessionId);
      } else {
        await resumeIfRestored(sessionId, firstOutput, () => disposed);
        await autoStartHarnessIfRequested(sessionId, firstOutput, () => disposed);
      }
    })().catch((e) => term.writeln(String(e)));

    const dataSub = term.onData((data) => {
      if (ready) void pty.write(sessionId, data).catch(() => {});
    });
    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      if (ready) void pty.resize(sessionId, term.cols, term.rows).catch(() => {});
    });
    resizeObserver.observe(host);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      dataSub.dispose();
      unlisteners.forEach((u) => u());
      osc7.dispose();

      term.dispose();
      termRef.current = null;
    };
    // A sessão é imutável: mudar espaço/cwd cria outra sessão com outro id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // Aparência muda ao vivo, sem reiniciar o shell.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = fontStack(settings.font_family);
    term.options.fontSize = settings.font_size;
    term.options.theme = themeFor(sessionTheme ?? settings.theme);
  }, [settings.font_family, settings.font_size, settings.theme, sessionTheme]);

  const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");
  const modKey = isMac ? "⌘" : "Ctrl+";
  const selection = (typeof termRef.current?.getSelection === "function") ? termRef.current.getSelection() : "";

  const menuItems: MenuItem[] = [
    {
      id: "term-copy",
      label: t("menu.copy"),
      icon: "📋",
      shortcut: `${modKey}C`,
      disabled: !selection,
      onClick: () => {
        if (selection) void navigator.clipboard.writeText(cleanSelection(selection));
      },
    },
    {
      id: "term-paste",
      label: t("menu.paste"),
      icon: "📄",
      shortcut: `${modKey}V`,
      onClick: async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) void pty.write(sessionId, text);
        } catch {
          /* clipboard read not permitted */
        }
      },
    },
    {
      id: "term-kanban-task",
      label: t("menu.kanbanTask"),
      icon: "🗂",
      disabled: !selection.trim(),
      onClick: () => {
        // A tarefa nasce do que está na tela e já fica com este terminal como responsável.
        void addTaskFromTerminal({ spaceId: session.space_id, sessionId, selection });
      },
    },
    {
      id: "term-select-all",
      label: t("menu.selectAll"),
      icon: "🔍",
      shortcut: `${modKey}A`,
      onClick: () => {
        termRef.current?.selectAll();
      },
    },
    { separator: true },
    {
      id: "term-clear",
      label: t("menu.clear"),
      icon: "🧹",
      shortcut: `${modKey}K`,
      onClick: () => {
        termRef.current?.clear();
        void pty.write(sessionId, "\x0c");
      },
    },
    {
      id: "term-restart",
      label: t("menu.restart"),
      icon: "🔄",
      shortcut: `${modKey}R`,
      onClick: () => {
        restartSession(sessionId);
      },
    },
    {
      id: "term-copy-cwd",
      label: t("menu.copyCwd"),
      icon: "📋",
      disabled: !session.cwd,
      onClick: () => {
        if (session.cwd) void navigator.clipboard.writeText(session.cwd);
      },
    },
    {
      id: "term-open-folder",
      label: t("menu.openFolder"),
      icon: "📂",
      onClick: () => {
        if (session.cwd) {
          void api.pathOpen(session.cwd).catch(() => void api.spaceOpenFolder(session.space_id));
        } else {
          void api.spaceOpenFolder(session.space_id);
        }
      },
    },
    { separator: true },
    {
      id: "term-toggle-bypass",
      label: t("menu.toggleBypass"),
      icon: "⚡",
      onClick: () => {
        updateSession(sessionId, { bypass: !session.bypass });
      },
    },
    {
      id: "term-detach-reattach",
      label: session.detached ? t("menu.reattach") : t("menu.detach"),
      icon: "⧉",
      onClick: () => {
        if (session.detached) void reattachSession(sessionId);
        else void detachSession(sessionId);
      },
    },
    ...(onOpenSettings
      ? [
          {
            id: "term-settings",
            label: t("menu.terminalSettings"),
            icon: "⚙️",
            onClick: () => onOpenSettings("terminal"),
          },
        ]
      : []),
    { separator: true },
    {
      id: "term-close",
      label: t("menu.close"),
      icon: "✕",
      danger: true,
      shortcut: `${modKey}W`,
      onClick: () => {
        removeSession(sessionId);
      },
    },
  ];

  return (
    <div
      className="terminal-wrap"
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div
        ref={hostRef}
        className="terminal-xterm"
        onMouseUp={(e) => {
          // A seleção só existe depois que o xterm processa o mouseup.
          setTimeout(() => {
            const text = termRef.current?.getSelection?.() ?? "";
            setSelectionBar(text.trim() ? { x: e.clientX, y: e.clientY + 12, text } : null);
          }, 0);
        }}
      />
      {selectionBar && (
        <SelectionBar
          session={session}
          selection={selectionBar.text}
          at={{ x: selectionBar.x, y: selectionBar.y }}
          onClose={() => setSelectionBar(null)}
        />
      )}
      {exitCode !== undefined && (
        <div className="exit-banner" role="status">
          <span>{t("exit.banner", { code: exitCode ?? "?" })}</span>
          <button onClick={() => restartSession(sessionId)}>{t("exit.restart")}</button>
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
