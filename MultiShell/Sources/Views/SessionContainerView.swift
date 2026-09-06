import SwiftUI

struct SessionContainerView: View {
    @EnvironmentObject var sessionManager: SessionManager

    var body: some View {
        LayoutContainerView(sessions: sessionManager.filteredSessions)
    }
}

struct LayoutContainerView: View {
    let sessions: [ShellSession]
    @EnvironmentObject var sessionManager: SessionManager

    var body: some View {
        Group {
            switch sessionManager.layoutMode {
            case .focus:
                if let selectedId = sessionManager.selectedSession,
                   let session = sessions.first(where: { $0.id == selectedId }) {
                    SessionView(sessionId: session.id)
                        .id(session.id)
                } else if let firstSession = sessions.first {
                    SessionView(sessionId: firstSession.id)
                        .id(firstSession.id)
                } else {
                    Color.black
                }

            case .horizontal:
                HSplitView {
                    ForEach(sessions) { session in
                        SessionView(sessionId: session.id)
                            .id(session.id)
                            .frame(minWidth: 10, maxWidth: .infinity)
                    }
                }

            case .vertical:
                VSplitView {
                    ForEach(sessions) { session in
                        SessionView(sessionId: session.id)
                            .id(session.id)
                            .frame(minHeight: 10, maxHeight: .infinity)
                    }
                }

            case .grid:
                GridLayout(sessions: sessions)
            }
        }
    }
}

struct GridLayout: View {
    let sessions: [ShellSession]

    var body: some View {
        let count = sessions.count
        if count == 0 {
            Color.clear
        } else {
            let columns = Int(ceil(sqrt(Double(count))))
            let rows = Int(ceil(Double(count) / Double(columns)))
            
            VStack(spacing: 8) {
                ForEach(0..<rows, id: \.self) { rowIndex in
                    HStack(spacing: 8) {
                        ForEach(0..<columns, id: \.self) { columnIndex in
                            let index = rowIndex * columns + columnIndex
                            if index < count {
                                SessionView(sessionId: sessions[index].id)
                                    .id(sessions[index].id)
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                            } else {
                                Color.clear
                                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                            }
                        }
                    }
                    .frame(maxHeight: .infinity)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

