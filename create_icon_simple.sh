#!/bin/bash

set -e

ICON_DIR="MultiShell/Resources/AppIcon.iconset"
OUTPUT_ICON="MultiShell/Resources/AppIcon.icns"

echo "🎨 Criando ícone do MultiShell..."

# Criar diretório para o iconset
mkdir -p "$ICON_DIR"

# Criar imagem base usando comandos SF Symbols via swift
cat > /tmp/create_icon.swift << 'SWIFT'
import AppKit
import UniformTypeIdentifiers

let size = NSSize(width: 1024, height: 1024)
let image = NSImage(size: size)

image.lockFocus()

// Background gradient
let gradient = NSGradient(colors: [
    NSColor(red: 0.12, green: 0.23, blue: 0.54, alpha: 1.0),
    NSColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 1.0)
])
gradient?.draw(in: NSRect(x: 0, y: 0, width: size.width, height: size.height), angle: 135)

// Terminal window background
let windowRect = NSRect(x: 128, y: 128, width: 768, height: 768)
let windowPath = NSBezierPath(roundedRect: windowRect, xRadius: 120, yRadius: 120)
NSColor(white: 0.08, alpha: 1.0).setFill()
windowPath.fill()

// Border
NSColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 1.0).setStroke()
windowPath.lineWidth = 8
windowPath.stroke()

// Window buttons
let buttonY: CGFloat = 650
NSColor(red: 0.94, green: 0.27, blue: 0.27, alpha: 1.0).setFill()
NSBezierPath(ovalIn: NSRect(x: 180, y: buttonY, width: 36, height: 36)).fill()
NSColor(red: 0.96, green: 0.62, blue: 0.04, alpha: 1.0).setFill()
NSBezierPath(ovalIn: NSRect(x: 240, y: buttonY, width: 36, height: 36)).fill()
NSColor(red: 0.06, green: 0.73, blue: 0.51, alpha: 1.0).setFill()
NSBezierPath(ovalIn: NSRect(x: 300, y: buttonY, width: 36, height: 36)).fill()

// Terminal symbol "$"
let attrs: [NSAttributedString.Key: Any] = [
    .font: NSFont(name: "Monaco", size: 280) ?? NSFont.monospacedSystemFont(ofSize: 280, weight: .bold),
    .foregroundColor: NSColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 1.0)
]
let string = "$" as NSString
string.draw(at: NSPoint(x: 320, y: 320), withAttributes: attrs)

// Cursor
NSColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 0.7).setFill()
NSBezierPath(rect: NSRect(x: 580, y: 340, width: 50, height: 200)).fill()

// Grid lines (multiple shells)
NSColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 0.2).setStroke()
let line1 = NSBezierPath()
line1.lineWidth = 6
line1.move(to: NSPoint(x: 512, y: 200))
line1.line(to: NSPoint(x: 512, y: 600))
line1.stroke()

let line2 = NSBezierPath()
line2.lineWidth = 6
line2.move(to: NSPoint(x: 200, y: 450))
line2.line(to: NSPoint(x: 824, y: 450))
line2.stroke()

image.unlockFocus()

// Save as PNG
if let tiffData = image.tiffRepresentation,
   let bitmap = NSBitmapImageRep(data: tiffData),
   let pngData = bitmap.representation(using: .png, properties: [:]) {
    try pngData.write(to: URL(fileURLWithPath: "/tmp/multishell_base.png"))
}
SWIFT

# Compilar e executar o Swift para criar a imagem
echo "Gerando imagem base..."
swiftc -o /tmp/create_icon /tmp/create_icon.swift -framework AppKit
/tmp/create_icon

# Criar diferentes tamanhos usando sips
echo "Criando ícones em diferentes tamanhos..."
sips -z 16 16     /tmp/multishell_base.png --out "$ICON_DIR/icon_16x16.png" >/dev/null
sips -z 32 32     /tmp/multishell_base.png --out "$ICON_DIR/icon_16x16@2x.png" >/dev/null
sips -z 32 32     /tmp/multishell_base.png --out "$ICON_DIR/icon_32x32.png" >/dev/null
sips -z 64 64     /tmp/multishell_base.png --out "$ICON_DIR/icon_32x32@2x.png" >/dev/null
sips -z 128 128   /tmp/multishell_base.png --out "$ICON_DIR/icon_128x128.png" >/dev/null
sips -z 256 256   /tmp/multishell_base.png --out "$ICON_DIR/icon_128x128@2x.png" >/dev/null
sips -z 256 256   /tmp/multishell_base.png --out "$ICON_DIR/icon_256x256.png" >/dev/null
sips -z 512 512   /tmp/multishell_base.png --out "$ICON_DIR/icon_256x256@2x.png" >/dev/null
sips -z 512 512   /tmp/multishell_base.png --out "$ICON_DIR/icon_512x512.png" >/dev/null
sips -z 1024 1024 /tmp/multishell_base.png --out "$ICON_DIR/icon_512x512@2x.png" >/dev/null

# Criar arquivo .icns
echo "Criando arquivo .icns..."
iconutil -c icns "$ICON_DIR" -o "$OUTPUT_ICON"

# Limpar
rm -rf "$ICON_DIR"
rm -f /tmp/multishell_base.png /tmp/create_icon /tmp/create_icon.swift

echo "✅ Ícone criado: $OUTPUT_ICON"
ls -lh "$OUTPUT_ICON"
