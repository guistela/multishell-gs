import SwiftUI

@main
struct MultiShellApp: App {
    @StateObject private var sessionManager = SessionManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(sessionManager)
                .frame(minWidth: 800, minHeight: 600)
        }
        .commands {
            CommandGroup(after: .newItem) {
                Button("Nova Sessão") {
                    sessionManager.createSession()
                }
                .keyboardShortcut("t", modifiers: .command)
            }
            
            CommandMenu("Sessões") {
                ForEach(0..<9, id: \.self) { index in
                    Button(action: {
                        if index < sessionManager.sessions.count {
                            sessionManager.selectedSession = sessionManager.sessions[index].id
                        }
                    }) {
                        Text(index < sessionManager.sessions.count ? sessionManager.sessions[index].title : "Sessão \(index + 1)")
                    }
                    .keyboardShortcut(KeyEquivalent(Character(UnicodeScalar(49 + index)!)), modifiers: .command)
                    .disabled(index >= sessionManager.sessions.count)
                }
            }
        }

        Settings {
            SettingsView()
                .environmentObject(sessionManager)
        }
    }
}

