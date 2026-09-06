#!/bin/bash

set -e

ICON_DIR="MultiShell/Resources/AppIcon.iconset"
OUTPUT_ICON="MultiShell/Resources/AppIcon.icns"

echo "🎨 Criando ícone do MultiShell..."

# Criar diretório temporário para o iconset
mkdir -p "$ICON_DIR"

# Usar sf symbols para criar ícone baseado em terminal
# Vamos criar um SVG simples e converter para PNG

cat > /tmp/multishell_icon.svg << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="window" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" style="stop-color:#1f2937;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#111827;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Rounded rectangle background -->
  <rect x="128" y="128" width="768" height="768" rx="180" fill="url(#bg)"/>

  <!-- Terminal window -->
  <rect x="192" y="256" width="640" height="480" rx="20" fill="url(#window)" stroke="#3b82f6" stroke-width="6"/>

  <!-- Window buttons -->
  <circle cx="230" cy="300" r="18" fill="#ef4444"/>
  <circle cx="280" cy="300" r="18" fill="#f59e0b"/>
  <circle cx="330" cy="300" r="18" fill="#10b981"/>

  <!-- Terminal prompt symbol -->
  <text x="240" y="440" font-family="Monaco, monospace" font-size="120" font-weight="bold" fill="#3b82f6">$</text>
  <rect x="340" y="380" width="40" height="60" fill="#3b82f6" opacity="0.6"/>

  <!-- Window divider lines (representing multiple shells) -->
  <line x1="512" y1="356" x2="512" y2="680" stroke="#3b82f6" stroke-width="4" opacity="0.3"/>
  <line x1="192" y1="520" x2="832" y2="520" stroke="#3b82f6" stroke-width="4" opacity="0.3"/>
</svg>
EOF

# Converter SVG para PNG em diferentes tamanhos
# Se não tiver qlmanage, usar sips ou outra ferramenta

if command -v convert &> /dev/null; then
    # ImageMagick disponível
    echo "Usando ImageMagick..."
    convert /tmp/multishell_icon.svg -resize 16x16   "$ICON_DIR/icon_16x16.png"
    convert /tmp/multishell_icon.svg -resize 32x32   "$ICON_DIR/icon_16x16@2x.png"
    convert /tmp/multishell_icon.svg -resize 32x32   "$ICON_DIR/icon_32x32.png"
    convert /tmp/multishell_icon.svg -resize 64x64   "$ICON_DIR/icon_32x32@2x.png"
    convert /tmp/multishell_icon.svg -resize 128x128 "$ICON_DIR/icon_128x128.png"
    convert /tmp/multishell_icon.svg -resize 256x256 "$ICON_DIR/icon_128x128@2x.png"
    convert /tmp/multishell_icon.svg -resize 256x256 "$ICON_DIR/icon_256x256.png"
    convert /tmp/multishell_icon.svg -resize 512x512 "$ICON_DIR/icon_256x256@2x.png"
    convert /tmp/multishell_icon.svg -resize 512x512 "$ICON_DIR/icon_512x512.png"
    convert /tmp/multishell_icon.svg -resize 1024x1024 "$ICON_DIR/icon_512x512@2x.png"
elif command -v rsvg-convert &> /dev/null; then
    # librsvg disponível
    echo "Usando rsvg-convert..."
    rsvg-convert -w 16 -h 16 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_16x16.png"
    rsvg-convert -w 32 -h 32 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_16x16@2x.png"
    rsvg-convert -w 32 -h 32 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_32x32.png"
    rsvg-convert -w 64 -h 64 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_32x32@2x.png"
    rsvg-convert -w 128 -h 128 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_128x128.png"
    rsvg-convert -w 256 -h 256 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_128x128@2x.png"
    rsvg-convert -w 256 -h 256 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_256x256.png"
    rsvg-convert -w 512 -h 512 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_256x256@2x.png"
    rsvg-convert -w 512 -h 512 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_512x512.png"
    rsvg-convert -w 1024 -h 1024 /tmp/multishell_icon.svg -o "$ICON_DIR/icon_512x512@2x.png"
else
    echo "❌ Nenhuma ferramenta de conversão de SVG encontrada (ImageMagick ou librsvg)"
    echo "📥 Instalando via Homebrew..."

    if ! command -v brew &> /dev/null; then
        echo "❌ Homebrew não está instalado. Por favor, instale ImageMagick ou librsvg manualmente."
        exit 1
    fi

    brew install imagemagick

    # Tentar novamente
    convert /tmp/multishell_icon.svg -resize 16x16   "$ICON_DIR/icon_16x16.png"
    convert /tmp/multishell_icon.svg -resize 32x32   "$ICON_DIR/icon_16x16@2x.png"
    convert /tmp/multishell_icon.svg -resize 32x32   "$ICON_DIR/icon_32x32.png"
    convert /tmp/multishell_icon.svg -resize 64x64   "$ICON_DIR/icon_32x32@2x.png"
    convert /tmp/multishell_icon.svg -resize 128x128 "$ICON_DIR/icon_128x128.png"
    convert /tmp/multishell_icon.svg -resize 256x256 "$ICON_DIR/icon_128x128@2x.png"
    convert /tmp/multishell_icon.svg -resize 256x256 "$ICON_DIR/icon_256x256.png"
    convert /tmp/multishell_icon.svg -resize 512x512 "$ICON_DIR/icon_256x256@2x.png"
    convert /tmp/multishell_icon.svg -resize 512x512 "$ICON_DIR/icon_512x512.png"
    convert /tmp/multishell_icon.svg -resize 1024x1024 "$ICON_DIR/icon_512x512@2x.png"
fi

# Criar arquivo .icns
echo "📦 Criando arquivo .icns..."
iconutil -c icns "$ICON_DIR" -o "$OUTPUT_ICON"

# Limpar
rm -rf "$ICON_DIR"
rm /tmp/multishell_icon.svg

echo "✅ Ícone criado: $OUTPUT_ICON"
