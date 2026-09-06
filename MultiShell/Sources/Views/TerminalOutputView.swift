import SwiftUI
import SwiftTerm
import AppKit

struct TerminalOutputView: NSViewRepresentable {
    @Binding var terminalView: LocalTerminalView
    var theme: TerminalTheme
    var onDirectoryChanged: ((String) -> Void)?
    @AppStorage("fontSize") private var fontSize = 12.0
    @AppStorage("fontFamily") private var fontFamily = "SF Mono"
    
    func makeNSView(context: Context) -> LocalTerminalView {
        updateTerminalSettings(terminalView)
        terminalView.terminal.changeHistorySize(50000)
        terminalView.onDirectoryChanged = { dir in
            if let dir = dir {
                onDirectoryChanged?(dir)
            }
        }
        terminalView.setContentHuggingPriority(.defaultLow, for: .horizontal)
        terminalView.setContentHuggingPriority(.defaultLow, for: .vertical)
        terminalView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        terminalView.setContentCompressionResistancePriority(.defaultLow, for: .vertical)
        return terminalView
    }
    
    func updateNSView(_ nsView: LocalTerminalView, context: Context) {
        updateTerminalSettings(nsView)
    }

    private func updateTerminalSettings(_ nsView: LocalTerminalView) {
        // Fonte
        let font = NSFont(name: fontFamily, size: CGFloat(fontSize)) ?? NSFont.monospacedSystemFont(ofSize: CGFloat(fontSize), weight: .regular)
        if nsView.font != font {
            nsView.font = font
        }
        
        // Tema (Cores)
        let (bg, fg) = getColors()
        if nsView.nativeBackgroundColor != bg {
            nsView.nativeBackgroundColor = bg
        }
        if nsView.nativeForegroundColor != fg {
            nsView.nativeForegroundColor = fg
        }
    }

    private func getColors() -> (NSColor, NSColor) {
        return (theme.backgroundColor, theme.foregroundColor)
    }
}

// Re-declarar enum ou mover para arquivo compartilhado. 
// Para simplicidade agora, vou apenas garantir que o TerminalOutputView conheça o enum.
// Na verdade, o enum está em SettingsView.swift. Vou mover para um local acessível.


class LocalTerminalView: TerminalView, TerminalViewDelegate {
    var onDataSent: ((Data) -> Void)?
    var onSizeChanged: ((Int, Int) -> Void)?
    var onDirectoryChanged: ((String?) -> Void)?
    var onFocusReceived: (() -> Void)?
    
    override init(frame: CGRect) {
        super.init(frame: frame)
        self.terminalDelegate = self
        installScrollMonitor()
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        self.terminalDelegate = self
        installScrollMonitor()
    }

    deinit {
        if let monitor = scrollMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }

    // MARK: - Scroll (trackpad/mouse mais suave + teclado)

    /// scrollWheel/keyDown do TerminalView são `public` (não `open`), então não
    /// podem ser sobrescritos neste módulo. Usamos um monitor local de eventos,
    /// ativo apenas quando o cursor/foco estão sobre esta view.
    private var scrollMonitor: Any?
    /// Acumula deltas fracionários do trackpad para um scroll linha-a-linha suave.
    private var scrollAccumulator: CGFloat = 0

    private func installScrollMonitor() {
        scrollMonitor = NSEvent.addLocalMonitorForEvents(matching: [.scrollWheel, .keyDown]) { [weak self] event in
            guard let self = self, self.window != nil, event.window === self.window else { return event }

            switch event.type {
            case .scrollWheel:
                let hit = self.window?.contentView?.hitTest(event.locationInWindow)
                guard hit === self else { return event }
                if self.handleSmoothScroll(event) { return nil }
            case .keyDown:
                guard self.window?.firstResponder === self else { return event }
                if self.handleScrollKeys(event) { return nil }
            default:
                break
            }
            return event
        }
    }

    private func handleSmoothScroll(_ event: NSEvent) -> Bool {
        // Apps que capturam o scroll (mouseMode) mantêm o comportamento padrão.
        if terminal.mouseMode.sendMotionEvent() { return false }
        guard event.scrollingDeltaY != 0 || event.deltaY != 0 else { return false }

        let raw = event.hasPreciseScrollingDeltas ? event.scrollingDeltaY : event.deltaY * 3
        // Converte pixels/detentes em linhas de forma suave.
        let sensitivity: CGFloat = event.hasPreciseScrollingDeltas ? 0.06 : 1.0
        scrollAccumulator += raw * sensitivity

        let lines = Int(scrollAccumulator)
        guard lines != 0 else { return true }
        scrollAccumulator -= CGFloat(lines)

        if lines > 0 {
            scrollUp(lines: lines)
        } else {
            scrollDown(lines: -lines)
        }
        return true
    }

    private func handleScrollKeys(_ event: NSEvent) -> Bool {
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard flags.contains(.shift) else { return false }

        // Shift + setas/PageUp/PageDown percorrem o histórico (scrollback),
        // funcionando mesmo dentro de TUIs (claude/codex) que capturam as teclas.
        switch Int(event.keyCode) {
        case 126: scrollUp(lines: 3); return true    // seta para cima
        case 125: scrollDown(lines: 3); return true  // seta para baixo
        case 116: pageUp(); return true              // Page Up
        case 121: pageDown(); return true            // Page Down
        default: return false
        }
    }

    // MARK: - TerminalViewDelegate
    
    func send(source: TerminalView, data: ArraySlice<UInt8>) {
        onDataSent?(Data(data))
    }
    
    func scrolled(source: TerminalView, position: Double) {}
    func setTerminalTitle(source: TerminalView, title: String) {}
    func sizeChanged(source: TerminalView, newCols: Int, newRows: Int) {
        onSizeChanged?(newCols, newRows)
    }
    func requestOpenLink(source: TerminalView, link: String, params: [String : String]) {}
    func bell(source: TerminalView) {
        NSSound.beep()
    }
    func hostCurrentDirectoryUpdate(source: TerminalView, directory: String?) {
        onDirectoryChanged?(directory)
    }
    func focusChanged(source: TerminalView, focused: Bool) {
        if focused {
            onFocusReceived?()
        }
    }
    func rangeChanged(source: TerminalView, startY: Int, endY: Int) {}
    func clipboardCopy(source: TerminalView, content: Data) {}
}
