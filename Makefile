.PHONY: dev test typecheck build dist install-mac clean-old-mac clean help \
        swift-build swift-bundle swift-install swift-run swift-clean

APP_DIR      = app
INSTALL_DIR  = /Applications
# electron-builder gera release/mac/ (x64) e release/mac-arm64/ (arm64).
# O .app é procurado no shell, depois do `dist`. Para forçar um:
#   make install-mac ELECTRON_APP=app/release/mac-arm64/Multishell.app
ELECTRON_APP ?=
# Binário do app instalado. Usado para achar o processo pelo caminho exato:
# o `comm` do macOS guarda o caminho inteiro, então `pgrep -x Multishell`
# nunca casa. E `pgrep` esconde os ancestrais, então rodando o make de dentro
# de um terminal do Multishell ele não vê o app. `ps -A` vê.
MS_BIN       = $(INSTALL_DIR)/Multishell.app/Contents/MacOS/Multishell

# ---------- Electron (app/) ----------
dev:
	cd $(APP_DIR) && pnpm dev

test:
	cd $(APP_DIR) && pnpm test

typecheck:
	cd $(APP_DIR) && pnpm typecheck

build:
	cd $(APP_DIR) && pnpm build

dist:
	cd $(APP_DIR) && pnpm dist

install-mac: dist
	@app="$(ELECTRON_APP)"; \
	arch="$$(uname -m)"; \
	if [ -z "$$app" ]; then \
		if [ "$$arch" = "arm64" ] && [ -d "$(APP_DIR)/release/mac-arm64/Multishell.app" ]; then \
			app="$(APP_DIR)/release/mac-arm64/Multishell.app"; \
		elif [ -d "$(APP_DIR)/release/mac/Multishell.app" ]; then \
			app="$(APP_DIR)/release/mac/Multishell.app"; \
		else \
			app=$$(ls -d $(APP_DIR)/release/mac*/Multishell.app 2>/dev/null | head -1); \
		fi; \
	fi; \
	[ -n "$$app" ] || { echo "Nenhum Multishell.app em $(APP_DIR)/release/mac*/"; exit 1; }; \
	pids=$$(ps -Ao pid=,comm= | awk -v b="$(MS_BIN)" '{ p=$$1; $$1=""; sub(/^ /, ""); if ($$0 == b) print p }'); \
	meu=0; q=$$$$; \
	while [ -n "$$q" ] && [ "$$q" != "0" ] && [ "$$q" != "1" ]; do \
		case " $$pids " in *" $$q "*) meu=1 ;; esac; \
		q=$$(ps -p "$$q" -o ppid= 2>/dev/null | tr -d ' '); \
	done; \
	if [ -n "$$pids" ] && [ "$$NO_KILL" != "1" ]; then \
		if [ "$$meu" = "1" ]; then \
			echo "O make está rodando dentro deste Multishell. Não vou fechá-lo: isso mataria esta sessão."; \
		else \
			kill $$pids 2>/dev/null || true; \
			i=0; while [ $$i -lt 20 ] && ps -p $$pids >/dev/null 2>&1; do sleep 0.5; i=$$((i+1)); done; \
		fi; \
	fi; \
	rodando=0; ps -Ao comm= | grep -qxF "$(MS_BIN)" && rodando=1; \
	antigo="$(INSTALL_DIR)/Multishell.old.app"; \
	[ "$$rodando" = "0" ] && rm -rf "$$antigo"; \
	if [ -d "$(INSTALL_DIR)/Multishell.app" ]; then \
		[ -e "$$antigo" ] && antigo="$(INSTALL_DIR)/Multishell.old-$$(date +%s).app"; \
		mv "$(INSTALL_DIR)/Multishell.app" "$$antigo" 2>/dev/null || rm -rf "$(INSTALL_DIR)/Multishell.app"; \
	fi; \
	cp -R "$$app" "$(INSTALL_DIR)/"; \
	echo "Instalado com sucesso em $(INSTALL_DIR)/Multishell.app (de $$app)"; \
	if [ "$$rodando" = "1" ]; then \
		echo "Multishell está rodando (PID$$pids). Guardei o bundle antigo em $$antigo."; \
		echo "Apagá-lo agora deixaria o app rodando sobre arquivos apagados."; \
		echo "Reinicie o app e rode: make clean-old-mac"; \
	else \
		rm -rf "$$antigo" 2>/dev/null || true; \
	fi

# Apaga os bundles antigos que o install guardou. Com o app rodando, não mexe:
# ele pode ainda estar lendo o bundle antigo.
clean-old-mac:
	@if ps -Ao comm= | grep -qxF "$(MS_BIN)"; then \
		echo "Multishell está rodando. Feche o app antes: ele pode estar lendo o bundle antigo."; \
		exit 1; \
	fi; \
	n=0; \
	for d in $(INSTALL_DIR)/Multishell.old.app $(INSTALL_DIR)/Multishell.old-*.app; do \
		[ -d "$$d" ] || continue; \
		rm -rf "$$d" && echo "apagado $$d" && n=$$((n+1)); \
	done; \
	[ "$$n" = "0" ] && echo "Nada para apagar." || true

clean:
	rm -rf $(APP_DIR)/out $(APP_DIR)/release $(APP_DIR)/dist

security-check:
	@echo "🔍 Running Gitleaks..."
	@gitleaks detect --source=. -v
	@echo "🔍 Running Semgrep..."
	@semgrep scan --config auto

# ---------- Swift (MultiShell/, congelado) ----------
SWIFT_APP_NAME   = Multishell
SWIFT_BUILD_DIR  = .build
SWIFT_APP_BUNDLE = $(SWIFT_BUILD_DIR)/$(SWIFT_APP_NAME).app

swift-build:
	swift build -c release

swift-bundle: swift-build
	@mkdir -p "$(SWIFT_APP_BUNDLE)/Contents/MacOS" "$(SWIFT_APP_BUNDLE)/Contents/Resources"
	@cp "$(SWIFT_BUILD_DIR)/release/$(SWIFT_APP_NAME)" "$(SWIFT_APP_BUNDLE)/Contents/MacOS/$(SWIFT_APP_NAME)"
	@cp "MultiShell/Resources/Info.plist" "$(SWIFT_APP_BUNDLE)/Contents/Info.plist"
	@if [ -f "MultiShell/Resources/AppIcon.icns" ]; then \
		cp "MultiShell/Resources/AppIcon.icns" "$(SWIFT_APP_BUNDLE)/Contents/Resources/"; \
	fi
	@echo "Bundle criado em $(SWIFT_APP_BUNDLE)"

swift-install: swift-bundle
	@-pkill -f "$(SWIFT_APP_NAME)" || true
	@rm -rf "$(INSTALL_DIR)/$(SWIFT_APP_NAME).app"
	@cp -R "$(SWIFT_APP_BUNDLE)" "$(INSTALL_DIR)/"
	@echo "Instalado em $(INSTALL_DIR)/$(SWIFT_APP_NAME).app"

swift-run: swift-build
	@"$(SWIFT_BUILD_DIR)/release/$(SWIFT_APP_NAME)"

swift-clean:
	rm -rf "$(SWIFT_BUILD_DIR)"

help:
	@echo "make dev          - Electron em modo dev (electron-vite)"
	@echo "make test         - vitest"
	@echo "make typecheck    - tsc --noEmit"
	@echo "make build        - electron-vite build -> app/out/"
	@echo "make dist         - electron-builder -> app/release/ (dmg / exe)"
	@echo "make install-mac  - Copia o .app de app/release/mac*/ para /Applications"
	@echo "make clean        - Remove app/out, app/release e app/dist"
	@echo "make swift-*      - Alvos do app Swift antigo (build, bundle, install, run, clean)"
