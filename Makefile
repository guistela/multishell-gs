.PHONY: dev test typecheck build dist install-mac clean help \
        swift-build swift-bundle swift-install swift-run swift-clean

APP_DIR      = app
INSTALL_DIR  = /Applications
# electron-builder gera release/mac/ (x64) e release/mac-arm64/ (arm64).
# O .app é procurado no shell, depois do `dist`. Para forçar um:
#   make install-mac ELECTRON_APP=app/release/mac-arm64/Multishell.app
ELECTRON_APP ?=

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
	if [ "$$NO_KILL" != "1" ]; then \
		pkill -x Multishell 2>/dev/null || true; \
	fi; \
	if [ -d "$(INSTALL_DIR)/Multishell.app" ]; then \
		mv "$(INSTALL_DIR)/Multishell.app" "$(INSTALL_DIR)/Multishell.old.app" 2>/dev/null || rm -rf "$(INSTALL_DIR)/Multishell.app"; \
	fi; \
	cp -R "$$app" "$(INSTALL_DIR)/"; \
	rm -rf "$(INSTALL_DIR)/Multishell.old.app" 2>/dev/null || true; \
	echo "Instalado com sucesso em $(INSTALL_DIR)/Multishell.app (de $$app)"

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
