import SwiftUI
import AppKit

enum TerminalTheme: String, CaseIterable, Codable {
    case basic = "Basic"
    case pro = "Pro"
    case homebrew = "Homebrew"
    case ocean = "Ocean"
    case grass = "Grass"
    case redSands = "Red Sands"
    case manPage = "Man Page"
    case novel = "Novel"
    case silverAerogel = "Silver Aerogel"
    
    // Conformance ao Codable customizado para retrocompatibilidade
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        self = TerminalTheme.fromRawValueCompat(raw)
    }
    
    static func fromRawValueCompat(_ raw: String) -> TerminalTheme {
        switch raw {
        case "Básico (Preto)", "basic", "Igual à Sessão", "matchSession":
            return .basic
        case "classic", "Clássico (Azul)":
            return .ocean
        case "hacker", "Hacker (Verde)":
            return .homebrew
        case "solarized":
            return .novel
        default:
            return TerminalTheme(rawValue: raw) ?? .basic
        }
    }
    
    var backgroundColor: NSColor {
        switch self {
        case .basic:
            return .black
        case .pro:
            return NSColor(red: 0.12, green: 0.12, blue: 0.12, alpha: 1.0)
        case .homebrew:
            return .black
        case .ocean:
            return NSColor(red: 0.11, green: 0.32, blue: 0.64, alpha: 1.0)
        case .grass:
            return NSColor(red: 0.08, green: 0.23, blue: 0.12, alpha: 1.0)
        case .redSands:
            return NSColor(red: 0.36, green: 0.14, blue: 0.10, alpha: 1.0)
        case .manPage:
            return NSColor(red: 0.99, green: 0.96, blue: 0.73, alpha: 1.0)
        case .novel:
            return NSColor(red: 0.89, green: 0.87, blue: 0.79, alpha: 1.0)
        case .silverAerogel:
            return NSColor(red: 0.80, green: 0.80, blue: 0.80, alpha: 1.0)
        }
    }
    
    var foregroundColor: NSColor {
        switch self {
        case .basic:
            return .white
        case .pro:
            return NSColor(red: 0.95, green: 0.95, blue: 0.95, alpha: 1.0)
        case .homebrew:
            return .green
        case .ocean:
            return .white
        case .grass:
            return NSColor(red: 0.82, green: 0.95, blue: 0.85, alpha: 1.0)
        case .redSands:
            return NSColor(red: 0.91, green: 0.82, blue: 0.76, alpha: 1.0)
        case .manPage:
            return .black
        case .novel:
            return NSColor(red: 0.18, green: 0.12, blue: 0.09, alpha: 1.0)
        case .silverAerogel:
            return .black
        }
    }
    
    var themeColor: Color {
        switch self {
        case .basic:
            return .cyan
        case .pro:
            return .gray
        case .homebrew:
            return .green
        case .ocean:
            return Color(red: 0.1, green: 0.45, blue: 0.9)
        case .grass:
            return Color(red: 0.15, green: 0.65, blue: 0.25)
        case .redSands:
            return Color(red: 0.8, green: 0.25, blue: 0.15)
        case .manPage:
            return Color(red: 0.9, green: 0.75, blue: 0.1)
        case .novel:
            return Color(red: 0.75, green: 0.68, blue: 0.58)
        case .silverAerogel:
            return Color(red: 0.6, green: 0.6, blue: 0.65)
        }
    }
}
