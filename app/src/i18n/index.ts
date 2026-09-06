import i18n from "i18next";
import { initReactI18next } from "react-i18next";

export const SUPPORTED_LANGUAGES = ["pt-BR", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];

/** Carrega src/i18n/locales/<lang>/<namespace>.json. Namespace = nome do arquivo. */
const files = import.meta.glob("./locales/*/*.json", { eager: true, import: "default" }) as Record<
  string,
  Record<string, unknown>
>;

export const resources: Record<string, Record<string, Record<string, unknown>>> = {};
for (const [path, dict] of Object.entries(files)) {
  const m = path.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  if (!m) continue;
  const [, lang, ns] = m;
  (resources[lang] ??= {})[ns] = dict;
}

function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem("multishell.language");
    if (saved === "pt-BR" || saved === "en") return saved;
  } catch {
    /* sem storage */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  return nav.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
}

i18n.use(initReactI18next).init({
  resources,
  lng: detectLanguage(),
  fallbackLng: "en",
  defaultNS: "common",
  ns: Object.keys(resources["en"] ?? {}),
  interpolation: { escapeValue: false },
});

export function setLanguage(lang: Language) {
  try {
    localStorage.setItem("multishell.language", lang);
  } catch {
    /* sem storage */
  }
  return i18n.changeLanguage(lang);
}

export default i18n;
