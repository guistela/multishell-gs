#!/bin/bash
# Atualiza o Multishell instalado sem matar os terminais abertos.
#
# Funciona de dentro do próprio Multishell:
#   1. monta o .app novo a partir do código local (só a arquitetura desta máquina);
#   2. deixa um processo destacado esperando o Multishell fechar;
#   3. quando você fecha (⌘Q), troca o .app em /Applications e reabre a versão nova.
#
# Uso:
#   scripts/update-mac.sh          # agenda: troca quando você fechar o Multishell
#   scripts/update-mac.sh --now    # fecha o Multishell agora (quit normal) e troca
#   scripts/update-mac.sh --app <caminho/Multishell.app>   # usa um .app pronto, sem build
#
# Variáveis para teste: INSTALL_DIR (padrão /Applications), SKIP_OPEN=1, STATE_DIR.
set -euo pipefail

APP_NAME="Multishell"
INSTALL_DIR="${INSTALL_DIR:-/Applications}"
TARGET="${INSTALL_DIR}/${APP_NAME}.app"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# HOME pode ser a raiz de um espaço: o estado fica fora dele, ao lado do repositório.
STATE_DIR="${STATE_DIR:-${REPO_DIR}/app/release/update}"
LOG="${STATE_DIR}/update.log"

mode="wait"
source_app=""
while [ $# -gt 0 ]; do
  case "$1" in
    --now) mode="now" ;;
    --app) source_app="$2"; shift ;;
    --swap) mode="swap" ;;  # interno: o processo destacado
    *) echo "argumento desconhecido: $1" >&2; exit 2 ;;
  esac
  shift
done

running_pid() {
  ps -axo pid=,comm= | awk -v p="${TARGET}/Contents/MacOS/${APP_NAME}" '$2 == p { print $1; exit }'
}

app_version() {
  defaults read "$1/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "?"
}

# ---------- fase 2: processo destacado ----------
if [ "$mode" = "swap" ]; then
  staged="${STATE_DIR}/${APP_NAME}.app"
  echo "[$(date '+%F %T')] esperando ${APP_NAME} fechar" >>"$LOG"
  while [ -n "$(running_pid)" ]; do sleep 2; done
  sleep 1
  backup="${STATE_DIR}/${APP_NAME}.previous.app"
  rm -rf "$backup"
  if [ -d "$TARGET" ]; then mv "$TARGET" "$backup"; fi
  if ditto "$staged" "$TARGET"; then
    xattr -dr com.apple.quarantine "$TARGET" 2>/dev/null || true
    echo "[$(date '+%F %T')] instalado $(app_version "$TARGET") em $TARGET (anterior em $backup)" >>"$LOG"
  else
    echo "[$(date '+%F %T')] falhou a cópia; restaurando a versão anterior" >>"$LOG"
    rm -rf "$TARGET"
    [ -d "$backup" ] && mv "$backup" "$TARGET"
  fi
  rm -f "${STATE_DIR}/swap.pid"
  [ "${SKIP_OPEN:-0}" = "1" ] || open "$TARGET"
  exit 0
fi

# ---------- fase 1: montar e agendar ----------
mkdir -p "$STATE_DIR"

if [ -f "${STATE_DIR}/swap.pid" ] && kill -0 "$(cat "${STATE_DIR}/swap.pid")" 2>/dev/null; then
  echo "Já existe um update agendado (pid $(cat "${STATE_DIR}/swap.pid")). Ele será substituído."
  kill "$(cat "${STATE_DIR}/swap.pid")" 2>/dev/null || true
fi

if [ -z "$source_app" ]; then
  arch="$(uname -m)"
  [ "$arch" = "x86_64" ] && arch="x64"
  echo "Montando ${APP_NAME} (${arch}) a partir de ${REPO_DIR}/app..."
  (
    cd "${REPO_DIR}/app"
    pnpm build >/dev/null
    CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac dir "--${arch}" --publish never >/dev/null
  )
  if [ "$arch" = "arm64" ]; then source_app="${REPO_DIR}/app/release/mac-arm64/${APP_NAME}.app"; else source_app="${REPO_DIR}/app/release/mac/${APP_NAME}.app"; fi
fi
[ -d "$source_app" ] || { echo "Não achei o .app em: $source_app" >&2; exit 1; }

staged="${STATE_DIR}/${APP_NAME}.app"
rm -rf "$staged"
ditto "$source_app" "$staged"
new_version="$(app_version "$staged")"
old_version="$( [ -d "$TARGET" ] && app_version "$TARGET" || echo "nenhuma")"

# Novo grupo de sessão: o processo sobrevive ao fechamento do terminal e do Multishell.
nohup perl -e 'use POSIX qw(setsid); setsid(); exec @ARGV' "$0" --swap </dev/null >>"$LOG" 2>&1 &
echo $! >"${STATE_DIR}/swap.pid"

echo "Versão instalada: ${old_version}. Versão nova pronta: ${new_version}."
if [ -z "$(running_pid)" ]; then
  echo "${APP_NAME} não está aberto: a troca acontece agora."
elif [ "$mode" = "now" ]; then
  echo "Fechando ${APP_NAME} para trocar..."
  osascript -e "quit app \"${TARGET}\"" >/dev/null 2>&1 || true
else
  echo "Feche o ${APP_NAME} (⌘Q) quando quiser. A troca e a reabertura são automáticas."
fi
echo "Log: ${LOG}"
