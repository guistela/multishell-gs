import Foundation
import SwiftUI
import AppKit

/// Uma variável de ambiente customizada, injetada nas sessões de um perfil.
struct EnvVariable: Codable, Equatable, Identifiable {
    var id: UUID
    var key: String
    var value: String

    init(id: UUID = UUID(), key: String = "", value: String = "") {
        self.id = id
        self.key = key
        self.value = value
    }
}

/// Um perfil isolado: cada perfil tem seu próprio HOME/config sob
/// ~/.multishell/profiles/<directoryName> e um conjunto de variáveis
/// de ambiente customizadas.
struct ShellProfile: Identifiable, Codable, Equatable {
    let id: UUID
    var name: String
    var colorHex: String
    /// Nome estável da pasta sob ~/.multishell/profiles/. Não muda ao renomear.
    let directoryName: String
    var customEnv: [EnvVariable]
    let createdAt: Date

    // IDs fixos para os dois perfis padrão, permitindo migrar dados antigos
    // que usavam o enum SessionEnvironment (personal/peers).
    static let personalDefaultId = UUID(uuidString: "00000000-0000-0000-0000-000000000001")!
    static let workDefaultId = UUID(uuidString: "00000000-0000-0000-0000-000000000002")!

    init(id: UUID = UUID(), name: String, colorHex: String = "#00E5FF", directoryName: String, customEnv: [EnvVariable] = []) {
        self.id = id
        self.name = name
        self.colorHex = colorHex
        self.directoryName = directoryName
        self.customEnv = customEnv
        self.createdAt = Date()
    }

    var color: Color {
        Color(NSColor(hex: colorHex) ?? .systemBlue)
    }

    /// Perfis padrão usando os mesmos diretórios de isolamento já existentes
    /// (personal/work), para preservar autenticações e configs já feitas.
    static func defaultProfiles() -> [ShellProfile] {
        [
            ShellProfile(id: personalDefaultId, name: "Pessoal", colorHex: "#FF6482", directoryName: "personal"),
            ShellProfile(id: workDefaultId, name: "Trabalho", colorHex: "#32ADE6", directoryName: "work")
        ]
    }

    /// Gera um nome de diretório seguro (apenas alfanumérico e hífen) a partir
    /// de um nome de perfil, garantindo unicidade contra os já existentes.
    static func makeDirectoryName(from name: String, existing: [String]) -> String {
        let lowered = name.lowercased().folding(options: .diacriticInsensitive, locale: .current)
        var slug = String(lowered.map { $0.isLetter || $0.isNumber ? $0 : "-" })
        while slug.contains("--") { slug = slug.replacingOccurrences(of: "--", with: "-") }
        slug = slug.trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        if slug.isEmpty { slug = "profile" }

        var candidate = slug
        var counter = 2
        while existing.contains(candidate) {
            candidate = "\(slug)-\(counter)"
            counter += 1
        }
        return candidate
    }
}
