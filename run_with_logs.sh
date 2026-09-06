#!/bin/bash

# Abrir app e capturar logs
echo "🚀 Abrindo Multishell e monitorando logs..."

# Matar instância anterior
pkill -9 -f "Multishell" 2>/dev/null

# Executar app diretamente para capturar stderr
".build/Multishell.app/Contents/MacOS/Multishell" 2>&1 | tee /tmp/multishell.log &

APP_PID=$!
echo "📍 Multishell PID: $APP_PID"
echo "📝 Logs em /tmp/multishell.log"
echo ""
echo "Aguardando logs (Ctrl+C para parar)..."
echo "========================================"

# Seguir os logs
tail -f /tmp/multishell.log
