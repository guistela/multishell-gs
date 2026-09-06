import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../../store";
import type { Session, Space } from "../../types";
import { providerGlyph } from "./Sidebar";

interface Props {
  open: boolean;
  onClose: () => void;
}

type SearchItem =
  | { type: "space"; id: string; space: Space; sessionsCount: number }
  | { type: "session"; id: string; session: Session; space: Space | undefined };

export function QuickSearchModal({ open, onClose }: Props) {
  const { t } = useTranslation("session");
  const spaces = useAppStore((s) => s.spaces);
  const sessions = useAppStore((s) => s.sessions);
  const providers = useAppStore((s) => s.providers);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const items = useMemo<SearchItem[]>(() => {
    const q = query.trim().toLowerCase();
    const spaceMap = new Map(spaces.map((s) => [s.id, s]));

    if (!q) {
      // Quando não há busca, mostra todos os espaços e sessões
      const res: SearchItem[] = [];
      for (const space of spaces) {
        const count = sessions.filter((s) => s.space_id === space.id).length;
        res.push({ type: "space", id: space.id, space, sessionsCount: count });
      }
      for (const s of sessions) {
        res.push({ type: "session", id: s.id, session: s, space: spaceMap.get(s.space_id) });
      }
      return res;
    }

    const matchedSpaces: SearchItem[] = [];
    for (const space of spaces) {
      if (
        space.name.toLowerCase().includes(q) ||
        space.directory_name.toLowerCase().includes(q)
      ) {
        const count = sessions.filter((s) => s.space_id === space.id).length;
        matchedSpaces.push({ type: "space", id: space.id, space, sessionsCount: count });
      }
    }

    const matchedSessions: SearchItem[] = [];
    for (const s of sessions) {
      const parentSpace = spaceMap.get(s.space_id);
      const provider = providers.find((p) => p.id === s.provider_id);
      const matches =
        s.title.toLowerCase().includes(q) ||
        (s.cwd && s.cwd.toLowerCase().includes(q)) ||
        (provider && provider.name.toLowerCase().includes(q)) ||
        (parentSpace && parentSpace.name.toLowerCase().includes(q));

      if (matches) {
        matchedSessions.push({ type: "session", id: s.id, session: s, space: parentSpace });
      }
    }

    return [...matchedSpaces, ...matchedSessions];
  }, [spaces, sessions, providers, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Rola o item ativo para o campo de visão
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const active = container.querySelector(".quick-search-item.active") as HTMLElement | null;
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const selectItem = (item: SearchItem) => {
    if (item.type === "space") {
      useAppStore.getState().selectSpace(item.space.id);
    } else {
      useAppStore.getState().selectSession(item.session.id);
    }
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (items.length > 0 ? (i + 1) % items.length : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (items.length > 0 ? (i - 1 + items.length) % items.length : 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (items[selectedIndex]) {
        selectItem(items[selectedIndex]);
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="quick-search-backdrop"
      data-testid="quick-search-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="quick-search-palette"
        data-testid="quick-search-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t("search.placeholder")}
        onKeyDown={onKeyDown}
      >
        <div className="quick-search-header">
          <svg className="quick-search-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="quick-search-input"
            data-testid="quick-search-input"
            placeholder={t("search.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon quick-search-clear"
              aria-label={t("sidebar.clearSearch")}
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
            >
              ✕
            </button>
          )}
        </div>

        <div ref={listRef} className="quick-search-results">
          {items.length === 0 ? (
            <div className="quick-search-empty">
              {query
                ? t("search.noResults", { query })
                : t("search.empty")}
            </div>
          ) : (
            items.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              if (item.type === "space") {
                return (
                  <div
                    key={`space-${item.id}`}
                    className={`quick-search-item space-item${isSelected ? " active" : ""}`}
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="dot" style={{ background: item.space.color_hex }} />
                    <span className="item-title">{item.space.name}</span>
                    <span className="item-type-badge">{t("search.spaces")}</span>
                    <span className="session-count">
                      {t("layout.count", { count: item.sessionsCount })}
                    </span>
                  </div>
                );
              }

              const provider = providers.find((p) => p.id === item.session.provider_id);
              return (
                <div
                  key={`session-${item.id}`}
                  className={`quick-search-item session-item${isSelected ? " active" : ""}`}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                >
                  {provider && (
                    <span className="provider-glyph" title={provider.name}>
                      {providerGlyph(provider)}
                    </span>
                  )}
                  <span className="item-title">{item.session.title}</span>
                  {item.space && (
                    <span
                      className="space-tag"
                      style={{
                        borderColor: item.space.color_hex,
                        color: item.space.color_hex,
                      }}
                    >
                      {item.space.name}
                    </span>
                  )}
                  {item.session.cwd && (
                    <span className="cwd-path" title={item.session.cwd}>
                      {item.session.cwd}
                    </span>
                  )}
                  {item.session.harness_running && (
                    <span className="harness-tag" title={t("sidebar.harnessRunning")}>
                      ● {t("sidebar.harnessRunning")}
                    </span>
                  )}
                  {item.session.detached && (
                    <span className="detached-glyph" title={t("detached.detachedHere")}>
                      ⧉
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="quick-search-footer">
          <span>{t("search.hint")}</span>
          <kbd>Esc</kbd>
        </div>
      </div>
    </div>
  );
}
