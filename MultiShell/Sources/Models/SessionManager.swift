import Foundation
import SwiftUI
import Combine
import AppKit

class SessionManager: ObservableObject {
    @Published var sessions: [ShellSession] = []
    @Published var profiles: [ShellProfile] = []
    @Published var selectedSession: UUID? {
        didSet {
            if let uuid = selectedSession {
                UserDefaults.standard.set(uuid.uuidString, forKey: "lastSelectedSession")
            }
        }
    }
    @Published var layoutMode: LayoutMode = .grid
    @Published var bookmarks: [TerminalBookmark] = []
    /// Filtro de visão por perfil. nil = todos os perfis.
    @Published var profileFilter: UUID? = nil

    private var shellProcesses: [UUID: ShellProcess] = [:]
    var terminalViews: [UUID: LocalTerminalView] = [:]

    // MARK: - Perfis

    func profile(for id: UUID) -> ShellProfile? {
        profiles.first { $0.id == id }
    }

    /// Perfil de fallback quando o id referenciado não existe mais.
    var defaultProfile: ShellProfile {
        profiles.first(where: { $0.id == ShellProfile.personalDefaultId }) ?? profiles.first ?? ShellProfile(name: "Pessoal", directoryName: "personal")
    }

    func resolvedProfile(for session: ShellSession) -> ShellProfile {
        profile(for: session.profileId) ?? defaultProfile
    }

    var filteredSessions: [ShellSession] {
        guard let filter = profileFilter else { return sessions }
        return sessions.filter { $0.profileId == filter }
    }

    var filteredBookmarks: [TerminalBookmark] {
        guard let filter = profileFilter else { return bookmarks }
        return bookmarks.filter { $0.profileId == filter }
    }

    /// Sessões agrupadas por perfil, na ordem dos perfis.
    var sessionsByProfile: [(profile: ShellProfile, sessions: [ShellSession])] {
        profiles.compactMap { profile in
            let items = sessions.filter { $0.profileId == profile.id }
            return items.isEmpty ? nil : (profile, items)
        }
    }

    init() {
        loadProfiles()
        loadBookmarks()
        loadSessions()
    }

    // MARK: - Ambiente de Shell (isolamento por perfil)

    private func profileRoot(for profile: ShellProfile) -> URL {
        URL(fileURLWithPath: NSHomeDirectory(), isDirectory: true)
            .appendingPathComponent(".multishell", isDirectory: true)
            .appendingPathComponent("profiles", isDirectory: true)
            .appendingPathComponent(profile.directoryName, isDirectory: true)
    }

    private func shellEnvironment(for profile: ShellProfile) -> [String: String] {
        let realHome = NSHomeDirectory()
        let root = profileRoot(for: profile)
        let configHome = root.appendingPathComponent(".config", isDirectory: true)
        let dataHome = root.appendingPathComponent(".local/share", isDirectory: true)
        let stateHome = root.appendingPathComponent(".local/state", isDirectory: true)
        let cacheHome = root.appendingPathComponent(".cache", isDirectory: true)

        [
            root,
            configHome,
            dataHome,
            stateHome,
            cacheHome,
            configHome.appendingPathComponent("gcloud", isDirectory: true),
            configHome.appendingPathComponent("gh", isDirectory: true),
            configHome.appendingPathComponent("configstore", isDirectory: true),
            root.appendingPathComponent(".docker", isDirectory: true),
            root.appendingPathComponent(".kube", isDirectory: true)
        ].forEach { url in
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        }

        // Criar link simbólico para Keychains do macOS nativo para suportar autenticação baseada em Keychain
        let libraryDir = root.appendingPathComponent("Library", isDirectory: true)
        try? FileManager.default.createDirectory(at: libraryDir, withIntermediateDirectories: true)
        let keychainsSymlink = libraryDir.appendingPathComponent("Keychains")

        var isDir: ObjCBool = false
        let exists = FileManager.default.fileExists(atPath: keychainsSymlink.path, isDirectory: &isDir)
        if exists {
            let attrs = try? FileManager.default.attributesOfItem(atPath: keychainsSymlink.path)
            if attrs?[.type] as? FileAttributeType != .typeSymbolicLink {
                try? FileManager.default.removeItem(at: keychainsSymlink)
                let realKeychains = URL(fileURLWithPath: realHome).appendingPathComponent("Library/Keychains")
                try? FileManager.default.createSymbolicLink(at: keychainsSymlink, withDestinationURL: realKeychains)
            }
        } else {
            let realKeychains = URL(fileURLWithPath: realHome).appendingPathComponent("Library/Keychains")
            try? FileManager.default.createSymbolicLink(at: keychainsSymlink, withDestinationURL: realKeychains)
        }

        var env: [String: String] = [
            "HOME": root.path,
            "MULTISHELL_PROFILE": profile.directoryName,
            "MULTISHELL_PROFILE_NAME": profile.name,
            "MULTISHELL_PROFILE_HOME": root.path,
            "MULTISHELL_REAL_HOME": realHome,
            "ZDOTDIR": realHome,
            "XDG_CONFIG_HOME": configHome.path,
            "XDG_DATA_HOME": dataHome.path,
            "XDG_STATE_HOME": stateHome.path,
            "XDG_CACHE_HOME": cacheHome.path,
            "CLOUDSDK_CONFIG": configHome.appendingPathComponent("gcloud", isDirectory: true).path,
            "GH_CONFIG_DIR": configHome.appendingPathComponent("gh", isDirectory: true).path,
            "FIREBASE_CONFIG_DIR": configHome.appendingPathComponent("configstore", isDirectory: true).path,
            "DOCKER_CONFIG": root.appendingPathComponent(".docker", isDirectory: true).path,
            "KUBECONFIG": root.appendingPathComponent(".kube/config").path,
            "NPM_CONFIG_USERCONFIG": root.appendingPathComponent(".npmrc").path,
            "MULTISHELL_ENV": profile.directoryName
        ]

        // Variáveis customizadas do perfil sobrescrevem as padrão.
        for variable in profile.customEnv {
            let key = variable.key.trimmingCharacters(in: .whitespaces)
            guard !key.isEmpty else { continue }
            env[key] = variable.value
        }

        return env
    }

    private func shellQuoted(_ value: String) -> String {
        "'\(value.replacingOccurrences(of: "'", with: "'\\''"))'"
    }

    private func environmentExportCommand(for profile: ShellProfile) -> String {
        shellEnvironment(for: profile)
            .sorted { $0.key < $1.key }
            .map { "export \($0.key)=\(shellQuoted($0.value))" }
            .joined(separator: "; ")
    }

    // MARK: - Criação de sessão

    /// Conecta os callbacks padrão entre um ShellProcess e sua LocalTerminalView.
    private func wire(session: ShellSession, terminalView: LocalTerminalView, shellProcess: ShellProcess) {
        let sessionId = session.id

        terminalView.onFocusReceived = { [weak self] in
            DispatchQueue.main.async {
                if self?.selectedSession != sessionId {
                    self?.selectedSession = sessionId
                }
            }
        }

        shellProcess.onDataReceived = { [weak self] data in
            DispatchQueue.main.async {
                self?.terminalViews[sessionId]?.feed(byteArray: ArraySlice(data))
            }
        }

        terminalView.onDataSent = { data in
            shellProcess.writeData(data)
        }

        terminalView.onSizeChanged = { cols, rows in
            shellProcess.resize(cols: cols, rows: rows)
        }

        shellProcess.onStatusChange = { [weak self] isRunning in
            self?.updateSessionStatus(sessionId: sessionId, isRunning: isRunning)
        }
    }

    func createSession(title: String = "Nova Sessão", color: Color = .blue, profileId: UUID? = nil) {
        let globalThemeRaw = UserDefaults.standard.string(forKey: "terminalTheme") ?? TerminalTheme.basic.rawValue
        let globalTheme = TerminalTheme.fromRawValueCompat(globalThemeRaw)

        // Determina o perfil: explícito > filtro ativo > perfil padrão.
        let targetProfileId = profileId ?? profileFilter ?? defaultProfile.id
        let profile = profile(for: targetProfileId) ?? defaultProfile

        let session = ShellSession(title: title, color: color, theme: globalTheme, profileId: profile.id)
        sessions.append(session)
        saveSessions()

        let terminalView = LocalTerminalView(frame: .zero)
        terminalViews[session.id] = terminalView

        let preferredShell = UserDefaults.standard.string(forKey: "defaultShell") ?? "/bin/zsh"
        let preferredPath = UserDefaults.standard.string(forKey: "defaultPath") ?? NSHomeDirectory()

        let shellProcess = ShellProcess(sessionId: session.id, shellPath: preferredShell, workingDirectory: preferredPath, environment: shellEnvironment(for: profile))
        shellProcesses[session.id] = shellProcess

        wire(session: session, terminalView: terminalView, shellProcess: shellProcess)
        shellProcess.start()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            shellProcess.writeData(Data((self.environmentExportCommand(for: profile) + "\n").utf8))
        }

        selectedSession = session.id
    }

    func createSession(from bookmark: TerminalBookmark) {
        let theme = TerminalTheme.fromRawValueCompat(bookmark.themeRaw)
        let profile = profile(for: bookmark.profileId) ?? defaultProfile
        let session = ShellSession(title: bookmark.title, theme: theme, profileId: profile.id)
        sessions.append(session)
        saveSessions()

        let terminalView = LocalTerminalView(frame: .zero)
        terminalViews[session.id] = terminalView

        let preferredShell = UserDefaults.standard.string(forKey: "defaultShell") ?? "/bin/zsh"
        let workingDir = bookmark.workingDirectory.isEmpty ? NSHomeDirectory() : bookmark.workingDirectory

        let shellProcess = ShellProcess(sessionId: session.id, shellPath: preferredShell, workingDirectory: workingDir, environment: shellEnvironment(for: profile))
        shellProcesses[session.id] = shellProcess

        wire(session: session, terminalView: terminalView, shellProcess: shellProcess)
        shellProcess.start()

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
            shellProcess.writeData(Data((self.environmentExportCommand(for: profile) + "\n").utf8))
        }

        if !bookmark.initialCommand.isEmpty {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.7) {
                let command = bookmark.initialCommand + "\n"
                shellProcess.writeData(Data(command.utf8))
            }
        }

        selectedSession = session.id
    }

    func deleteSession(_ session: ShellSession) {
        shellProcesses[session.id]?.terminate()
        shellProcesses.removeValue(forKey: session.id)
        terminalViews.removeValue(forKey: session.id)
        sessions.removeAll { $0.id == session.id }
        saveSessions()

        if selectedSession == session.id {
            selectedSession = filteredSessions.first?.id
        }
    }

    func updateSession(_ session: ShellSession) {
        if let index = sessions.firstIndex(where: { $0.id == session.id }) {
            sessions[index] = session
            objectWillChange.send()
            saveSessions()
        }
    }

    private func updateSessionStatus(sessionId: UUID, isRunning: Bool) {
        DispatchQueue.main.async {
            if let index = self.sessions.firstIndex(where: { $0.id == sessionId }) {
                self.sessions[index].isRunning = isRunning
            }
        }
    }

    func clearSession(_ sessionId: UUID) {
        terminalViews[sessionId]?.feed(text: "\u{1b}[2J\u{1b}[H")
    }

    func sendLine(to sessionId: UUID, command: String) {
        if let shellProcess = shellProcesses[sessionId] {
            let fullCommand = command + "\n"
            shellProcess.writeData(Data(fullCommand.utf8))
        }
    }

    /// Reaplica (re-exporta) as variáveis de um perfil numa sessão em execução.
    func applyProfile(to sessionId: UUID, profile: ShellProfile) {
        sendLine(to: sessionId, command: environmentExportCommand(for: profile))
    }

    // MARK: - Perfis: CRUD

    func loadProfiles() {
        if let data = UserDefaults.standard.data(forKey: "shellProfiles"),
           let decoded = try? JSONDecoder().decode([ShellProfile].self, from: data),
           !decoded.isEmpty {
            profiles = decoded
        } else {
            profiles = ShellProfile.defaultProfiles()
            saveProfiles()
        }
    }

    func saveProfiles() {
        if let encoded = try? JSONEncoder().encode(profiles) {
            UserDefaults.standard.set(encoded, forKey: "shellProfiles")
        }
    }

    @discardableResult
    func addProfile(name: String, colorHex: String = "#00E5FF") -> ShellProfile {
        let dir = ShellProfile.makeDirectoryName(from: name, existing: profiles.map { $0.directoryName })
        let profile = ShellProfile(name: name, colorHex: colorHex, directoryName: dir)
        profiles.append(profile)
        saveProfiles()
        return profile
    }

    func updateProfile(_ profile: ShellProfile) {
        if let index = profiles.firstIndex(where: { $0.id == profile.id }) {
            profiles[index] = profile
            objectWillChange.send()
            saveProfiles()
        }
    }

    /// Remove um perfil. Sessões daquele perfil são movidas para o perfil de
    /// fallback (não são fechadas). Impede remover o último perfil.
    func deleteProfile(_ profile: ShellProfile) {
        guard profiles.count > 1 else { return }
        profiles.removeAll { $0.id == profile.id }
        let fallback = defaultProfile.id
        for i in 0..<sessions.count where sessions[i].profileId == profile.id {
            sessions[i].profileId = fallback
        }
        for i in 0..<bookmarks.count where bookmarks[i].profileId == profile.id {
            bookmarks[i].profileId = fallback
        }
        if profileFilter == profile.id { profileFilter = nil }
        saveProfiles()
        saveSessions()
        saveBookmarks()
    }

    // MARK: - Bookmarks Management

    func loadBookmarks() {
        if let data = UserDefaults.standard.data(forKey: "terminalBookmarks") {
            if let decoded = try? JSONDecoder().decode([TerminalBookmark].self, from: data) {
                self.bookmarks = decoded
                return
            }
        }

        // Favoritos padrão
        self.bookmarks = [
            TerminalBookmark(title: "Term Trabalho", workingDirectory: NSHomeDirectory(), initialCommand: "", colorHex: NSColor(TerminalTheme.basic.themeColor).hexString, themeRaw: TerminalTheme.basic.rawValue, profileId: ShellProfile.workDefaultId),
            TerminalBookmark(title: "Term Pessoal", workingDirectory: NSHomeDirectory(), initialCommand: "", colorHex: NSColor(TerminalTheme.pro.themeColor).hexString, themeRaw: TerminalTheme.pro.rawValue, profileId: ShellProfile.personalDefaultId)
        ]
        saveBookmarks()
    }

    func saveBookmarks() {
        if let encoded = try? JSONEncoder().encode(bookmarks) {
            UserDefaults.standard.set(encoded, forKey: "terminalBookmarks")
        }
    }

    func addBookmark(title: String, workingDirectory: String = "", initialCommand: String = "", theme: TerminalTheme = .basic, profileId: UUID = ShellProfile.personalDefaultId) {
        let colorHex = NSColor(theme.themeColor).hexString

        let bookmark = TerminalBookmark(
            title: title,
            workingDirectory: workingDirectory,
            initialCommand: initialCommand,
            colorHex: colorHex,
            themeRaw: theme.rawValue,
            profileId: profileId
        )
        bookmarks.append(bookmark)
        saveBookmarks()
    }

    func deleteBookmark(_ bookmark: TerminalBookmark) {
        bookmarks.removeAll { $0.id == bookmark.id }
        saveBookmarks()
    }

    func updateBookmark(_ bookmark: TerminalBookmark) {
        if let index = bookmarks.firstIndex(where: { $0.id == bookmark.id }) {
            bookmarks[index] = bookmark
            saveBookmarks()
        }
    }

    @discardableResult
    func updateSessionsCurrentDirectories() -> Bool {
        var changed = false
        for i in 0..<sessions.count {
            let session = sessions[i]
            if let shellProcess = shellProcesses[session.id],
               let cwd = shellProcess.getCurrentWorkingDirectory() {
                if sessions[i].currentDirectory != cwd {
                    sessions[i].currentDirectory = cwd
                    changed = true
                }
            }
        }
        if changed {
            if let encoded = try? JSONEncoder().encode(sessions) {
                UserDefaults.standard.set(encoded, forKey: "activeSessions")
            }
        }
        return changed
    }

    func saveSessions() {
        let changed = updateSessionsCurrentDirectories()
        if !changed {
            if let encoded = try? JSONEncoder().encode(sessions) {
                UserDefaults.standard.set(encoded, forKey: "activeSessions")
            }
        }
    }

    func loadSessions() {
        if let data = UserDefaults.standard.data(forKey: "activeSessions"),
           let decoded = try? JSONDecoder().decode([ShellSession].self, from: data),
           !decoded.isEmpty {

            for var session in decoded {
                session.isRunning = false
                sessions.append(session)

                let profile = profile(for: session.profileId) ?? defaultProfile
                let terminalView = LocalTerminalView(frame: .zero)
                terminalViews[session.id] = terminalView

                let preferredShell = UserDefaults.standard.string(forKey: "defaultShell") ?? "/bin/zsh"
                let preferredPath = UserDefaults.standard.string(forKey: "defaultPath") ?? NSHomeDirectory()
                let workingPath = session.currentDirectory ?? preferredPath

                let shellProcess = ShellProcess(sessionId: session.id, shellPath: preferredShell, workingDirectory: workingPath, environment: shellEnvironment(for: profile))
                shellProcesses[session.id] = shellProcess

                wire(session: session, terminalView: terminalView, shellProcess: shellProcess)
                shellProcess.start()

                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                    shellProcess.writeData(Data((self.environmentExportCommand(for: profile) + "\n").utf8))
                }

                if let startCmd = session.agentStartCommand {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                        self?.sendLine(to: session.id, command: startCmd)
                    }
                }
            }

            if let lastSelected = UserDefaults.standard.string(forKey: "lastSelectedSession"),
               let uuid = UUID(uuidString: lastSelected),
               sessions.contains(where: { $0.id == uuid }) {
                selectedSession = uuid
            } else {
                selectedSession = filteredSessions.first?.id
            }
        } else {
            if let firstBookmark = bookmarks.first {
                createSession(from: firstBookmark)
            } else {
                createSession()
            }
        }
    }

    // MARK: - Logs

    func getLogURL(for sessionId: UUID) -> URL? {
        return shellProcesses[sessionId]?.logURL
    }

    func openLogFile(for sessionId: UUID) {
        if let url = getLogURL(for: sessionId) {
            NSWorkspace.shared.open(url)
        }
    }

    func openLogsDirectory() {
        let logsDir = URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent(".multishell", isDirectory: true)
            .appendingPathComponent("logs", isDirectory: true)
        NSWorkspace.shared.open(logsDir)
    }
}

// MARK: - NSColor Hex Extensions
extension NSColor {
    convenience init?(hex: String) {
        var cleanHex = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        cleanHex = cleanHex.replacingOccurrences(of: "#", with: "")

        var rgb: UInt64 = 0
        guard Scanner(string: cleanHex).scanHexInt64(&rgb) else { return nil }

        let r, g, b: CGFloat
        if cleanHex.count == 6 {
            r = CGFloat((rgb & 0xFF0000) >> 16) / 255.0
            g = CGFloat((rgb & 0x00FF00) >> 8) / 255.0
            b = CGFloat(rgb & 0x0000FF) / 255.0
            self.init(red: r, green: g, blue: b, alpha: 1.0)
        } else {
            return nil
        }
    }

    var hexString: String {
        guard let rgbColor = usingColorSpace(.deviceRGB) else { return "#FFFFFF" }
        let r = Int(rgbColor.redComponent * 255)
        let g = Int(rgbColor.greenComponent * 255)
        let b = Int(rgbColor.blueComponent * 255)
        return String(format: "#%02X%02X%02X", r, g, b)
    }
}
