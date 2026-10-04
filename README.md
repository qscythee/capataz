# Capataz

Capataz manages feature-owned `Systems` through a CLI and a companion VS Code extension. Each system keeps its `Client`, `Server`, and `Shared` code together under `src/Systems/<Name>System/`. The generated `default.project.json` mounts client and shared modules in `ReplicatedStorage.Systems` and server modules in `ServerScriptService.Systems`. Both interfaces share project operations and import analysis.

## CLI

For a local checkout, use Node.js 22.18 or newer:

```sh
npm install
npm run build:cli
node dist/cli.cjs --help
node dist/cli.cjs init --root /path/to/game
```

`npm link` makes `capataz` available locally. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

| Command | Behavior |
| --- | --- |
| `capataz init` | Initialize or adopt a project, preserving existing config, source, and bootstraps. |
| `capataz system new Inventory` | Create `InventorySystem` with Client/Server/Shared directories and regenerate. |
| `capataz system remove Inventory --dry-run` | Preview removal and regeneration. |
| `capataz system remove Inventory --yes` | Permanently remove the system. Without `--yes`, a terminal requires the full system name for confirmation. |
| `capataz system list` | List systems and their runtime parts. |
| `capataz project generate` | Regenerate `default.project.json`. |
| `capataz project check` | Validate mounts and check generated-project freshness without rewriting it. |
| `capataz check --strict` | Check imports and boundaries; fail on errors and all warnings. |
| `capataz explain src/Systems/InventorySystem/Client/InventoryController.luau` | Show reachable imports and dependency chains to violations. |
| `capataz graph --format dot` | Export Graphviz DOT; the default format is JSON. |
| `capataz doctor` | Check project health and external tool versions. Rojo is required for `dev`; other tools are optional. |
| `capataz dev --port 34872` | Watch structure/config, regenerate, and run Rojo serve and sourcemap watch. Ctrl+C stops the watcher and both children. |

All commands accept `--root <directory>` and `--help`. Report commands support `--format json`; `dev` uses text. Init, system new/remove, and project generate support `--dry-run`. JSON removal requires `--yes` or `--dry-run`. Exit codes are **0** success, **1** check failures, and **2** usage/config/tool failures. `check`, `explain`, and `doctor` accept `--strict`. Graph export succeeds even with unresolved edges; run `check` to enforce CI policy.

Install and pin external tools in your project's `rokit.toml` as usual. Capataz does not install packages or replace Rojo, Luau LSP, Selene, or StyLua.

## Runtime boundary linting

| Requiring code | Allowed targets |
| --- | --- |
| Client | Client, Shared |
| Server | Server, Shared; Client imports warn |
| Shared | Shared |

Server → Client is an enforced architecture rule even when Client modules are replicated. Client access to server-only mounts is also rejected. `src/Client`, `src/Core/Client`, and `src/Core/First` are client roots; `src/Core/Server` is a server root. System sides follow `systemsDir`. Script suffixes and server-only/StarterPlayer/StarterGui/StarterPack/ReplicatedFirst mounts also contribute to classification. Other ReplicatedStorage modules default to Shared. Unclassified modules still receive import-resolution checks.

VS Code reports errors in the Problems panel and refreshes on unsaved edits, source changes, and config changes. **Capataz: Check Runtime Boundaries** refreshes manually. Each workspace folder opts in through `capataz.config.json`. CI uses the same checker through `capataz check`.

Live checks debounce edits by 250 ms and cache each workspace's module index and source text. Ordinary edits analyze only changed files; unchanged save notifications skip analysis, and diagnostics on other files stay visible. Newer events cancel obsolete scans between filesystem operations and file batches, and scans run serially. Closing an unsaved document checks its disk contents again.

Startup, explicit checks, source creation/deletion/renames, and changes to metadata, `.luaurc`, Capataz config, or Rojo project files rebuild the index and recheck the workspace, including unresolved imports. Removing the opt-in config clears the workspace's lint diagnostics. Imported source contents do not require rechecking callers because this analyzer does not infer exported values across files. CLI checks still scan the full project. Individual file analysis remains synchronous, so exceptionally large or complex files can still occupy the extension host while being analyzed.

The checker tokenizes Luau and tracks scoped bindings. It recognizes the canonical `src/Import.luau` factory and `src/Core/Shared/CustomRequirer/init.luau`, regardless of local variable names:

```luau
local factory = require(game:GetService("ReplicatedStorage").Import)
local import = factory(script)
local copiedImport = import
local data = copiedImport("@Systems/InventorySystem/Shared/Data")
```

It also recognizes reassigned `require = factory(script)`, chained `require(...Import)(script)`, and `CustomRequirer.new` with literal `Ancestors`. It follows constants, concatenation, conditional alternatives, table fields, Instance paths, `GetService`, `WaitForChild`, and `FindFirstChild`. Comments and example strings are ignored; locals and parameters can shadow `require`.

Custom relative imports resolve through the generated **Roblox instance tree**, including `init.luau` parent behavior. Native string imports use `.luaurc` aliases; custom imports use runtime Import routing. Script/LocalScript targets are errors.

This is a conservative import analyzer, not a complete Luau type checker or interpreter. Runtime-computed targets, arbitrary `RootResolver` callbacks, interpolated strings, numeric asset requires, higher-order wrappers, and runtime-created instances cannot always be resolved. Recognized dynamic requires warn; `--strict` makes warnings fail CI. Function bodies are inspected without execution, and boundary rules apply inside `RunService` guards too. Cross-file wrapper/factory inference is not supported. Use Luau LSP alongside Capataz for syntax/type analysis.

Intentional dynamic operations can suppress warnings with a reason on the immediately preceding line:

```luau
-- capataz-ignore dynamic-require: bootstrap discovers controllers by suffix.
local controller = require(module)
```

`dynamic-requirer` supports the same directive. Boundary diagnostics and resolution **errors cannot be suppressed**. Bundled factories and bootstraps annotate their intentional dynamic operations.

## Lint timing in VS Code

Set **Capataz: Lint Run** in VS Code Settings to `onChange` (the default) or `onSave`. With `"capataz.lint.run": "onSave"`, diagnostics use saved contents and remain unchanged while you type. Saves and external disk changes update them; structural/configuration changes and manual checks still run using saved contents. The setting supports user, workspace, and workspace-folder configuration and takes effect without restarting the extension.

## Standalone executable and Rokit distribution

```sh
npm run package:cli
```

This bundles the CLI and templates into a Node single-executable application at `dist/capataz.exe` on Windows or `dist/capataz` on Unix. End users do not need Node. Build on each target platform; Windows binaries are unsigned and macOS binaries use an ad hoc signature.

[release-cli.yml](.github/workflows/release-cli.yml) builds and smoke-tests Windows x64, Linux x64, and macOS arm64 archives. Manual workflow runs produce downloadable artifacts. Pushing a `v*` tag publishes the archives to a GitHub release. Once published, install with `rokit add <owner>/<repository>@<version>`. This checkout does not publish a release by itself.

## Verification

`npm run test:unit` builds the CLI and runs import-analysis, instance-resolution, and command integration tests. `npm test` builds and runs VS Code integration tests, including unsaved-document diagnostics. Tests use disposable directories and the ignored `out/editor-fixture` workspace.

To check `dev` against a real installed Rojo executable, run `npm run compile-tests`, `npm run build:cli`, then `node scripts/test-dev.mjs /path/to/rojo`. The test starts Rojo on port 34991 in a temporary project, verifies sourcemap generation and regeneration after adding a system, and checks signal shutdown.

## Start a project

Open the Rojo project root in VS Code, then run **Capataz: Init** from the Command Palette. It creates `capataz.config.json`, the Rojo project file, `src/Core`, `src/Systems`, `src/Import.luau`, the custom requirer, `.luaurc`, and two small example systems: `GreetingSystem` and `CounterSystem`. A new source tree also gets client and server bootstrap scripts that start modules ending in `Controller` and `Service`.

Package folders and aliases are left to the project's chosen package manager. Init does not require `Packages` or `ServerPackages`.

If `src` already exists, Init adds missing framework directories and examples without replacing source files. When `default.project.json` exists, its settings and other Rojo mounts are carried into `capataz.config.json`; Capataz adds the missing framework mounts and regenerates the project file. Existing bootstrap files are preserved. If the project already has its own startup flow, call your system controllers and services from that flow.

Init can run again to fill missing framework files. It does not replace existing source or config files.

Other commands:

- **Capataz: New System** creates `Client`, `Server`, and `Shared` directories and regenerates the Rojo project.
- **Capataz: Delete System** removes a selected system after confirmation and regenerates the Rojo project.
- **Capataz: Regenerate Project** rebuilds `default.project.json` from the config and current `src/Systems` folders.
- **Capataz: Check Runtime Boundaries** refreshes import diagnostics.

For a module to use the import aliases at runtime:

```luau
local requireFrom = require(game:GetService("ReplicatedStorage").Import)(script)
local Counter = requireFrom("@Systems/CounterSystem/Shared/Counter")
```

On the server, `@Systems/<Name>/Server/...` resolves to `ServerScriptService.Systems`. `@Core/Server/...` resolves to `ServerScriptService.Core.Server`.

## Debug the extension

Install dependencies with `npm install`, open this extension repository in VS Code, and press **F5** with **Run Extension** selected. Each debug session creates a fresh `debug-workspace` and isolated VS Code profile inside `.vscode-debug/session-*/`. Run **Capataz: Init** there to try scaffolding. These files are disposable: stopping debugging closes the Development Host and deletes the session directory, including every workspace edit. Closing the host window also cleans it up. No permanent `debug-workspace` directory is needed in the repository.

The debugger attaches to `127.0.0.1` so it works when Windows resolves `localhost` to IPv6 first. On Windows the build task invokes `npm.cmd`, which also works when PowerShell blocks `npm.ps1`. A background task supervises the host; the launch configuration's `postDebugTask` requests cleanup. An interrupted supervisor's stale session is cleaned up on the next launch.

The Development Host's integrated terminal exposes the current CLI build as `capataz`. Open a terminal there and run `capataz --help`, `capataz init`, `capataz system new Inventory`, or `capataz check --strict`. F5 builds both the extension and CLI first. The disposable PATH shim points directly at `dist/cli.cjs`, so rebuilding with `npm.cmd run build:cli` in the source repository updates subsequent CLI invocations without restarting the host. No global install is needed; the shim and terminal settings are deleted with the session.

After code changes, reload the Development Host window to use the new build during the same session. To start over, stop debugging and press F5 again. Copy anything you want to keep outside the disposable workspace before stopping. If a host from the old launcher is still open, close it once before using the new launcher.

To verify the build directly, run `npm.cmd run compile` on Windows or `npm run compile` elsewhere. Integration tests run with `npm.cmd test` or `npm test`. The test runner uses the standard local VS Code installation on Windows when available. For another installation, set `VSCODE_EXECUTABLE_PATH` to its executable.
