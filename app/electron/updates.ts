// Aviso de nova versão. Só avisa e abre o download: o app não é assinado,
// então instalar sozinho esbarraria no Gatekeeper.
// Módulo puro: quem busca o JSON do GitHub é o handler.

export const REPO = "guistela/multishell-gs";
export const LATEST_RELEASE_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

export interface UpdateInfo {
  version: string;
  download_url: string;
  release_url: string;
}

interface Asset {
  name: string;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  html_url: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: Asset[];
}

function parse(v: string): { nums: number[]; pre: string | null } {
  const [main, pre] = v.trim().replace(/^v/i, "").split("-", 2);
  return { nums: main.split(".").map((n) => Number.parseInt(n, 10) || 0), pre: pre ?? null };
}

/** > 0 se `a` é mais novo que `b`. Pré-release vale menos que a final. */
export function compareVersions(a: string, b: string): number {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  if (x.pre === y.pre) return 0;
  if (x.pre === null) return 1;
  if (y.pre === null) return -1;
  return x.pre < y.pre ? -1 : 1;
}

/** Só https do próprio repositório. Barra o renderer de abrir qualquer link. */
export function isReleaseUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.host === "github.com" && u.pathname.startsWith(`/${REPO}/`);
  } catch {
    return false;
  }
}

/** Instalador do SO e da CPU atuais. Sem nenhum, a página do release. */
export function pickAssetUrl(release: Release, platform: NodeJS.Platform, arch: string): string {
  const suffix = platform === "darwin" ? `-mac-${arch}.dmg` : platform === "win32" ? `-win-${arch}.exe` : null;
  const asset = suffix ? release.assets.find((a) => a.name.endsWith(suffix)) : undefined;
  return asset?.browser_download_url ?? release.html_url;
}

function isRelease(r: unknown): r is Release {
  const o = r as Release | null;
  return !!o && typeof o.tag_name === "string" && typeof o.html_url === "string" && Array.isArray(o.assets);
}

export interface LatestOpts {
  release: unknown;
  current: string;
  platform: NodeJS.Platform;
  arch: string;
  /** Versão que o usuário pediu para ignorar. */
  ignored: string | null;
}

export function latestUpdate(o: LatestOpts): UpdateInfo | null {
  if (!isRelease(o.release) || o.release.draft || o.release.prerelease) return null;
  const version = o.release.tag_name.replace(/^v/i, "");
  if (compareVersions(version, o.current) <= 0) return null;
  if (o.ignored && compareVersions(version, o.ignored) === 0) return null;
  const download = pickAssetUrl(o.release, o.platform, o.arch);
  const page = o.release.html_url;
  return {
    version,
    download_url: isReleaseUrl(download) ? download : RELEASES_PAGE,
    release_url: isReleaseUrl(page) ? page : RELEASES_PAGE,
  };
}
