import Foundation
import SwiftUI
import AppKit

/// Enum legado, mantido apenas para migrar dados antigos (sessões/favoritos
/// que persistiam `environment`) para o novo modelo de perfis dinâmicos.
enum SessionEnvironment: String, Codable, CaseIterable {
    case personal = "personal"
    case peers = "peers"

    var legacyProfileId: UUID {
        switch self {
        case .personal: return ShellProfile.personalDefaultId
        case .peers: return ShellProfile.workDefaultId
        }
    }
}

enum AgentType: String, Codable, CaseIterable {
    case claudePeers = "Claude Peers"
    case claudePersonal = "Claude Pessoal"
    case agyGemini = "Antigravity Gemini"
    case agyClaude = "Antigravity Claude"
    case codexPersonal = "Codex Pessoal"

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let rawValue = try container.decode(String.self)

        if rawValue == "Codex Peers" {
            self = .codexPersonal
            return
        }

        guard let value = AgentType(rawValue: rawValue) else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Unknown agent type: \(rawValue)"
            )
        }

        self = value
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(rawValue)
    }
}

struct ShellSession: Identifiable, Equatable, Codable {
    let id: UUID
    var title: String
    var colorHex: String
    var theme: TerminalTheme
    var isRunning: Bool
    var profileId: UUID
    var bypassMode: Bool
    var activeAgent: AgentType?
    var currentDirectory: String?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id, title, colorHex, theme, isRunning, profileId, environment, bypassMode, activeAgent, currentDirectory, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        colorHex = try c.decode(String.self, forKey: .colorHex)
        theme = try c.decode(TerminalTheme.self, forKey: .theme)
        isRunning = (try? c.decode(Bool.self, forKey: .isRunning)) ?? false
        bypassMode = (try? c.decode(Bool.self, forKey: .bypassMode)) ?? false
        activeAgent = try? c.decode(AgentType.self, forKey: .activeAgent)
        currentDirectory = try? c.decode(String.self, forKey: .currentDirectory)
        createdAt = (try? c.decode(Date.self, forKey: .createdAt)) ?? Date()

        // Migração: prefere profileId; se ausente, mapeia o antigo environment.
        if let pid = try? c.decode(UUID.self, forKey: .profileId) {
            profileId = pid
        } else if let env = try? c.decode(SessionEnvironment.self, forKey: .environment) {
            profileId = env.legacyProfileId
        } else {
            profileId = ShellProfile.personalDefaultId
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
        try c.encode(colorHex, forKey: .colorHex)
        try c.encode(theme, forKey: .theme)
        try c.encode(isRunning, forKey: .isRunning)
        try c.encode(profileId, forKey: .profileId)
        try c.encode(bypassMode, forKey: .bypassMode)
        try c.encodeIfPresent(activeAgent, forKey: .activeAgent)
        try c.encodeIfPresent(currentDirectory, forKey: .currentDirectory)
        try c.encode(createdAt, forKey: .createdAt)
    }

    var color: Color {
        theme.themeColor
    }

    var agentStartCommand: String? {
        guard let agent = activeAgent else { return nil }
        switch agent {
        case .claudePeers:
            return bypassMode ? "switch-claude peers && claude --dangerously-skip-permissions" : "switch-claude peers && claude"
        case .claudePersonal:
            return bypassMode ? "switch-claude personal && claude --dangerously-skip-permissions" : "switch-claude personal && claude"
        case .agyGemini:
            return bypassMode ? "switch-agy && agy --dangerously-skip-permissions" : "switch-agy && agy"
        case .agyClaude:
            return bypassMode ? "switch-agy && agy --model \"Claude Sonnet 4.6 (Thinking)\" --dangerously-skip-permissions" : "switch-agy && agy --model \"Claude Sonnet 4.6 (Thinking)\""
        case .codexPersonal:
            return bypassMode ? "switch-codex && codex --dangerously-bypass-approvals-and-sandbox" : "switch-codex && codex"
        }
    }
    func cleaningAgentSuffix(from originalTitle: String) -> String {
        var clean = originalTitle
        let suffixes = [
            " - Claude Peers",
            " - Claude Pessoal",
            " - Antigravity Gemini",
            " - Antigravity Claude",
            " - Codex Peers",
            " - Codex Pessoal",
            " - Antigravity",
            " - Codex"
        ]
        for suffix in suffixes {
            if clean.hasSuffix(suffix) {
                clean = String(clean.dropLast(suffix.count))
            }
        }
        return clean
    }

    init(id: UUID = UUID(), title: String = "Nova Sessão", colorHex: String? = nil, color: Color? = nil, theme: TerminalTheme = .basic, profileId: UUID = ShellProfile.personalDefaultId, bypassMode: Bool = false, activeAgent: AgentType? = nil, currentDirectory: String? = nil) {
        self.id = id
        self.title = title
        self.theme = theme
        self.colorHex = colorHex ?? NSColor(theme.themeColor).hexString
        self.isRunning = false
        self.profileId = profileId
        self.bypassMode = bypassMode
        self.activeAgent = activeAgent
        self.createdAt = Date()
        self.currentDirectory = currentDirectory
    }

    static func == (lhs: ShellSession, rhs: ShellSession) -> Bool {
        lhs.id == rhs.id &&
        lhs.title == rhs.title &&
        lhs.colorHex == rhs.colorHex &&
        lhs.theme == rhs.theme &&
        lhs.isRunning == rhs.isRunning &&
        lhs.profileId == rhs.profileId &&
        lhs.bypassMode == rhs.bypassMode &&
        lhs.activeAgent == rhs.activeAgent &&
        lhs.currentDirectory == rhs.currentDirectory
    }
}

enum LayoutMode: String, CaseIterable {
    case focus = "Foco"
    case horizontal = "Horizontal"
    case vertical = "Vertical"
    case grid = "Grade"

    var icon: String {
        switch self {
        case .focus: return "square"
        case .horizontal: return "rectangle.split.3x1"
        case .vertical: return "rectangle.split.1x3"
        case .grid: return "square.grid.2x2"
        }
    }
}

struct TerminalBookmark: Codable, Identifiable, Equatable {
    var id: UUID
    var title: String
    var workingDirectory: String
    var initialCommand: String
    var colorHex: String
    var themeRaw: String
    var profileId: UUID

    enum CodingKeys: String, CodingKey {
        case id, title, workingDirectory, initialCommand, colorHex, themeRaw, profileId, environment
    }

    init(id: UUID = UUID(), title: String, workingDirectory: String = "", initialCommand: String = "", colorHex: String = "#00E5FF", themeRaw: String = TerminalTheme.basic.rawValue, profileId: UUID = ShellProfile.personalDefaultId) {
        self.id = id
        self.title = title
        self.workingDirectory = workingDirectory
        self.initialCommand = initialCommand
        self.colorHex = colorHex
        self.themeRaw = themeRaw
        self.profileId = profileId
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        title = try c.decode(String.self, forKey: .title)
        workingDirectory = (try? c.decode(String.self, forKey: .workingDirectory)) ?? ""
        initialCommand = (try? c.decode(String.self, forKey: .initialCommand)) ?? ""
        colorHex = (try? c.decode(String.self, forKey: .colorHex)) ?? "#00E5FF"
        themeRaw = (try? c.decode(String.self, forKey: .themeRaw)) ?? TerminalTheme.basic.rawValue

        if let pid = try? c.decode(UUID.self, forKey: .profileId) {
            profileId = pid
        } else if let env = try? c.decode(SessionEnvironment.self, forKey: .environment) {
            profileId = env.legacyProfileId
        } else {
            profileId = ShellProfile.personalDefaultId
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(title, forKey: .title)
        try c.encode(workingDirectory, forKey: .workingDirectory)
        try c.encode(initialCommand, forKey: .initialCommand)
        try c.encode(colorHex, forKey: .colorHex)
        try c.encode(themeRaw, forKey: .themeRaw)
        try c.encode(profileId, forKey: .profileId)
    }
}

