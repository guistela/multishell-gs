#!/bin/bash

set -e

APP_NAME="Multishell"
BUILD_DIR=".build"
APP_BUNDLE="${BUILD_DIR}/${APP_NAME}.app"

echo "🔨 Compilando ${APP_NAME}..."

# Compilar com Swift Package Manager
# Nota: Para build universal (arm64 + x86_64), use Xcode
swift build -c release

echo "📦 Criando bundle da aplicação..."

# Criar estrutura do bundle
mkdir -p "${APP_BUNDLE}/Contents/MacOS"
mkdir -p "${APP_BUNDLE}/Contents/Resources"

# Copiar executável
cp "${BUILD_DIR}/release/${APP_NAME}" "${APP_BUNDLE}/Contents/MacOS/"

# Copiar Info.plist
cp "MultiShell/Resources/Info.plist" "${APP_BUNDLE}/Contents/Info.plist"

# Copiar ícone (se existir)
if [ -f "MultiShell/Resources/AppIcon.icns" ]; then
    cp "MultiShell/Resources/AppIcon.icns" "${APP_BUNDLE}/Contents/Resources/"
    echo "  ✓ Ícone copiado"
fi

# Tornar executável
chmod +x "${APP_BUNDLE}/Contents/MacOS/${APP_NAME}"

echo "✅ Build concluído!"
echo "📍 App criado em: ${APP_BUNDLE}"
echo ""
echo "Para executar:"
echo "  open ${APP_BUNDLE}"
echo ""
echo "Para instalar:"
echo "  cp -R ${APP_BUNDLE} /Applications/"
