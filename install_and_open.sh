#!/bin/bash

set -euo pipefail

APP_NAME="Multishell"
APP_BUNDLE=".build/${APP_NAME}.app"
TARGET_APP="/Applications/${APP_NAME}.app"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_BINARY="${TARGET_APP}/Contents/MacOS/${APP_NAME}"

running_from_multishell() {
    local pid="$PPID"
    local args=""

    while [ -n "${pid}" ] && [ "${pid}" != "0" ] && [ "${pid}" != "1" ]; do
        args="$(ps -p "${pid}" -o args= 2>/dev/null || true)"
        if [[ "${args}" == *"${APP_NAME}.app/Contents/MacOS/${APP_NAME}"* ]]; then
            return 0
        fi
        pid="$(ps -p "${pid}" -o ppid= 2>/dev/null | tr -d ' ' || true)"
    done

    return 1
}

if [ "${MULTISHELL_INSTALL_EXTERNAL:-0}" != "1" ] && running_from_multishell; then
    quoted_dir="$(printf '%q' "${SCRIPT_DIR}")"
    terminal_cmd="cd ${quoted_dir} && MULTISHELL_INSTALL_EXTERNAL=1 ./install_and_open.sh; echo; echo 'Multishell install finished. You can close this Terminal window.'"
    applescript_cmd="${terminal_cmd//\\/\\\\}"
    applescript_cmd="${applescript_cmd//\"/\\\"}"
    osascript -e "tell application \"Terminal\" to activate" \
              -e "tell application \"Terminal\" to do script \"${applescript_cmd}\""
    echo "Installer relaunched in Terminal.app."
    exit 0
fi

echo "Stopping ${APP_NAME}..."
osascript -e "tell application \"${APP_NAME}\" to quit" >/dev/null 2>&1 || true
sleep 1
if [ -x "${APP_BINARY}" ]; then
    pgrep -f "${APP_BINARY}" | while read -r pid; do
        kill "${pid}" >/dev/null 2>&1 || true
    done
fi

echo "Building ${APP_NAME}..."
"$(dirname "$0")/build.sh"

echo "Replacing ${TARGET_APP}..."
rm -rf "${TARGET_APP}"
ditto "${APP_BUNDLE}" "${TARGET_APP}"

echo "Opening ${TARGET_APP}..."
open "${TARGET_APP}"

echo "Done."
