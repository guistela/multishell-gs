import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var sessionManager: SessionManager
    @AppStorage("defaultShell") private var defaultShell = "/bin/zsh"
    @AppStorage("defaultPath") private var defaultPath = NSHomeDirectory()
    @AppStorage("fontSize") private var fontSize = 12.0
    @AppStorage("fontFamily") private var fontFamily = "SF Mono"

    var body: some View {
        TabView {
            GeneralSettingsView()
                .tabItem {
                    Label("Geral", systemImage: "gearshape")
                }

            ProfilesSettingsView()
                .tabItem {
                    Label("Perfis & Sessões", systemImage: "person.2.gearshape")
                }

            AppearanceSettingsView(fontSize: $fontSize, fontFamily: $fontFamily)
                .tabItem {
                    Label("Aparência", systemImage: "paintbrush")
                }

            ShellSettingsView(defaultShell: $defaultShell, defaultPath: $defaultPath)
                .tabItem {
                    Label("Shell", systemImage: "terminal")
                }
                
            BookmarkSettingsView()
                .tabItem {
                    Label("Favoritos", systemImage: "star")
                }
        }
        .frame(width: 600, height: 450)
    }
}

struct GeneralSettingsView: View {
    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "Desconhecida"
    }

    private var buildNumber: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "Desconhecido"
    }

    var body: some View {
        Form {
            Section {
                Text("MultiShell")
                    .font(.title)
                    .fontWeight(.bold)

                Text("Gerenciador de sessões de terminal para macOS")
                    .foregroundColor(.secondary)

                Divider()

                LabeledContent("Versão", value: appVersion)
                LabeledContent("Build", value: buildNumber)
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}

struct AppearanceSettingsView: View {
    @Binding var fontSize: Double
    @Binding var fontFamily: String
    @AppStorage("terminalTheme") private var terminalTheme = TerminalTheme.basic.rawValue

    let availableFonts = ["SF Mono", "Menlo", "Monaco", "Courier", "JetBrains Mono"]

    var body: some View {
        Form {
            Section("Estilo do Terminal") {
                Picker("Tema", selection: $terminalTheme) {
                    ForEach(TerminalTheme.allCases, id: \.self) { theme in
                        Text(theme.rawValue).tag(theme.rawValue)
                    }
                }
            }

            Section("Fonte") {
                Picker("Família", selection: $fontFamily) {
                    ForEach(availableFonts, id: \.self) { font in
                        Text(font).tag(font)
                    }
                }

                HStack {
                    Slider(value: $fontSize, in: 8...24, step: 1)
                    Text("\(Int(fontSize))pt")
                        .frame(width: 40)
                }
            }

            Section("Pré-visualização") {
                VStack(alignment: .leading, spacing: 4) {
                    Text("user@macbook:~$ ls -la")
                    Text("total 0")
                    Text("drwxr-xr-x   3 user  staff    96 Feb 11 12:00 .")
                    Text("drwxr-xr-x  10 user  staff   320 Feb 11 12:00 ..")
                }
                .font(.custom(fontFamily, size: fontSize))
                .padding()
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(TerminalTheme(rawValue: terminalTheme)?.backgroundColor ?? .black))
                .foregroundColor(Color(TerminalTheme(rawValue: terminalTheme)?.foregroundColor ?? .white))
                .cornerRadius(4)
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}

struct ShellSettingsView: View {
    @Binding var defaultShell: String
    @Binding var defaultPath: String

    let availableShells = [
        "/bin/bash",
        "/bin/zsh",
        "/usr/local/bin/fish",
        "/opt/homebrew/bin/fish"
    ]

    var body: some View {
        Form {
            Section("Configurações do Shell") {
                Picker("Shell", selection: $defaultShell) {
                    ForEach(availableShells, id: \.self) { shell in
                        Text(shell).tag(shell)
                    }
                }

                Text("Define qual shell será usado ao criar novas sessões")
                    .foregroundColor(.secondary)
                    .font(.caption)
                
                TextField("Diretório Inicial", text: $defaultPath)
                
                Text("Caminho padrão para novas sessões. Deixe vazio para usar a Home.")
                    .foregroundColor(.secondary)
                    .font(.caption)
            }

            Section("Informações") {
                LabeledContent("Shell Atual do Sistema") {
                    Text(ProcessInfo.processInfo.environment["SHELL"] ?? "Desconhecido")
                        .foregroundColor(.secondary)
                }

                LabeledContent("Terminal") {
                    Text("TERM=xterm-256color")
                        .foregroundColor(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }
}

struct BookmarkSettingsView: View {
    @EnvironmentObject var sessionManager: SessionManager
    @State private var selectedBookmarkId: UUID?

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                List(selection: $selectedBookmarkId) {
                    ForEach(sessionManager.bookmarks) { bookmark in
                        HStack {
                            Circle()
                                .fill(Color(NSColor(hex: bookmark.colorHex) ?? .blue))
                                .frame(width: 8, height: 8)
                            Text(bookmark.title)
                        }
                        .tag(bookmark.id)
                    }
                    .onDelete { indices in
                        indices.forEach { index in
                            sessionManager.deleteBookmark(sessionManager.bookmarks[index])
                        }
                    }
                }
                .listStyle(.sidebar)
                
                Divider()
                
                Button(action: {
                    sessionManager.addBookmark(
                        title: "Novo Favorito",
                        workingDirectory: NSHomeDirectory(),
                        initialCommand: "",
                        theme: .basic
                    )
                    selectedBookmarkId = sessionManager.bookmarks.last?.id
                }) {
                    Label("Novo Favorito", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                        .padding(6)
                }
                .buttonStyle(.plain)
                .padding(6)
            }
            .navigationSplitViewColumnWidth(min: 150, ideal: 180, max: 220)
        } detail: {
            if let selectedId = selectedBookmarkId,
               let index = sessionManager.bookmarks.firstIndex(where: { $0.id == selectedId }) {
                BookmarkEditorView(bookmark: $sessionManager.bookmarks[index])
            } else {
                Text("Selecione um favorito para editar")
                    .foregroundColor(.secondary)
            }
        }
    }
}

struct BookmarkEditorView: View {
    @Binding var bookmark: TerminalBookmark
    @EnvironmentObject var sessionManager: SessionManager

    var body: some View {
        Form {
            Section("Configurações do Favorito") {
                TextField("Nome", text: $bookmark.title)
                TextField("Diretório Inicial", text: $bookmark.workingDirectory)
                TextField("Comando Inicial", text: $bookmark.initialCommand)
                
                Picker("Estilo de Terminal", selection: $bookmark.themeRaw) {
                    ForEach(TerminalTheme.allCases, id: \.self) { theme in
                        Text(theme.rawValue).tag(theme.rawValue)
                    }
                }

                Picker("Perfil", selection: $bookmark.profileId) {
                    ForEach(sessionManager.profiles) { profile in
                        Text(profile.name).tag(profile.id)
                    }
                }
            }
        }
        .onChange(of: bookmark.themeRaw) { newValue in
            let theme = TerminalTheme.fromRawValueCompat(newValue)
            bookmark.colorHex = NSColor(theme.themeColor).hexString
        }
        .formStyle(.grouped)
        .padding()
        .onChange(of: bookmark) { _ in
            sessionManager.saveBookmarks()
        }
    }
}

// MARK: - Perfis & Sessões (painel unificado)

enum ProfileSidebarSelection: Hashable {
    case profile(UUID)
    case session(UUID)
}

struct ProfilesSettingsView: View {
    @EnvironmentObject var sessionManager: SessionManager
    @State private var selection: ProfileSidebarSelection?

    var body: some View {
        NavigationSplitView {
            VStack(spacing: 0) {
                List(selection: $selection) {
                    Section("Perfis") {
                        ForEach(sessionManager.profiles) { profile in
                            HStack(spacing: 8) {
                                Circle()
                                    .fill(profile.color)
                                    .frame(width: 9, height: 9)
                                Text(profile.name)
                                Spacer()
                                let count = sessionManager.sessions.filter { $0.profileId == profile.id }.count
                                if count > 0 {
                                    Text("\(count)")
                                        .font(.caption2)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .tag(ProfileSidebarSelection.profile(profile.id))
                        }
                    }

                    Section("Sessões Ativas") {
                        if sessionManager.sessions.isEmpty {
                            Text("Nenhuma sessão aberta")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                        ForEach(sessionManager.sessions) { session in
                            HStack(spacing: 8) {
                                Circle()
                                    .fill(sessionManager.resolvedProfile(for: session).color)
                                    .frame(width: 8, height: 8)
                                Text(session.title)
                                    .lineLimit(1)
                            }
                            .tag(ProfileSidebarSelection.session(session.id))
                        }
                    }
                }
                .listStyle(.sidebar)

                Divider()

                Button(action: {
                    let novo = sessionManager.addProfile(name: "Novo Perfil")
                    selection = .profile(novo.id)
                }) {
                    Label("Novo Perfil", systemImage: "plus")
                        .frame(maxWidth: .infinity)
                        .padding(6)
                }
                .buttonStyle(.plain)
                .padding(6)
            }
            .navigationSplitViewColumnWidth(min: 170, ideal: 200, max: 260)
        } detail: {
            switch selection {
            case .profile(let id):
                if let index = sessionManager.profiles.firstIndex(where: { $0.id == id }) {
                    ProfileEditorView(profile: $sessionManager.profiles[index])
                } else {
                    placeholder
                }
            case .session(let id):
                if let session = sessionManager.sessions.first(where: { $0.id == id }) {
                    SessionQuickEditorView(session: session)
                } else {
                    placeholder
                }
            case .none:
                placeholder
            }
        }
    }

    private var placeholder: some View {
        Text("Selecione um perfil ou sessão")
            .foregroundColor(.secondary)
    }
}

struct ProfileEditorView: View {
    @Binding var profile: ShellProfile
    @EnvironmentObject var sessionManager: SessionManager

    private var colorBinding: Binding<Color> {
        Binding(
            get: { profile.color },
            set: { newColor in
                profile.colorHex = NSColor(newColor).hexString
            }
        )
    }

    private var canDelete: Bool { sessionManager.profiles.count > 1 }

    var body: some View {
        Form {
            Section("Perfil") {
                TextField("Nome", text: $profile.name)
                ColorPicker("Cor", selection: colorBinding, supportsOpacity: false)
                LabeledContent("Diretório isolado") {
                    Text("~/.multishell/profiles/\(profile.directoryName)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .textSelection(.enabled)
                }
            }

            Section("Variáveis de Ambiente") {
                if profile.customEnv.isEmpty {
                    Text("Nenhuma variável customizada. Elas são exportadas em toda sessão deste perfil.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                ForEach($profile.customEnv) { $variable in
                    HStack(spacing: 6) {
                        TextField("CHAVE", text: $variable.key)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 150)
                            .autocorrectionDisabled()
                        Text("=")
                            .foregroundColor(.secondary)
                        TextField("valor", text: $variable.value)
                            .textFieldStyle(.roundedBorder)
                            .autocorrectionDisabled()
                        Button(action: {
                            profile.customEnv.removeAll { $0.id == variable.id }
                        }) {
                            Image(systemName: "minus.circle.fill")
                                .foregroundColor(.red)
                        }
                        .buttonStyle(.plain)
                    }
                }

                Button(action: {
                    profile.customEnv.append(EnvVariable())
                }) {
                    Label("Adicionar Variável", systemImage: "plus")
                }
                .buttonStyle(.plain)
            }

            Section {
                Button(role: .destructive, action: {
                    sessionManager.deleteProfile(profile)
                }) {
                    Label("Excluir Perfil", systemImage: "trash")
                }
                .disabled(!canDelete)
                if !canDelete {
                    Text("Não é possível excluir o último perfil.")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .padding()
        .onChange(of: profile) { _ in
            sessionManager.saveProfiles()
        }
    }
}

struct SessionQuickEditorView: View {
    let session: ShellSession
    @EnvironmentObject var sessionManager: SessionManager
    @State private var title: String = ""

    var body: some View {
        Form {
            Section("Sessão") {
                TextField("Título", text: $title)
                    .onSubmit(saveTitle)
                    .onAppear { title = session.title }

                Picker("Perfil", selection: Binding(
                    get: { session.profileId },
                    set: { newId in
                        var updated = session
                        updated.profileId = newId
                        sessionManager.updateSession(updated)
                        if let profile = sessionManager.profile(for: newId) {
                            sessionManager.applyProfile(to: session.id, profile: profile)
                        }
                    }
                )) {
                    ForEach(sessionManager.profiles) { profile in
                        Text(profile.name).tag(profile.id)
                    }
                }

                Picker("Tema", selection: Binding(
                    get: { session.theme },
                    set: { newTheme in
                        var updated = session
                        updated.theme = newTheme
                        sessionManager.updateSession(updated)
                    }
                )) {
                    ForEach(TerminalTheme.allCases, id: \.self) { theme in
                        Text(theme.rawValue).tag(theme)
                    }
                }

                LabeledContent("Status", value: session.isRunning ? "Ativo" : "Inativo")
            }

            Section {
                Button("Salvar Título", action: saveTitle)
                Button(role: .destructive, action: {
                    sessionManager.deleteSession(session)
                }) {
                    Label("Fechar Sessão", systemImage: "xmark.circle")
                }
            }
        }
        .formStyle(.grouped)
        .padding()
        .id(session.id)
    }

    private func saveTitle() {
        guard !title.isEmpty else { return }
        var updated = session
        updated.title = title
        sessionManager.updateSession(updated)
    }
}
