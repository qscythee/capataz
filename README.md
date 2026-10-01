# Capataz

Capataz manages feature-owned `Systems` in a Rojo project. Each system keeps its `Client`, `Server`, and `Shared` code together under `src/Systems/<Name>System/`. The generated `default.project.json` mounts client and shared modules in `ReplicatedStorage.Systems` and server modules in `ServerScriptService.Systems`.

## Start a project

Open the Rojo project root in VS Code, then run **Capataz: Init** from the Command Palette. It creates `capataz.config.json`, the Rojo project file, `src/Core`, `src/Systems`, `src/Import.luau`, the custom requirer, `.luaurc`, and two small example systems: `GreetingSystem` and `CounterSystem`. A new source tree also gets client and server bootstrap scripts that start modules ending in `Controller` and `Service`.

Package folders and aliases are left to the project's chosen package manager. Init does not require `Packages` or `ServerPackages`.

If `src` already exists, Init adds missing framework directories and examples without replacing source files. When `default.project.json` exists, its settings and other Rojo mounts are carried into `capataz.config.json`; Capataz adds the missing framework mounts and regenerates the project file. Existing bootstrap files are preserved. If the project already has its own startup flow, call your system controllers and services from that flow.

Init can run again to fill missing framework files. It does not replace existing source or config files.

Other commands:

- **Capataz: New System** creates `Client`, `Server`, and `Shared` directories and regenerates the Rojo project.
- **Capataz: Delete System** removes a selected system after confirmation and regenerates the Rojo project.
- **Capataz: Regenerate Project** rebuilds `default.project.json` from the config and current `src/Systems` folders.

For a module to use the import aliases at runtime:

```luau
local requireFrom = require(game:GetService("ReplicatedStorage").Import)(script)
local Counter = requireFrom("@Systems/CounterSystem/Shared/Counter")
```

On the server, `@Systems/<Name>/Server/...` resolves to `ServerScriptService.Systems`. `@Core/Server/...` resolves to `ServerScriptService.Core.Server`.

## Debug the extension

Install dependencies with `npm install`, open this extension repository in VS Code, and press **F5** with **Run Extension** selected. The launch task builds the extension and opens the small `debug-workspace` in an isolated Extension Development Host. The debugger attaches to `127.0.0.1` so it works when Windows resolves `localhost` to IPv6 first. On Windows the build task invokes `npm.cmd`, which also works when PowerShell blocks `npm.ps1`.

After code changes, reload the Development Host window to use the new build. If you close that window, the next F5 launch opens a fresh one.

To verify the build directly, run `npm.cmd run compile` on Windows or `npm run compile` elsewhere. Integration tests run with `npm.cmd test` or `npm test`. The test runner uses the standard local VS Code installation on Windows when available. For another installation, set `VSCODE_EXECUTABLE_PATH` to its executable.
