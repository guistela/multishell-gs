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
        .package(url: "https://github.com/migueldeicaza/SwiftTerm.git", from: "1.0.7")
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
