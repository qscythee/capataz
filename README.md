# Capataz

Capataz manages feature-owned `Systems` through a CLI and a companion VS Code extension. Each system keeps its `Client`, `Server`, and `Shared` code together under `src/Systems/<Name>System/`. The generated Rojo project (`default.project.json` by default) mounts the client bootstrap, client and shared modules in `ReplicatedStorage`, and server modules in `ServerScriptService.Systems`. Route folder names are case-insensitive; service-named folders such as `ReplicatedFirst` can also be used, and custom folder-to-service mappings can be added in `capataz.config.json`. Both interfaces share project operations and import analysis.

## Nested systems (0.1.0)

Systems can be grouped at any depth. A folder ending in the exact, case-sensitive suffix `System` identifies a system. An unsuffixed folder can opt in with `system.json` containing `{}`; this is the compatibility path for existing projects. All other folders are groups. New-system commands always append `System` to the final path segment.

```text
src/Systems/
  Player/
    CharacterControllerSystem/
      Client/
      Server/
      Shared/
      First/
    Inventory/
      system.json
      Client/
      Server/
  Match/
    RoundSystem/
      Shared/
```

```sh
capataz system new Player/CharacterController
capataz system list
capataz system remove Player/CharacterControllerSystem --dry-run
```

In VS Code, **New System** accepts the same slash-separated paths. Right-click the configured systems root or an empty/nested group to create relative to that folder; entering `Abilities/Dash` under `Player` creates `Player/Abilities/DashSystem`. **Delete System** appears on identified system folders, and its palette picker shows full paths. Context actions use the clicked workspace and respect custom `systemsDir` settings.

Group names such as `Players`, `Teams`, and `First` are valid: routes are interpreted only immediately beneath an identified system. Configure `"systemRoutes": { "First": "ReplicatedFirst" }` alongside `project` to map `First`; a folder named `ReplicatedFirst` maps automatically. The group hierarchy is preserved under each service's `Systems` folder. Imports include the full path, for example `@Systems/Player/CharacterControllerSystem/First/Boot`.

Discovery stops at the system's route folders. Module subfolders inside a route are ordinary content, even if their names end in `System`. Systems cannot contain another independently managed system or a group alongside their routes. Group names cannot end in `System`. Provider identities and lifecycle ordering are not namespaced by groups; keep provider names unique if your framework requires that.

A redundant `system.json` in a suffixed system is allowed, but markers must be JSON files containing `{}`; no marker settings are supported. Invalid markers, unsupported system folders, and unrouted legacy source fail discovery before generated files are overwritten. CLI removal and the editor's delete command accept identified systems only, never groups. A legacy system's exact path takes precedence over the suffix shorthand.

### Migrating from 0.0.x

1. For each unsuffixed system, add `system.json` containing `{}`, or rename it with the `System` suffix and update its imports. No automatic renaming occurs.
2. Before using nested imports, merge or replace `src/Core/Shared/CustomRequirer/init.luau` with the [0.1.0 template](templates/src/Core/Shared/CustomRequirer/init.luau). Keep your Import factory passing the generated `SystemRoutes` through `ServiceRoutes`. `init` preserves existing source and does not overwrite your importer.
3. Run `capataz project generate`, `capataz project check`, and `capataz check`. Generation records explicit system paths in the route table so legacy names and route-named groups resolve consistently.

Flat suffixed systems continue to work. The CLI and editor share discovery and validation; saved marker changes rebuild editor diagnostics. For the optional Luau runtime regression, set `LUNE_BIN` to a Lune executable before running `npm run test:unit`.

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
| `capataz project generate` | Regenerate the configured project file and runtime route table. |
| `capataz project check` | Validate mounts and generated-project and route-table freshness without rewriting them. |
| `capataz check --strict` | Check imports and boundaries; fail on errors and all warnings. |
| `capataz explain src/Systems/InventorySystem/Client/InventoryController.luau` | Show reachable imports and dependency chains to violations. |
| `capataz graph --format dot` | Export Graphviz DOT; the default format is JSON. |
| `capataz doctor` | Check project health and external tool versions. External tools are optional. |
| `capataz watch [project-file]` | Watch sources and config, regenerate the configured project, and incrementally lint selected project trees. |

All commands accept `--root <directory>` and `--help`. Report commands support `--format json`; `watch` uses text. Init, system new/remove, and project generate support `--dry-run`. JSON removal requires `--yes` or `--dry-run`. Exit codes are **0** success, **1** check failures, and **2** usage/config/tool failures. `check`, `explain`, and `doctor` accept `--strict`. Graph export succeeds even with unresolved edges; run `check` to enforce CI policy.

Install and pin external tools in your project's `rokit.toml` as usual. Capataz does not install packages or replace Rojo, Luau LSP, Selene, or StyLua.

In `capataz.config.json`, Rojo project settings are nested under `project`, so an existing Rojo project JSON can be copied into that object. Capataz settings such as `systemsDir`, `systemRoutes`, and `lint` are retained alongside the Rojo fields as shown:

```json
{
  "project": {
    "emitLegacyScripts": false,
    "systemsDir": "src/Systems",
    "syncbackRules": {
      "ignoreTrees": ["ReplicatedStorage/Import"]
    },
    "tree": {
      "$className": "DataModel",
      "ReplicatedStorage": { "$className": "ReplicatedStorage" },
      "ServerScriptService": { "$className": "ServerScriptService" }
    }
  },
  "systemRoutes": {},
  "lint": {}
}
```

### System routing

The default route names are `Client` and `Shared` to `ReplicatedStorage`, and `Server` to `ServerScriptService`. Route folder names are matched without case sensitivity, so a `client` folder is mounted as `Client` in the generated instance tree; system names and module paths retain their normal case-sensitive matching. Recognized Roblox service names also work directly as route folders; for example, `ReplicatedFirst` maps to `ReplicatedFirst.Systems.<Name>System.ReplicatedFirst`. Map other services or custom folder names explicitly with `systemRoutes`:

For a custom source folder name, add a `systemRoutes` mapping from that name to a Roblox service in `capataz.config.json`:

```json
{
  "systemRoutes": {
    "Bootstrap": "ReplicatedFirst"
  }
}
```

Then put the routed modules in `src/Systems/<Name>System/Bootstrap/`. Capataz mounts them at `ReplicatedFirst.Systems.<Name>System.Bootstrap`, routes `@Systems/<Name>System/Bootstrap/...` there at runtime, and includes the folder in CLI system listings and runtime-boundary analysis. `capataz project generate` regenerates both the configured project file and the generated route table at `src/Core/Shared/CustomRequirer/SystemRoutes.luau`; edit `systemRoutes` rather than that generated file.

`CustomRequirer` resolves route aliases to cached service `Systems` roots. Its optional case-insensitive child lookup also indexes children per parent instead of scanning them on every miss; exact-case mode stays on Roblox's direct `FindFirstChild` path. Module execution caching remains Roblox's built-in `require` behavior.

Capataz requires `emitLegacyScripts: false`. This lets Rojo use modern `Script` instances with suffix-derived `RunContext`; the `.client.luau` bootstrap under `src/Core/Client` is a client-context Script mounted at `ReplicatedStorage.Core.Client`. `src/Core/First` is mounted at `ReplicatedFirst.Core.First`. Explicit system routes, such as a folder mapped to `ReplicatedFirst`, remain available.

## Ignoring lint files

Add a top-level lint setting alongside project in capataz.config.json (not in .luaurc):

```json
"lint": {
  "ignoreGlobs": ["**/Packages/**", "**/ServerPackages/**"]
}
```

This applies to CLI checks and editor diagnostics, including open or unsaved files. Patterns match project-relative paths using minimatch glob syntax (including hidden directories); use forward slashes. Patterns are additive exclusions, without leading-! negation. An omitted or empty list ignores nothing. Ignored modules remain indexed so imports into them still resolve and boundary violations in your own code are checked. Their source is not linted and their outgoing dependencies are omitted from check/graph results.

For editor-only exclusions, set `capataz.lint.ignoreGlobs` in VS Code settings. These patterns are added to the project configuration. Setting changes clear or restore diagnostics without restarting; edits still use incremental analysis.

## Custom import factory inference

Capataz infers aliases from the actual imported factory's `CustomRequirer.new` configuration. Literal `Ancestors` tables, tracked variables, Instance paths, and module re-exports are supported. A Rojo `$path` makes files available in the DataModel; it does not automatically create an import alias. Native `require` continues to use `.luaurc.aliases`.

Factory summaries are evaluated separately for client and server. `RunService:IsClient()` / `IsServer()` guards and conditional expressions preserve environment-specific roots. Shared callers are checked in both environments. Two factories may define the same alias differently. There are no implicit `Core`, `Systems`, or package aliases: the factory must declare them.

Simple `RootResolver` callbacks can be evaluated symbolically for each import: literal/Instance returns, local variables, conditionals, `string.lower`, segment indexing and a literal consumed-segment count. Generated `ServiceRoutes` tables are supported when passed to CustomRequirer. No project code is executed. Unknown branches, opaque calls, loops or unsupported callbacks produce a dynamic-import warning instead of an invented missing-module error. Missing targets on proven paths and boundary violations remain errors.

For dynamic or ignored factory implementations, optionally declare the exported factory contract in top-level `lint.importFactories`:

```json
"lint": {
  "importFactories": {
    "src/DynamicImport.luau": {
      "client": {
        "aliases": { "Packages": "ReplicatedStorage/Packages" },
        "caseSensitive": true
      },
      "server": {
        "aliases": {
          "Packages": "ReplicatedStorage/Packages",
          "ServerPackages": "ServerStorage/ServerPackages"
        },
        "caseSensitive": true
      }
    }
  }
}
```

Keys are exact project-relative module filenames using forward slashes. Alias keys omit `@`; targets are service-rooted DataModel paths, not disk directories. Each declared environment replaces inference for that factory with the asserted complete alias map; undeclared environments still use inference. `caseSensitive` defaults to true for overrides. Declarations describe runtime behavior; they do not change it or suppress boundary checks. Ignored modules stay indexed but are not parsed for exports unless an explicit declaration supplies the contract. Config changes refresh the editor automatically.

## Runtime boundary linting

| Requiring code | Allowed targets |
| --- | --- |
| Client | Client, Shared |
| Server | Server, Shared; Client imports warn |
| Shared | Shared |

Server → Client is an enforced architecture rule even when Client modules are replicated. Client access to server-only mounts is also rejected. `src/Core/Client` and `src/Core/First` are client roots; `src/Core/Server` is a server root. System sides follow `systemsDir`. Script suffixes and server-only/StarterPlayer/StarterGui/StarterPack/ReplicatedFirst mounts also contribute to classification. Other ReplicatedStorage modules default to Shared. Unclassified modules still receive import-resolution checks.

VS Code reports errors in the Problems panel and refreshes on unsaved edits, source changes, and config changes. **Capataz: Check Runtime Boundaries** refreshes manually. Each workspace folder opts in through `capataz.config.json`. CI uses the same checker through `capataz check`.

Live checks debounce edits by 250 ms and cache each workspace's module index and source text. Ordinary edits analyze only changed files; unchanged save notifications skip analysis, and diagnostics on other files stay visible. Newer events cancel obsolete scans between filesystem operations and file batches, and scans run serially. Closing an unsaved document checks its disk contents again.

Startup, explicit checks, source creation/deletion/renames, and changes to metadata, `.luaurc`, Capataz config, or Rojo project files rebuild the index and recheck the workspace, including unresolved imports. Removing the opt-in config clears the workspace's lint diagnostics. Factory/module export summaries are cached per client/server runtime. Changes to imported sources invalidate their transitive callers; unrelated edits retain the cached index and summaries. CLI checks still scan the full project. Individual file analysis remains synchronous, so exceptionally large or complex files can still occupy the extension host while being analyzed.

The checker tokenizes Luau and tracks scoped bindings. It recognizes the module mounted at `ReplicatedStorage.Core.Shared.CustomRequirer` as the CustomRequirer implementation and follows factory exports through imported modules, regardless of local variable names or factory location:

```luau
local factory = require(game:GetService("ReplicatedStorage").Import)
local import = factory(script)
local copiedImport = import
local data = copiedImport("@Systems/InventorySystem/Shared/Data")
```

It also recognizes reassigned `require = factory(script)`, chained `require(...Import)(script)`, and `CustomRequirer.new` with literal `Ancestors`. It follows constants, concatenation, conditional alternatives, table fields, Instance paths, `GetService`, `WaitForChild`, and `FindFirstChild`. Comments and example strings are ignored; locals and parameters can shadow `require`.

Custom relative imports resolve through the selected **Roblox instance tree**, including `init.luau` parent behavior. Native string imports use `.luaurc` aliases; custom imports use runtime Import routing. Script/LocalScript targets are errors.

This is a conservative import analyzer, not a complete Luau type checker or interpreter. Runtime-computed targets, arbitrary `RootResolver` callbacks, interpolated strings, numeric asset requires, higher-order wrappers, and runtime-created instances cannot always be resolved. Recognized dynamic requires warn; `--strict` makes warnings fail CI. Function bodies are inspected without execution, and boundary rules apply inside `RunService` guards too. Cross-file wrapper/factory inference is not supported. Use Luau LSP alongside Capataz for syntax/type analysis.

Intentional dynamic operations can suppress warnings with a reason on the immediately preceding line:

```luau
-- capataz-ignore dynamic-require: bootstrap discovers controllers by suffix.
local controller = require(module)
```

`dynamic-requirer` supports the same directive. Boundary diagnostics and resolution **errors cannot be suppressed**. Bundled factories and bootstraps annotate their intentional dynamic operations.

To disable the dynamic-require warning category project-wide, set this in `capataz.config.json`:

```json
{
  "lint": {
    "rules": {
      "dynamic-require": "off"
    }
  }
}
```

`warn` or an omitted rule keeps the default warning behavior. A `-- Capataz(dynamic-require) reason` comment suppresses that rule on the comment's line and the immediately following line. This form also works for other suppressible warning rule codes such as `dynamic-requirer`; errors remain unsuppressed.

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

To check the standalone watcher, run `npm run compile-tests`, `npm run build:cli`, then `node scripts/test-watch.mjs`. The test uses an empty PATH and verifies authored-project preservation, lint recovery, generation, shutdown, and managed multi-place watch with shared-source diagnostics.

## Start a project

Open the Rojo project root in VS Code, then run **Capataz: Init** from the Command Palette. It creates `capataz.config.json`, the Rojo project file, `src/Core`, `src/Systems`, `src/Import.luau`, the custom requirer, `.luaurc`, and two small example systems: `GreetingSystem` and `CounterSystem`. The client and server bootstrap templates find descendant ModuleScripts ending in `Controller` and `Service` under their respective `Systems` trees, require them, then call each returned table's `Start()` method. Modules without a `Start` method produce a warning. They load all matching modules before starting any, so `Start` implementations can rely on other modules having been required.

Package folders and aliases are left to the project's chosen package manager. Init does not require `Packages` or `ServerPackages`.

If `src` already exists, Init adds missing framework directories and examples without replacing source files. When `default.project.json` exists, its settings and other Rojo mounts are carried into `capataz.config.json`; Capataz adds the missing framework mounts and regenerates the project file. Existing bootstrap files are preserved. If the project already has its own startup flow, call your system controllers and services from that flow.

Init can run again to fill missing framework files and missing files from the checked-in example system templates. It does not replace existing source or config files; restored example files are copied exactly from `templates/src/Systems`.

Other commands:

- **Capataz: New System** creates `Client`, `Server`, and `Shared` directories and regenerates the Rojo project.
- **Capataz: Delete System** removes a selected system after confirmation and regenerates the Rojo project.
- **Capataz: Regenerate Project** rebuilds the configured project file and the runtime route table from the config and current `src/Systems` folders.
- **Capataz: Check Runtime Boundaries** refreshes import diagnostics.

For a module to use the import aliases at runtime:

```luau
local requireFrom = require(game:GetService("ReplicatedStorage").Import)(script)
local Counter = requireFrom("@Systems/CounterSystem/Shared/Counter")
```

On the server, `@Systems/<Name>/Server/...` resolves to `ServerScriptService.Systems`. Other route segments use their configured service while retaining the route folder in the instance path. `@Core/Server/...` resolves to `ServerScriptService.Core.Server`.

## Debug the extension

Install dependencies with `npm install`, open this extension repository in VS Code, and press **F5** with **Run Extension** selected. Each debug session creates a fresh `debug-workspace` and isolated VS Code profile inside `.vscode-debug/session-*/`. Run **Capataz: Init** there to try scaffolding. These files are disposable: stopping debugging closes the Development Host and deletes the session directory, including every workspace edit. Closing the host window also cleans it up. No permanent `debug-workspace` directory is needed in the repository.

The debugger attaches to `127.0.0.1` so it works when Windows resolves `localhost` to IPv6 first. On Windows the build task invokes `npm.cmd`, which also works when PowerShell blocks `npm.ps1`. A background task supervises the host; the launch configuration's `postDebugTask` requests cleanup. An interrupted supervisor's stale session is cleaned up on the next launch.

The Development Host's integrated terminal exposes the current CLI build as `capataz`. Open a terminal there and run `capataz --help`, `capataz init`, `capataz system new Inventory`, or `capataz check --strict`. F5 builds both the extension and CLI first. The disposable PATH shim points directly at `dist/cli.cjs`, so rebuilding with `npm.cmd run build:cli` in the source repository updates subsequent CLI invocations without restarting the host. No global install is needed; the shim and terminal settings are deleted with the session.

After code changes, reload the Development Host window to use the new build during the same session. To start over, stop debugging and press F5 again. Copy anything you want to keep outside the disposable workspace before stopping. If a host from the old launcher is still open, close it once before using the new launcher.

To verify the build directly, run `npm.cmd run compile` on Windows or `npm run compile` elsewhere. Integration tests run with `npm.cmd test` or `npm test`. The test runner uses the standard local VS Code installation on Windows when available. For another installation, set `VSCODE_EXECUTABLE_PATH` to its executable.

## Project files and multiple places

Set `"projectFile": "places/game.project.json"` at the top level of `capataz.config.json`, alongside `project`, `systemRoutes`, and `lint`. It defaults to `default.project.json`.

Init, generation, project checks, system mutations, and VS Code regeneration use this filename. Paths are relative to the workspace root and must stay inside it. Configured `$path` mounts remain workspace-relative; generated mounts are rebased if the output is in a subdirectory. A non-default output gets a filename-derived project name unless `project.name` is set. Changing the setting does not delete the previous file.

```sh
capataz watch                            # Generate and lint configured targets
capataz watch places/lobby.project.json  # Preserve and lint this project
```

An alternate that is not registered under `projects` must exist and is never overwritten by watch. Capataz regenerates its configured output, or all registered project layouts, and their route metadata. Watch runs entirely within Capataz: run Rojo and sourcemap tooling separately. The old `dev` command and `--port` option have been removed.

Single-project configurations retain one generated tree. Register `projects` to generate independent place trees from one workspace; `project check --all-targets` verifies them all. Lint can also analyze independently authored project trees using named targets.

Configure targets under the top-level `lint` setting:

```json
{
  "lint": {
    "targets": {
      "lobby": { "projectFile": "places/lobby.project.json" },
      "match": {
        "projectFile": "places/match.project.json",
        "includeGlobs": ["src/Shared/**", "src/Match/**"]
      }
    }
  }
}
```

Each target automatically indexes the files mounted in its project tree, including nested project mounts. Project `$path` values resolve relative to their containing project file. Files do not need to live under `src`. Optional `includeGlobs` are workspace-relative and restrict which files report diagnostics; other mounted dependencies remain available for import analysis. Omit the filter to check every mounted module. Existing `ignoreGlobs` exclusions still apply.

`capataz check` checks all configured targets; `check --all-targets` makes that explicit, and `check --target lobby` selects one. `explain` and `graph` require `--target <name>` when named targets exist. VS Code checks all configured targets with separate incremental caches and labels diagnostics by target, so a shared file can be valid in one place and invalid in another.

Without targets, ordinary checks retain the generated-tree behavior. An explicit `watch` selection uses matching configured target filters, or automatically analyzes that project's mounted files if it is not registered. Watch without an argument checks all configured targets. Source edits update affected importers; structural, project, and configuration changes rebuild indexes. Restart watch to change its explicit project selection.

Target projects must stay within the workspace. Cyclic project mounts and mounting the same source file at multiple instance paths within one target produce configuration errors.

### Choosing an output for one command

Commands that generate a project accept an optional `--project-file <path>` override. The path is workspace-relative and must end in `.project.json`:

```sh
capataz system new Player/PlayerController --project-file places/lobby.project.json
capataz system remove Player/PlayerController --project-file places/lobby.project.json
capataz project generate --project-file places/lobby.project.json
capataz project check --project-file places/lobby.project.json
capataz init --project-file places/lobby.project.json
```

This selects the output for that invocation without changing an existing configured default. Generation replaces the selected file with the tree described by Capataz configuration, with mounts rebased for its directory. Use `--dry-run` on writing commands to preview changes. Without named project layouts, commands use the single configured Systems root. With layouts, a matching project selection also selects its source root and isolated route metadata. Removing a system deletes its source, affecting any authored project that also mounts that source. Other project outputs are not regenerated by that command.

When initializing a workspace without Capataz configuration, the selected existing project is adopted, or a new project is created at that path; that selection becomes the initial configured default. Existing configurations keep their default during later init calls.

VS Code Init, New System, Delete System, and Generate Project show an output picker when multiple project files exist or the configured default is missing. The picker includes the option to create the configured default. Cancelling leaves the operation unchanged. With a single existing configured project, commands use it directly. Picker selection applies only to the current operation, except when establishing the initial configuration during Init.

`watch [project-file]` preserves unregistered authored projects and regenerates registered layouts (or the configured default). `--target` selects a named layout for project/system commands and a named target for lint commands. `--project-file` also resolves a matching layout.

### Managed multi-place layouts

Add `projects` alongside the existing `project` configuration. Common Rojo settings and tree entries come from `project`; each layout supplies its own Systems root and may override `name`, `systemRoutes`, `coreDir`, or `tree`. All configuration paths are relative to the workspace root.

```json
{
  "projectFile": "places/lobby.project.json",
  "projects": {
    "lobby": {
      "projectFile": "places/lobby.project.json",
      "systemsDir": "places/lobby/src/Systems",
      "coreDir": "shared/Core"
    },
    "match": {
      "projectFile": "places/match.project.json",
      "systemsDir": "places/match/src/Systems",
      "coreDir": "shared/Core"
    }
  }
}
```

This example shows additions to an existing configuration; retain its `project` object. The default `projectFile` must match a registered layout. In the `systemsDir` convenience model, Systems roots must be distinct and non-overlapping. For shared system ownership, use the explicit `systemRoots` model below. Both places can contain `PlayerSystem`, and selecting one place for creation/deletion affects only that place's Systems root. Shared code stays outside these roots and is mounted through each project's tree.

`coreDir` maps Client/Shared/Server/First into their corresponding Core service folders. Explicit per-layout tree mounts can refine those paths. A tree override containing `$path` replaces the inherited node, avoiding stale inherited mounts. Init uses the selected mappings when scaffolding and preserves existing source files. Each place mounts its own `ReplicatedStorage.CapatazSystemRoutes` from `.capataz/generated/<project-file>/SystemRoutes.luau`; the CustomRequirer source stays shared. Init points newly scaffolded Import factories at that table. When migrating existing Import factories to managed layouts, change their generated-route require to `require(ReplicatedStorage.CapatazSystemRoutes)`; existing source files are preserved.

```sh
capataz init --target lobby
capataz init --target match
capataz system new Player --target lobby
capataz system new Player --target match
capataz system list --target match
capataz system remove Player --target match
capataz project generate --all-targets
capataz project check --all-targets
capataz check --target lobby
capataz watch
```

Each registered layout automatically becomes a lint target. Optional `lint.targets` entries with the same name and project file add reporting filters; other entries can describe authored projects that Capataz must not generate. Watch regenerates registered layouts on structural/config changes and incrementally checks sources on edits. Running Rojo remains your choice.

Explorer actions infer the place from the clicked Systems root, group, or system. Palette actions present the registered layouts, including outputs that have not been generated yet. Selection and cancellation happen before source changes. Existing single-project configurations and positional watch selection remain supported.

### Explicit reusable source roots and fully mapped projects

Use this model when a directory such as `Universal` contains code and systems consumed by several places. `systemRoots` identifies directories Capataz manages; each project's `systemMounts` describes where the roots' route folders appear in Roblox. All other source, including any directory called `Core`, uses ordinary `tree` mounts and has no special meaning in this mode.

A complete configuration with shared and place-owned roots:

```json
{
  "projectFile": "Places/Lobby.project.json",
  "systemRoots": {
    "universal": "Universal/Systems",
    "lobby": "Places/Lobby/Systems",
    "match": "Places/Match/Systems"
  },
  "project": {
    "emitLegacyScripts": false,
    "tree": {
      "$className": "DataModel",
      "ReplicatedStorage": {
        "$className": "ReplicatedStorage",
        "Universal": {
          "$className": "Folder",
          "Core": { "$path": "Universal/Core" }
        }
      }
    }
  },
  "projects": {
    "lobby": {
      "projectFile": "Places/Lobby.project.json",
      "systemMounts": {
        "universal": {
          "Client": "ReplicatedStorage/Universal/Systems",
          "Shared": "ReplicatedStorage/Universal/Systems",
          "Server": "ServerScriptService/Universal/Systems"
        },
        "lobby": {
          "Client": "ReplicatedStorage/Local/Systems",
          "Shared": "ReplicatedStorage/Local/Systems",
          "Server": "ServerScriptService/Local/Systems"
        }
      }
    },
    "match": {
      "projectFile": "Places/Match.project.json",
      "tree": {
        "ReplicatedStorage": {
          "Local": {
            "$className": "Folder",
            "Core": { "$path": "Places/Match/Core" }
          }
        }
      },
      "systemMounts": {
        "universal": {
          "Client": "ReplicatedStorage/Universal/Systems",
          "Shared": "ReplicatedStorage/Universal/Systems",
          "Server": "ServerScriptService/Universal/Systems"
        },
        "match": {
          "Client": "ReplicatedStorage/Local/Systems",
          "Shared": "ReplicatedStorage/Local/Systems",
          "Server": "ServerScriptService/Local/Systems"
        }
      }
    }
  }
}
```

A mapped root retains `<system path>/<route folder>` below each destination. For example, `Universal/Systems/PlayerSystem/Shared/State.luau` becomes `ReplicatedStorage.Universal.Systems.PlayerSystem.Shared.State`. Root labels, source locations, route folder names, and destinations are explicit. Source roots cannot overlap; share one named root across projects instead of declaring the same directory twice. Destination collisions are errors, and new-system collisions are checked before source is written. Managed destinations cannot sit beneath a filesystem `$path` mount: split the parent into explicit sibling mounts so Rojo does not create duplicate children.

```sh
capataz init --target lobby
capataz init --target match
capataz system new Player --target lobby --systems-root universal
capataz system new Player --target lobby --systems-root lobby
capataz system new Player --target match --systems-root match
capataz system list --target match --systems-root universal
capataz system remove Player --target lobby --systems-root universal
```

Init in this mode creates the selected project's managed root directories and generated outputs. It does not invent Core directories, framework scripts, examples, or native aliases. Developers own the ordinary code and bootstrap mappings. Existing single-root scaffolding remains available through the earlier configuration model.

Creating or deleting a shared system regenerates **every registered consuming project**, even when the command was launched from one place. Deletion removes the shared source itself; it is not an unmount operation. Local systems with the same name remain independent. Explorer actions infer the root from the clicked folder; shared roots do not require an arbitrary place choice, and deletion confirmation lists affected projects. Palette actions select the project and then the root when necessary.

If using Capataz's CustomRequirer, update that module from the current template and pass generated routes as `SystemRoots`. This resolves named aliases such as `@universal/PlayerSystem/Shared/State` and `@lobby/PlayerSystem/Server/State` using each project's mounts:

```lua
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local CustomRequirer = require(ReplicatedStorage.Universal.Core.CustomRequirer)
return CustomRequirer.new({
    Ancestors = {},
    SystemRoots = require(ReplicatedStorage.CapatazSystemRoutes),
    CaseSensitive = true,
})
```

For a relocated CustomRequirer implementation, declare its workspace-relative module filename in `lint.requirerModules`, for example `["Universal/Core/CustomRequirer/init.luau"]`. This explicitly identifies the supported implementation; Capataz does not assume arbitrary modules named CustomRequirer have that behavior. Other import factories retain the existing inference and `lint.importFactories` mechanisms. Native aliases remain controlled by the authored `.luaurc`.

Generated route metadata defaults to `ReplicatedStorage.CapatazSystemRoutes`. A project's `routeModule` can select another service-rooted path, or `false` to leave metadata unmounted when using a different runtime importer. The table remains generated under `.capataz/generated/<project-file>/`. No framework source is overwritten automatically during migration.
