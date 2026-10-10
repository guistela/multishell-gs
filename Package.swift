// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "MultiShell",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(
            name: "Multishell",
            targets: ["MultiShell"])
    ],
    dependencies: [
        // 1.99.0 tornou `terminal` interno e quebrou o build (e o CodeQL Swift).
        // Package.resolved fica fora do git, então a faixa precisa ser fechada aqui.
        .package(url: "https://github.com/migueldeicaza/SwiftTerm.git", .upToNextMinor(from: "1.20.0"))
    ],
    targets: [
        .target(
            name: "PTYHelper",
            dependencies: [],
            path: "MultiShell/Sources",
            sources: ["PTYHelper.c"],
            publicHeadersPath: ".",
            cSettings: [
                .headerSearchPath(".")
            ]
        ),
        .executableTarget(
            name: "MultiShell",
            dependencies: ["PTYHelper", "SwiftTerm"],
            path: "MultiShell/Sources",
            exclude: ["PTYHelper.c", "PTYHelper.h", "module.modulemap"]
        )
    ]
)
