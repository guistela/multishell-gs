import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface MenuItem {
  id?: string;
  label?: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  onClick?: () => void;
  children?: MenuItem[];
}

export interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  ariaLabel?: string;
}

export function ContextMenu({ x, y, items, onClose, ariaLabel = "Menu de contexto" }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ x, y });
  const [activeSubmenu, setActiveSubmenu] = useState<number | null>(null);

  // Ajusta a posição para não vazar da janela.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let nextX = x;
    let nextY = y;

    if (nextX + rect.width > window.innerWidth - pad) {
      nextX = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (nextY + rect.height > window.innerHeight - pad) {
      nextY = Math.max(pad, window.innerHeight - rect.height - pad);
    }

    setCoords({ x: nextX, y: nextY });
  }, [x, y]);

  // Fecha com Escape, scroll ou clique fora.
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    const handleScroll = () => {
      onClose();
    };

    window.addEventListener("pointerdown", handlePointerDown, { capture: true });
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, { capture: true, passive: true });
    window.addEventListener("resize", handleScroll);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, { capture: true });
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, { capture: true });
      window.removeEventListener("resize", handleScroll);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={ariaLabel}
      className="context-menu"
      style={{ left: `${coords.x}px`, top: `${coords.y}px` }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, idx) => {
        if (item.separator) {
          return <div key={`sep-${idx}`} className="context-menu-separator" role="separator" />;
        }

        const hasSubmenu = Boolean(item.children && item.children.length > 0);
        const isSubmenuOpen = activeSubmenu === idx;

        return (
          <div
            key={item.id ?? `item-${idx}`}
            className="context-menu-item-wrapper"
            onMouseEnter={() => setActiveSubmenu(hasSubmenu ? idx : null)}
          >
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              className={`context-menu-item${item.danger ? " danger" : ""}${item.disabled ? " disabled" : ""}`}
              onClick={() => {
                if (item.disabled) return;
                if (!hasSubmenu) {
                  item.onClick?.();
                  onClose();
                }
              }}
            >
              <span className="context-menu-icon" aria-hidden="true">
                {item.icon ?? null}
              </span>
              <span className="context-menu-label">{item.label}</span>
              {item.shortcut && <span className="context-menu-shortcut">{item.shortcut}</span>}
              {hasSubmenu && <span className="context-menu-arrow">›</span>}
            </button>

            {hasSubmenu && isSubmenuOpen && item.children && (
              <div className="context-submenu" role="menu">
                {item.children.map((subItem, subIdx) => {
                  if (subItem.separator) {
                    return <div key={`subsep-${subIdx}`} className="context-menu-separator" role="separator" />;
                  }
                  return (
                    <button
                      key={subItem.id ?? `sub-${subIdx}`}
                      type="button"
                      role="menuitem"
                      disabled={subItem.disabled}
                      className={`context-menu-item${subItem.danger ? " danger" : ""}${subItem.disabled ? " disabled" : ""}`}
                      onClick={() => {
                        if (subItem.disabled) return;
                        subItem.onClick?.();
                        onClose();
                      }}
                    >
                      <span className="context-menu-icon" aria-hidden="true">
                        {subItem.icon ?? null}
                      </span>
                      <span className="context-menu-label">{subItem.label}</span>
                      {subItem.shortcut && <span className="context-menu-shortcut">{subItem.shortcut}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
