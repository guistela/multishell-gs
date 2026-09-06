import SwiftUI

struct SessionListView: View {
    @EnvironmentObject var sessionManager: SessionManager

    var body: some View {
        VStack(spacing: 0) {
            List(selection: $sessionManager.selectedSession) {
                Section("Favoritos (Acesso Rápido)") {
                    ForEach(sessionManager.filteredBookmarks) { bookmark in
                        Button(action: {
                            sessionManager.createSession(from: bookmark)
                        }) {
                            HStack(spacing: 8) {
                                Image(systemName: "star.fill")
                                    .font(.caption)
                                    .foregroundColor(Color(NSColor(hex: bookmark.colorHex) ?? .yellow))
                                
                                Text(bookmark.title)
                                    .font(.body)
                                    .foregroundColor(.primary)
                                
                                Spacer()
                                
                                Image(systemName: "plus.circle")
                                    .foregroundColor(.secondary)
                            }
                            .contentShape(Rectangle())
                            .padding(.vertical, 2)
                        }
                        .buttonStyle(.plain)
                        .help("Abrir novo terminal a partir deste favorito")
                        .contextMenu {
                            Button(role: .destructive, action: {
                                sessionManager.deleteBookmark(bookmark)
                            }) {
                                Label("Excluir Favorito", systemImage: "trash")
                            }
                        }
                    }
                }
                
                if sessionManager.profileFilter == nil {
                    ForEach(sessionManager.sessionsByProfile, id: \.profile.id) { group in
                        Section {
                            ForEach(group.sessions) { session in
                                SessionListItem(session: session)
                                    .tag(session.id)
                            }
                        } header: {
                            HStack(spacing: 6) {
                                Circle()
                                    .fill(group.profile.color)
                                    .frame(width: 8, height: 8)
                                Text("Sessões — \(group.profile.name)")
                            }
                        }
                    }
                } else {
                    let name = sessionManager.profile(for: sessionManager.profileFilter!)?.name ?? "Perfil"
                    Section("Sessões — \(name)") {
                        ForEach(sessionManager.filteredSessions) { session in
                            SessionListItem(session: session)
                                .tag(session.id)
                        }
                    }
                }
            }
            .listStyle(.sidebar)

            Divider()

            HStack {
                Button(action: { sessionManager.createSession() }) {
                    Label("Nova Sessão", systemImage: "plus")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                
                Button(action: { sessionManager.openLogsDirectory() }) {
                    Image(systemName: "folder.badge.gearshape")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .help("Mostrar diretório de logs no Finder")
            }
            .padding(12)
        }
    }

}

struct SessionListItem: View {
    let session: ShellSession
    @EnvironmentObject var sessionManager: SessionManager
    @State private var showingRenameAlert = false
    @State private var newName = ""

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(session.color)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 2) {
                Text(session.title)
                    .font(.body)
                
                Text(session.isRunning ? "Ativo" : "Inativo")
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
        .contextMenu {
            Button(action: {
                newName = session.title
                showingRenameAlert = true
            }) {
                Label("Renomear...", systemImage: "pencil")
            }
            
            Menu("Estilo de Terminal") {
                ForEach(TerminalTheme.allCases, id: \.self) { theme in
                    Button(action: {
                        var updated = session
                        updated.theme = theme
                        sessionManager.updateSession(updated)
                    }) {
                        HStack {
                            Text(theme.rawValue)
                            if session.theme == theme {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            }

            Menu("Alternar Perfil") {
                ForEach(sessionManager.profiles) { profile in
                    Button(action: {
                        var updated = session
                        updated.profileId = profile.id
                        sessionManager.updateSession(updated)
                        sessionManager.applyProfile(to: session.id, profile: profile)
                    }) {
                        HStack {
                            Text(profile.name)
                            if session.profileId == profile.id {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                }
            }
            
            Button(action: {
                sessionManager.openLogFile(for: session.id)
            }) {
                Label("Abrir Arquivo de Log...", systemImage: "doc.text")
            }

            Divider()
            
            Button(role: .destructive, action: {
                sessionManager.deleteSession(session)
            }) {
                Label("Fechar Sessão", systemImage: "trash")
            }
        }
        .alert("Renomear Sessão", isPresented: $showingRenameAlert) {
            TextField("Novo Nome", text: $newName)
            Button("Cancelar", role: .cancel) { }
            Button("Salvar") {
                if !newName.isEmpty {
                    var updated = session
                    updated.title = newName
                    sessionManager.updateSession(updated)
                }
            }
        } message: {
            Text("Digite o novo nome para a sessão:")
        }
    }
}

