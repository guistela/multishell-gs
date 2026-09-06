import SwiftUI

struct SessionView: View {
    let sessionId: UUID
    @EnvironmentObject var sessionManager: SessionManager
    @State private var isEditing = false

    var body: some View {
        if let session = sessionManager.sessions.first(where: { $0.id == sessionId }) {
            VStack(spacing: 0) {
                // Header
                SessionHeaderView(
                    session: session,
                    isEditing: $isEditing,
                    onDelete: {
                        sessionManager.deleteSession(session)
                    },
                    onClear: {
                        sessionManager.clearSession(session.id)
                    }
                )

                // Terminal real (SwiftTerm)
                if let terminalView = sessionManager.terminalViews[session.id] {
                    TerminalOutputView(terminalView: .constant(terminalView), theme: session.theme, onDirectoryChanged: { newDir in
                        if session.currentDirectory != newDir {
                            var updated = session
                            updated.currentDirectory = newDir
                            sessionManager.updateSession(updated)
                        }
                    })
                    .id(session.id)
                } else {
                    Color.black
                        .overlay(Text("Iniciando terminal...").foregroundColor(.white))
                }
            }
            .background(Color.black)
            .cornerRadius(10)
            .opacity(sessionManager.selectedSession == session.id ? 1.0 : 0.85)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(sessionManager.selectedSession == session.id ? session.color : Color.gray.opacity(0.3), lineWidth: sessionManager.selectedSession == session.id ? 2 : 1)
            )
            .shadow(color: sessionManager.selectedSession == session.id ? session.color.opacity(0.35) : Color.black.opacity(0.15), radius: sessionManager.selectedSession == session.id ? 10 : 4, x: 0, y: 4)
        } else {
            Color.clear
        }
    }
}

struct SessionHeaderView: View {
    let session: ShellSession
    @Binding var isEditing: Bool
    let onDelete: () -> Void
    let onClear: () -> Void
    @State private var editedTitle: String = ""
    @EnvironmentObject var sessionManager: SessionManager
    @FocusState private var titleIsFocused: Bool

    var body: some View {
        HStack {
            Image(systemName: "line.3.horizontal")
                .font(.caption)
                .foregroundColor(.secondary)
                .padding(.trailing, 4)
            
            if isEditing {
                TextField("Título", text: $editedTitle)
                    .textFieldStyle(.plain)
                    .font(.headline)
                    .focused($titleIsFocused)
                    .onSubmit {
                        saveTitle()
                    }
            } else {
                Text(session.title)
                    .font(.headline)
                    .onTapGesture(count: 2) {
                        startEditing()
                    }
            }

            Spacer()

            HStack(spacing: 12) {
                let isBookmarked = sessionManager.bookmarks.contains(where: { $0.title == session.title })
                Button(action: {
                    if isBookmarked {
                        if let bmk = sessionManager.bookmarks.first(where: { $0.title == session.title }) {
                            sessionManager.deleteBookmark(bmk)
                        }
                    } else {
                        sessionManager.addBookmark(
                            title: session.title,
                            workingDirectory: session.currentDirectory ?? NSHomeDirectory(),
                            initialCommand: "",
                            theme: session.theme,
                            profileId: session.profileId
                        )
                    }
                }) {
                    Image(systemName: isBookmarked ? "star.fill" : "star")
                        .foregroundColor(isBookmarked ? .yellow : .secondary)
                }
                .buttonStyle(.plain)
                .help(isBookmarked ? "Remover dos Favoritos" : "Salvar esta sessão como Favorito")

                // Toggle de Bypass / Autônomo (Sem Amarras)
                Button(action: {
                    var updatedSession = session
                    updatedSession.bypassMode.toggle()
                    sessionManager.updateSession(updatedSession)
                }) {
                    Image(systemName: session.bypassMode ? "bolt.fill" : "bolt")
                        .foregroundColor(session.bypassMode ? .orange : .secondary)
                }
                .buttonStyle(.plain)
                .help(session.bypassMode ? "Bypass / Autônomo Ativado (Sem Amarras)" : "Bypass / Autônomo Desativado (Modo Seguro)")

                Menu {
                    ForEach(TerminalTheme.allCases, id: \.self) { theme in
                        Button(action: {
                            var updatedSession = session
                            updatedSession.theme = theme
                            sessionManager.updateSession(updatedSession)
                        }) {
                            HStack {
                                Text(theme.rawValue)
                                if session.theme == theme {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    Image(systemName: "paintbrush")
                        .foregroundColor(.secondary)
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .help("Alterar Tema do Terminal")

                // Dropdown de Perfil (ambiente isolado)
                Menu {
                    ForEach(sessionManager.profiles) { profile in
                        Button(action: {
                            var updatedSession = session
                            updatedSession.profileId = profile.id
                            sessionManager.updateSession(updatedSession)
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
                } label: {
                    let profileColor = sessionManager.profile(for: session.profileId)?.color ?? .secondary
                    Image(systemName: "person.crop.circle")
                        .foregroundColor(profileColor)
                }
                .menuStyle(.borderlessButton)
                .fixedSize()
                .help("Alternar Perfil (ambiente isolado)")

                // Dropdown de Agentes de IA
                HStack(spacing: 6) {
                    Menu {
                        Button(action: {
                            var updated = session
                            updated.activeAgent = .claudePeers
                            let baseTitle = session.cleaningAgentSuffix(from: session.title)
                            updated.title = "\(baseTitle) - Claude Peers"
                            sessionManager.updateSession(updated)
                            let cmd = session.bypassMode ? "switch-claude peers && claude --dangerously-skip-permissions" : "switch-claude peers && claude"
                            sessionManager.sendLine(to: session.id, command: cmd)
                        }) {
                            Text("🤖 Claude Peers (Empresa)")
                        }

                        Button(action: {
                            var updated = session
                            updated.activeAgent = .claudePersonal
                            let baseTitle = session.cleaningAgentSuffix(from: session.title)
                            updated.title = "\(baseTitle) - Claude Pessoal"
                            sessionManager.updateSession(updated)
                            let cmd = session.bypassMode ? "switch-claude personal && claude --dangerously-skip-permissions" : "switch-claude personal && claude"
                            sessionManager.sendLine(to: session.id, command: cmd)
                        }) {
                            Text("🤖 Claude Pessoal")
                        }

                        Button(action: {
                            var updated = session
                            updated.activeAgent = .agyGemini
                            let baseTitle = session.cleaningAgentSuffix(from: session.title)
                            updated.title = "\(baseTitle) - Antigravity Gemini"
                            sessionManager.updateSession(updated)
                            let cmd = session.bypassMode ? "switch-agy && agy --dangerously-skip-permissions" : "switch-agy && agy"
                            sessionManager.sendLine(to: session.id, command: cmd)
                        }) {
                            Text("🤖 Antigravity Gemini")
                        }

                        Button(action: {
                            var updated = session
                            updated.activeAgent = .agyClaude
                            let baseTitle = session.cleaningAgentSuffix(from: session.title)
                            updated.title = "\(baseTitle) - Antigravity Claude"
                            sessionManager.updateSession(updated)
                            let cmd = session.bypassMode ? "switch-agy && agy --model \"Claude Sonnet 4.6 (Thinking)\" --dangerously-skip-permissions" : "switch-agy && agy --model \"Claude Sonnet 4.6 (Thinking)\""
                            sessionManager.sendLine(to: session.id, command: cmd)
                        }) {
                            Text("🤖 Antigravity Claude")
                        }

                        Button(action: {
                            var updated = session
                            updated.activeAgent = .codexPersonal
                            let baseTitle = session.cleaningAgentSuffix(from: session.title)
                            updated.title = "\(baseTitle) - Codex Pessoal"
                            sessionManager.updateSession(updated)
                            let cmd = session.bypassMode ? "switch-codex && codex --dangerously-bypass-approvals-and-sandbox" : "switch-codex && codex"
                            sessionManager.sendLine(to: session.id, command: cmd)
                        }) {
                            Text("🤖 Codex Pessoal")
                        }
                        
                        Divider()
                        
                        Button(action: {
                            var updated = session
                            updated.activeAgent = nil
                            let baseTitle = session.cleaningAgentSuffix(from: session.title)
                            updated.title = baseTitle
                            sessionManager.updateSession(updated)
                        }) {
                            Text("⏹️ Nenhum (Desativar Monitor)")
                        }
                    } label: {
                        Image(systemName: "cpu")
                            .foregroundColor(session.activeAgent != nil ? .green : .secondary)
                    }
                    .menuStyle(.borderlessButton)
                    .fixedSize()
                    .help("Iniciar Agente de IA")
                }



                Button(action: onClear) {
                    Image(systemName: "trash")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .help("Limpar Terminal")

                Button(action: onDelete) {
                    Image(systemName: "xmark")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
                .help("Fechar Sessão")
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.thinMaterial)
        .contentShape(Rectangle())
        .onTapGesture {
            if sessionManager.selectedSession != session.id {
                sessionManager.selectedSession = session.id
            }
        }
    }

    private func startEditing() {
        editedTitle = session.title
        isEditing = true
        titleIsFocused = true
    }

    private func saveTitle() {
        if !editedTitle.isEmpty {
            var updatedSession = session
            updatedSession.title = editedTitle
            sessionManager.updateSession(updatedSession)
        }
        isEditing = false
    }
}

