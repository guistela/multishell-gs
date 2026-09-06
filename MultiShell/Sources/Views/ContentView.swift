import SwiftUI

struct ContentView: View {
    @EnvironmentObject var sessionManager: SessionManager
    @State private var columnVisibility: NavigationSplitViewVisibility = .all

    var body: some View {
        NavigationSplitView(columnVisibility: $columnVisibility) {
            // Sidebar com lista de sessões
            SessionListView()
                .navigationSplitViewColumnWidth(min: 200, ideal: 250, max: 300)
        } detail: {
            // Área principal com as sessões
            if sessionManager.filteredSessions.isEmpty {
                EmptyStateView()
            } else {
                SessionContainerView()
                    .padding(8)
                    .background(Color(nsColor: .windowBackgroundColor))
            }
        }
        .toolbar {
            // Filtro de visão por perfil
            ToolbarItem(placement: .principal) {
                Menu {
                    Button(action: { sessionManager.profileFilter = nil }) {
                        HStack {
                            Text("Todos os perfis")
                            if sessionManager.profileFilter == nil {
                                Image(systemName: "checkmark")
                            }
                        }
                    }
                    Divider()
                    ForEach(sessionManager.profiles) { profile in
                        Button(action: { sessionManager.profileFilter = profile.id }) {
                            HStack {
                                Text(profile.name)
                                if sessionManager.profileFilter == profile.id {
                                    Image(systemName: "checkmark")
                                }
                            }
                        }
                    }
                } label: {
                    let current = sessionManager.profileFilter.flatMap { sessionManager.profile(for: $0) }
                    HStack(spacing: 6) {
                        Circle()
                            .fill(current?.color ?? .secondary)
                            .frame(width: 8, height: 8)
                        Text(current?.name ?? "Todos os perfis")
                    }
                }
                .frame(minWidth: 160)
            }

            ToolbarItem(placement: .primaryAction) {
                Menu {
                    ForEach(LayoutMode.allCases, id: \.self) { mode in
                        Button(action: { sessionManager.layoutMode = mode }) {
                            Label(mode.rawValue, systemImage: mode.icon)
                        }
                    }
                } label: {
                    Image(systemName: sessionManager.layoutMode.icon)
                }
            }

            ToolbarItem(placement: .primaryAction) {
                Button(action: { sessionManager.createSession() }) {
                    Image(systemName: "plus")
                }
                .help("Nova Sessão (⌘T)")
            }
        }
        .background(
            Group {
                Button(action: {
                    if let selected = sessionManager.selectedSession,
                       let session = sessionManager.sessions.first(where: { $0.id == selected }) {
                        sessionManager.deleteSession(session)
                    }
                }) {
                    EmptyView()
                }
                .keyboardShortcut("w", modifiers: .command)

                Button(action: selectPreviousSession) {
                    EmptyView()
                }
                .keyboardShortcut("[", modifiers: .command)

                Button(action: selectNextSession) {
                    EmptyView()
                }
                .keyboardShortcut("]", modifiers: .command)
            }
            .frame(width: 0, height: 0)
            .opacity(0)
        )
    }

    private func selectPreviousSession() {
        let active = sessionManager.filteredSessions
        guard !active.isEmpty else { return }
        if let selected = sessionManager.selectedSession,
           let index = active.firstIndex(where: { $0.id == selected }) {
            let prevIndex = (index - 1 + active.count) % active.count
            sessionManager.selectedSession = active[prevIndex].id
        } else {
            sessionManager.selectedSession = active.first?.id
        }
    }

    private func selectNextSession() {
        let active = sessionManager.filteredSessions
        guard !active.isEmpty else { return }
        if let selected = sessionManager.selectedSession,
           let index = active.firstIndex(where: { $0.id == selected }) {
            let nextIndex = (index + 1) % active.count
            sessionManager.selectedSession = active[nextIndex].id
        } else {
            sessionManager.selectedSession = active.first?.id
        }
    }
}

struct EmptyStateView: View {
    @EnvironmentObject var sessionManager: SessionManager

    var body: some View {
        VStack(spacing: 24) {
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Color.blue.opacity(0.15), Color.purple.opacity(0.1)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 120, height: 120)
                
                Image(systemName: "terminal.fill")
                    .font(.system(size: 50))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [.primary, .secondary],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
            }

            VStack(spacing: 8) {
                Text("Multishell")
                    .font(.title)
                    .fontWeight(.bold)
                
                Text(sessionManager.profileFilter == nil
                     ? "Crie uma nova sessão para começar"
                     : "Crie uma nova sessão no perfil \(sessionManager.profile(for: sessionManager.profileFilter!)?.name ?? "") para começar")
                    .font(.body)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: 320)
            }

            Button(action: {
                sessionManager.createSession()
            }) {
                HStack {
                    Image(systemName: "plus")
                    Text("Nova Sessão")
                }
                .font(.headline)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Color.blue)
                )
                .foregroundColor(.white)
            }
            .buttonStyle(.plain)
            .keyboardShortcut("t", modifiers: .command)
            
            // Guia rápido de atalhos (UX)
            VStack(alignment: .leading, spacing: 6) {
                Text("Guia de Atalhos:")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundColor(.secondary)
                    .padding(.bottom, 2)
                
                HStack(spacing: 16) {
                    ShortcutBadge(keys: "⌘T", desc: "Novo terminal")
                    ShortcutBadge(keys: "⌘W", desc: "Fechar terminal")
                    ShortcutBadge(keys: "⌘[ / ⌘]", desc: "Mudar terminal")
                }
            }
            .padding(.top, 20)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            Color(nsColor: .windowBackgroundColor)
                .overlay(
                    RadialGradient(
                        colors: [Color.blue.opacity(0.04), Color.clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 300
                    )
                )
        )
    }
}

struct ShortcutBadge: View {
    let keys: String
    let desc: String
    
    var body: some View {
        HStack(spacing: 6) {
            Text(keys)
                .font(.system(.caption, design: .monospaced))
                .fontWeight(.bold)
                .padding(.horizontal, 5)
                .padding(.vertical, 2)
                .background(
                    RoundedRectangle(cornerRadius: 4)
                        .fill(Color.secondary.opacity(0.2))
                )
            
            Text(desc)
                .font(.caption2)
                .foregroundColor(.secondary)
        }
    }
}

