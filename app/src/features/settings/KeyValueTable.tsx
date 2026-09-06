import { useTranslation } from "react-i18next";
import type { EnvVar } from "../../types";

interface Props {
  rows: EnvVar[];
  onChange: (rows: EnvVar[]) => void;
  /** Mostra a coluna "Segredo". */
  secrets?: boolean;
  secretLabel?: string;
  secretPlaceholder?: string;
}

/** Tabela chave/valor. Usada em Providers (extra_env) e Espaços (custom_env). */
export default function KeyValueTable({ rows, onChange, secrets, secretLabel, secretPlaceholder }: Props) {
  const { t } = useTranslation("settings");
  const update = (i: number, patch: Partial<EnvVar>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <table className="kv-table">
      <thead>
        <tr>
          <th>{t("keyValue.key")}</th>
          <th>{t("keyValue.value")}</th>
          {secrets && <th>{secretLabel}</th>}
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td><input type="text" value={r.key} aria-label={t("keyValue.key")} onChange={(e) => update(i, { key: e.target.value })} /></td>
            <td>
              <input
                type={r.is_secret ? "password" : "text"}
                value={r.value}
                placeholder={r.is_secret ? secretPlaceholder : undefined}
                aria-label={t("keyValue.value")}
                onChange={(e) => update(i, { value: e.target.value })}
              />
            </td>
            {secrets && (
              <td>
                <input type="checkbox" checked={r.is_secret} aria-label={secretLabel} onChange={(e) => update(i, { is_secret: e.target.checked })} />
              </td>
            )}
            <td>
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))}>{t("keyValue.remove")}</button>
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={secrets ? 4 : 3}>
            <button type="button" onClick={() => onChange([...rows, { key: "", value: "", is_secret: false }])}>{t("keyValue.add")}</button>
          </td>
        </tr>
      </tbody>
    </table>
  );
}
