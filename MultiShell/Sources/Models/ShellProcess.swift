import Foundation
import Darwin
import PTYHelper

// Helper para logging em arquivo
func logToFile(_ message: String) {
    let logPath = "/tmp/multishell_debug.log"
    let timestamp = DateFormatter.localizedString(from: Date(), dateStyle: .none, timeStyle: .medium)
    let line = "[\(timestamp)] \(message)\n"

    if let data = line.data(using: .utf8) {
        if let fileHandle = FileHandle(forWritingAtPath: logPath) {
            fileHandle.seekToEndOfFile()
            fileHandle.write(data)
            fileHandle.closeFile()
        } else {
            try? data.write(to: URL(fileURLWithPath: logPath))
        }
    }
}

class ShellProcess {
    let sessionId: UUID
    private let shellPath: String
    private let workingDirectory: String?
    private let environment: [String: String]
    private var masterFd: Int32 = -1
    private var childPid: pid_t = -1
    private var readSource: DispatchSourceRead?

    private var pendingData = Data()
    private let pendingDataQueue = DispatchQueue(label: "com.multishell.pending.\(UUID().uuidString)")
    private var isDispatchScheduled = false
    private let writeQueue: DispatchQueue
    private var logFileHandle: FileHandle?
    let logURL: URL

    var onDataReceived: ((Data) -> Void)?
    var onStatusChange: ((Bool) -> Void)?

    init(sessionId: UUID, shellPath: String, workingDirectory: String? = nil, environment: [String: String] = [:]) {
        self.sessionId = sessionId
        self.shellPath = shellPath
        self.workingDirectory = workingDirectory
        self.environment = environment
        self.writeQueue = DispatchQueue(label: "com.multishell.write.\(sessionId.uuidString)")
        
        // Configura diretório e arquivo de logs
        let logsDir = URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent(".multishell", isDirectory: true)
            .appendingPathComponent("logs", isDirectory: true)
        try? FileManager.default.createDirectory(at: logsDir, withIntermediateDirectories: true)
        let logURL = logsDir.appendingPathComponent("session_\(sessionId.uuidString).log")
        self.logURL = logURL
        
        if !FileManager.default.fileExists(atPath: logURL.path) {
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
        }
        self.logFileHandle = try? FileHandle(forWritingTo: logURL)
        self.logFileHandle?.seekToEndOfFile()
    }

    func start() {
        var master: Int32 = -1
        var slave: Int32 = -1
        var name = [CChar](repeating: 0, count: 1024)

        guard openpty(&master, &slave, &name, nil, nil) == 0 else {
            onStatusChange?(false)
            return
        }

        self.masterFd = master
        setupReadSource()
        spawnShellWithHelper(slaveFd: slave)
    }

    private func spawnShellWithHelper(slaveFd: Int32) {
        let environmentBlock = environment
            .sorted { $0.key < $1.key }
            .map { "\($0.key)=\($0.value)" }
            .joined(separator: "\n")

        let pid = shellPath.withCString { path in
            let spawn: (UnsafePointer<CChar>?) -> pid_t = { env in
                if let workingDir = self.workingDirectory {
                    return workingDir.withCString { dir in
                        pty_spawn_shell(self.masterFd, slaveFd, path, dir, env)
                    }
                } else {
                    return pty_spawn_shell(self.masterFd, slaveFd, path, nil, env)
                }
            }

            if environmentBlock.isEmpty {
                return spawn(nil)
            } else {
                return environmentBlock.withCString { env in
                    spawn(env)
                }
            }
        }

        close(slaveFd)

        if pid > 0 {
            self.childPid = pid
            onStatusChange?(true)
            monitorProcess(pid: pid)
        } else {
            cleanup()
            onStatusChange?(false)
        }
    }

    private func monitorProcess(pid: pid_t) {
        DispatchQueue.global(qos: .background).async { [weak self] in
            var status: Int32 = 0
            waitpid(pid, &status, 0)

            DispatchQueue.main.async {
                self?.onStatusChange?(false)
                self?.cleanup()
            }
        }
    }

    private func setupReadSource() {
        let queue = DispatchQueue(label: "com.multishell.read.\(sessionId.uuidString)")
        readSource = DispatchSource.makeReadSource(fileDescriptor: masterFd, queue: queue)

        readSource?.setEventHandler { [weak self] in
            guard let self = self else { return }

            var buffer = [UInt8](repeating: 0, count: 8192)
            let bytesRead = Darwin.read(self.masterFd, &buffer, buffer.count)

            if bytesRead > 0 {
                let data = Data(buffer[..<bytesRead])
                self.bufferAndSchedule(data)
                self.writeToSessionLog(data)
            } else if bytesRead <= 0 {
                DispatchQueue.main.async {
                    self.onStatusChange?(false)
                    self.cleanup()
                }
            }
        }

        readSource?.resume()
    }

    private func writeToSessionLog(_ data: Data) {
        guard let handle = logFileHandle else { return }
        pendingDataQueue.async {
            try? handle.write(contentsOf: data)
        }
    }

    private func bufferAndSchedule(_ data: Data) {
        pendingDataQueue.async { [weak self] in
            guard let self = self else { return }
            self.pendingData.append(data)
            
            if !self.isDispatchScheduled {
                self.isDispatchScheduled = true
                DispatchQueue.global(qos: .userInteractive).asyncAfter(deadline: .now() + 0.016) { [weak self] in
                    self?.flushPendingData()
                }
            }
        }
    }
    
    private func flushPendingData() {
        pendingDataQueue.async { [weak self] in
            guard let self = self else { return }
            let dataToDispatch = self.pendingData
            self.pendingData = Data()
            self.isDispatchScheduled = false
            
            if !dataToDispatch.isEmpty {
                self.onDataReceived?(dataToDispatch)
            }
        }
    }

    func writeData(_ data: Data) {
        guard masterFd >= 0 else { return }

        writeQueue.async { [weak self] in
            guard let self = self, self.masterFd >= 0 else { return }
            
            data.withUnsafeBytes { buffer in
                guard let baseAddress = buffer.baseAddress else { return }
                var offset = 0

                while offset < data.count {
                    let bytesWritten = Darwin.write(self.masterFd, baseAddress.advanced(by: offset), data.count - offset)

                    if bytesWritten > 0 {
                        offset += bytesWritten
                    } else if bytesWritten < 0 {
                        let error = errno
                        if error == EAGAIN || error == EWOULDBLOCK {
                            usleep(1000)
                            continue
                        } else if error != EINTR {
                            break
                        }
                    } else {
                        break
                    }
                }
            }
        }
    }

    func resize(cols: Int, rows: Int) {
        guard masterFd >= 0 else { return }
        pty_resize(masterFd, Int32(cols), Int32(rows))
    }

    func getCurrentWorkingDirectory() -> String? {
        guard childPid > 0 else { return nil }
        let maxLen = 1024
        var buffer = [CChar](repeating: 0, count: maxLen)
        if pty_get_cwd(childPid, &buffer, Int32(maxLen)) == 0 {
            return String(cString: buffer)
        }
        return nil
    }

    func terminate() {
        cleanup()
        if childPid > 0 {
            kill(childPid, SIGKILL)
            childPid = -1
        }
    }

    private func cleanup() {
        readSource?.cancel()
        readSource = nil

        if masterFd >= 0 {
            close(masterFd)
            masterFd = -1
        }
        
        try? logFileHandle?.close()
        logFileHandle = nil
    }

    deinit {
        terminate()
    }
}
