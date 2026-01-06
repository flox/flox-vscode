# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a VSCode extension that integrates Flox (a virtual environment and package manager) with Visual Studio Code. The extension provides a sidebar UI for managing Flox environments, packages, variables, and services.

## Getting Started

### Prerequisites
- **Flox**: Install from [flox.dev](https://flox.dev)
- **VSCode**: Version 1.87.0 or higher

### Enter the Development Environment
```bash
# Activate the Flox development environment
flox activate
```

This project uses **Flox** for dependency management. Always enter the Flox environment before running development commands to ensure you have the correct versions of Node.js, npm, TypeScript, and other dependencies.

**Why Flox?**
- Reproducible build environment across all developer machines
- Isolated dependencies (no conflicts with system packages)
- Cross-platform compatibility (macOS and Linux)
- No need to manually install Node.js, npm, or TypeScript

**What's included in the Flox environment?**
- Node.js (specific version locked in manifest)
- npm and package management tools
- TypeScript compiler
- All build tools and dependencies

### First Time Setup
```bash
# 1. Enter the Flox environment
flox activate

# 2. Install npm dependencies
npm install

# 3. Compile TypeScript
npm run compile
```

## Development Workflow

### Daily Development Pattern
```bash
# 1. Activate Flox environment
flox activate

# 2. Start watch mode for auto-compilation
npm run watch

# 3. Press F5 in VSCode to launch Extension Development Host
# Or use the "Run Extension" launch configuration
```

### Making Changes
1. Edit TypeScript files in `src/`
2. Watch mode automatically recompiles
3. Reload Extension Development Host window (Cmd+R / Ctrl+R)
4. Test your changes in the Extension Development Host

## Development Commands

### Build and Development
```bash
# Compile TypeScript to JavaScript (one-time)
npm run compile

# Watch mode for development (auto-recompile on changes)
npm run watch

# Clean build artifacts
npm run clean
```

### Testing
```bash
# Run all tests (runs pretest, lint, then test)
npm test

# Just run linting
npm run lint

# Run tests in watch mode
npm run test:watch
```

### Packaging
```bash
# Create a .vsix package for distribution
npm run package

# Install the packaged extension locally
code --install-extension flox-vscode-*.vsix
```

### Running the Extension
**Method 1: VSCode Debugger (Recommended)**
1. Press `F5` or use "Run > Start Debugging"
2. Select "Run Extension" launch configuration
3. A new Extension Development Host window opens with the extension loaded

**Method 2: Command Line**
```bash
# Run extension in development mode
npm run compile && code --extensionDevelopmentPath=$PWD
```

### Debugging
- Set breakpoints in TypeScript source files
- Use Debug Console in VSCode to inspect variables
- View extension logs in the Extension Development Host's Output panel
- Use `console.log()` - output appears in Debug Console

## Architecture

### Core Components

**`src/extension.ts`** - Extension entry point
- `activate()` function is called when extension activates
- Registers all VSCode commands (`flox.init`, `flox.activate`, `flox.install`, etc.)
- Creates view instances and registers them with the Env instance
- Handles post-activation flow when user activates a Flox environment

**`src/env.ts`** - Central coordinator class
- `Env` class manages all Flox environment state and operations
- Executes `flox` CLI commands via `exec()` method
- Maintains file watchers for `manifest.toml` and `manifest.lock`
- Manages background `flox activate` process lifecycle
- Handles environment variable application to VSCode terminals
- Parses and stores manifest data, packages, services status
- Detects system architecture (aarch64-darwin, x86_64-linux, etc.)

**`src/view.ts`** - TreeView providers for sidebar UI
- `InstallView` - Shows installed packages
- `VarsView` - Shows environment variables from manifest
- `ServicesView` - Shows services with their status
- Each view implements `vscode.TreeDataProvider` and the `View` interface
- Views are refreshed when manifest files change

**`src/config.ts`** - Type definitions
- `System` enum for different platforms (aarch64-linux, x86_64-darwin, etc.)
- `Package`, `Service` types
- `View` interface that all views must implement

### Key Architecture Patterns

**Activation Flow**: When a user activates a Flox environment:
1. Extension sets `flox.justActivated` flag in workspace state
2. Extension restarts via `workbench.action.restartExtensionHost` (local) or `workbench.action.reloadWindow` (remote)
3. On restart, extension checks `flox.justActivated` flag
4. If true, spawns the background `flox activate` process via `scripts/activate.sh`
5. The activate script sends environment variables back via IPC
6. Extension applies these env vars to `context.environmentVariableCollection` for terminals

**Background Process Management**:
- Extension spawns `flox activate -- activate.sh` as a long-running child process
- `activate.sh` uses IPC (file descriptor 3) to communicate with extension
- Script sends `{"action":"ready","env":{...}}` message with all environment variables
- Process is kept alive to maintain activation; killed on deactivation
- PID stored in workspace state to prevent duplicate processes

**File Watching & Reload**:
- Extension watches `**/.flox/env/manifest.toml` and `**/.flox/env/manifest.lock`
- On manifest changes: triggers `flox activate` (no reload)
- On lock file changes: triggers full `reload()` which refreshes all views
- `reload()` parses manifest/lock files and updates UI state

**Command Execution**:
- All commands registered via `env.registerCommand()` which wraps them in try/catch
- `env.exec()` handles execution of `flox` CLI commands
- If environment is active, commands are executed within `flox activate -- <command>`
- Otherwise commands run directly

**View State Management**:
- Context keys (`flox.envExists`, `flox.envActive`, `flox.hasPkgs`, etc.) control UI visibility
- Stored in both VSCode context (for UI conditions) and workspace state (for persistence)
- Views refresh themselves by firing `_onDidChangeTreeData` event

### Dependencies

- **smol-toml**: TOML parser for reading `manifest.toml`
- **vscode**: VSCode extension API
- Extension uses Node.js child process APIs for spawning `flox` commands
- TypeScript with strict mode enabled

### Important Files

- `.flox/env/manifest.toml` - Flox environment manifest (user-editable)
- `.flox/env/manifest.lock` - Locked dependency information (JSON)
- `scripts/activate.sh` - Bash script that captures environment variables and keeps process alive

## Testing Notes

Tests use `@vscode/test-electron` and `@vscode/test-cli`. The current test suite in `src/test/extension.test.ts` contains only a sample test. When adding tests:
- Extension tests run in an actual VSCode instance
- Use the VSCode API test suite pattern
- Tests are located in `src/test/`

## Common Development Tasks

### Adding a New Command
1. Register command in `src/extension.ts` using `env.registerCommand()`
2. Implement command handler in `src/env.ts` or separate file
3. Add command to `package.json` in `contributes.commands` section
4. Update keybindings or menu items if needed
5. Test command in Extension Development Host

Example:
```typescript
// In extension.ts
env.registerCommand('flox.myNewCommand', () => env.myNewCommandHandler());

// In env.ts
async myNewCommandHandler() {
  const result = await this.exec('flox', ['some-command']);
  vscode.window.showInformationMessage(result);
}
```

### Adding a New View Item
1. Update relevant view class in `src/view.ts`
2. Modify `getChildren()` to include new item type
3. Update `getTreeItem()` to handle new item rendering
4. Refresh view with `this._onDidChangeTreeData.fire()`
5. Add context menu items in `package.json` if needed

### Modifying Manifest Parsing
1. Update parsing logic in `src/env.ts` `reload()` method
2. Update `Package` or `Service` types in `src/config.ts`
3. Refresh affected views after parsing changes
4. Test with various manifest structures

### Adding File Watchers
1. Use `vscode.workspace.createFileSystemWatcher()` in `src/extension.ts`
2. Register watcher disposal in extension context subscriptions
3. Trigger appropriate refresh/reload on file changes
4. Handle edge cases (file deletion, rapid changes)

## Working with Flox in Development

### Understanding the Flox Environment

**Key Flox Environment Variables Available:**
- `$FLOX_ENV` - Path to environment binaries/libs (like `/usr` in the environment)
- `$FLOX_ENV_PROJECT` - Project root directory (where `.flox/` lives)
- `$FLOX_ENV_CACHE` - Persistent local storage (survives `flox delete`)

**Checking What's Installed:**
```bash
# List all installed packages
flox list

# Search for packages
flox search nodejs

# Show package versions
flox show nodejs

# View current manifest
flox list -c
```

### Modifying the Development Environment

**Adding Development Tools:**
```bash
# Add a new package to the environment
flox install <package-name>

# Example: Add a debugging tool
flox install gdb

# Packages are automatically available after installation
```

**Editing Manifest Directly:**
```bash
# Open manifest in editor
flox edit

# Or edit the file directly
vim .flox/env/manifest.toml
```

**Removing Packages:**
```bash
flox uninstall <package-name>
```

### Running Commands in Flox Environment

**Without Entering Shell:**
```bash
# Run command in environment without activating shell
flox activate -- npm run compile

# Run tests
flox activate -- npm test

# Chain commands
flox activate -- npm install && npm run compile
```

**In CI/CD:**
```bash
# CI pattern: activate once, run all commands
flox activate -- bash -c "npm install && npm run compile && npm test"
```

### Troubleshooting Flox Issues

**Environment Not Activating:**
```bash
# Check if environment exists
ls -la .flox/

# Reinitialize if needed (careful: destroys local changes)
flox delete && flox init

# Check for manifest syntax errors
flox list -c
```

**Package Conflicts:**
- Check `priority` values in manifest
- Use different `pkg-group` for conflicting packages
- Verify platform compatibility with `systems` field

**Stale Build Artifacts:**
```bash
# Clean and rebuild
npm run clean
npm run compile
```

## Project Structure

```
flox-vscode/
├── .flox/                    # Flox environment definition
│   └── env/
│       ├── manifest.toml     # Environment packages & config
│       └── manifest.lock     # Locked dependencies
├── .vscode/                  # VSCode configuration
│   ├── launch.json           # Debugger configuration
│   └── tasks.json            # Build tasks
├── src/                      # TypeScript source
│   ├── extension.ts          # Extension entry point
│   ├── env.ts                # Core Flox integration logic
│   ├── view.ts               # TreeView providers
│   ├── config.ts             # Type definitions
│   └── test/                 # Test files
├── scripts/                  # Helper scripts
│   └── activate.sh           # Background activation script
├── out/                      # Compiled JavaScript (gitignored)
├── node_modules/             # npm dependencies (gitignored)
├── package.json              # Extension manifest & dependencies
├── tsconfig.json             # TypeScript configuration
└── README.md                 # User documentation
```

## Troubleshooting Development Issues

### Extension Not Loading
1. Check for TypeScript compilation errors: `npm run compile`
2. Verify package.json syntax is valid
3. Reload Extension Development Host window
4. Check Output panel for error messages

### Changes Not Reflected
1. Ensure watch mode is running: `npm run watch`
2. Reload Extension Development Host (Cmd+R / Ctrl+R)
3. Check if TypeScript compiled successfully
4. Verify source maps are working for debugging

### Test Failures
1. Ensure all dependencies are installed: `npm install`
2. Check if Flox environment is active
3. Run linter to catch syntax issues: `npm run lint`
4. Review test output in Debug Console

### Flox Environment Issues
1. **Command not found**: Ensure `flox activate` was run
2. **Wrong Node version**: Check `flox list` output
3. **Manifest errors**: Run `flox list -c` to validate
4. **Cache issues**: Clear npm cache with `npm cache clean --force`

### Debugging the Extension Itself
1. Launch Extension Development Host with F5
2. Set breakpoints in TypeScript files
3. Use Debug Console to inspect variables
4. Check "Flox" output channel for extension logs
5. Use Developer Tools (Help > Toggle Developer Tools)

## Code Style Guidelines

- Use TypeScript strict mode (already enabled)
- Follow existing patterns for command registration
- Use async/await for asynchronous operations
- Handle errors gracefully with try/catch
- Use descriptive variable names
- Add JSDoc comments for public methods
- Keep functions focused and single-purpose
- Update context keys when state changes

## Contributing Workflow

1. **Create a branch**: `git checkout -b feature/my-feature`
2. **Activate Flox**: `flox activate`
3. **Install dependencies**: `npm install`
4. **Make changes**: Edit TypeScript files
5. **Test changes**: Run extension in debug mode (F5)
6. **Run tests**: `npm test`
7. **Lint code**: `npm run lint`
8. **Commit changes**: `git commit -m "feat: description"`
9. **Create pull request**: Push branch and open PR

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md with release notes
3. Run full test suite: `npm test`
4. Build package: `npm run package`
5. Test the .vsix file locally
6. Create git tag: `git tag v1.0.0`
7. Push tag: `git push origin v1.0.0`
8. Publish to marketplace (if applicable)

## Useful Resources

- **VSCode Extension API**: https://code.visualstudio.com/api
- **Flox Documentation**: https://flox.dev/docs
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **smol-toml Documentation**: https://github.com/squirrelchat/smol-toml
- **Extension Development Guide**: https://code.visualstudio.com/api/get-started/your-first-extension
