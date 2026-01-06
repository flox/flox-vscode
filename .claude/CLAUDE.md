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
# Run all tests (compiles, lints, then runs unit + integration)
npm test

# Run only unit tests (fast, mocked, no Flox required)
npm run test:unit

# Run only integration tests (requires VSCode instance)
npm run test:integration

# Just run linting
npm run lint
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
- Context keys (`flox.isInstalled`, `flox.envExists`, `flox.envActive`, `flox.hasPkgs`, etc.) control UI visibility
- `flox.isInstalled` is checked on extension activation to show install guidance when Flox CLI is not available
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

## Testing

### Test Architecture

Tests are organized into three categories:

**Unit Tests** (`src/test/unit/`)
- Fast, isolated tests with mocked VSCode APIs
- No external dependencies (Flox CLI not required)
- Test individual classes and functions
- Run in ~300ms (107 tests)

**Integration Tests** (`src/test/integration/`)
- Run in actual VSCode Extension Development Host
- Test real extension activation and command registration
- Some tests require Flox CLI installed
- Run in ~24s (46 tests)

### Test Types

| Type | File | Purpose |
|------|------|---------|
| **Happy Path** | `happy_path.test.ts` | End-to-end tests using VSCode commands (simulates user clicking buttons) |
| **CLI Tests** | `cli.test.ts` | Direct Flox CLI operations (tests CLI, not VSCode integration) |
| **Extension Tests** | `extension.test.ts` | Command registration, activation, configuration |

### When to Use Each Test Type

- **Happy Path Tests**: For testing complete user workflows (init → activate → install → deactivate)
- **CLI Tests**: For testing Flox CLI behavior and manifest parsing
- **Extension Tests**: For testing VSCode-specific functionality (commands, views, settings)
- **Unit Tests**: For testing isolated logic without VSCode or Flox

### Test Commands

```bash
# Run all tests (unit + integration)
npm test

# Run only unit tests (fast, no Flox required)
npm run test:unit

# Run only integration tests (requires VSCode, optionally Flox)
npm run test:integration

# Skip Flox-dependent tests in CI
SKIP_FLOX_TESTS=1 npm run test:integration
```

### Test File Structure

```
src/test/
├── mocks/
│   └── vscode.ts           # Mock utilities for VSCode APIs
├── unit/
│   ├── config.test.ts      # System enum tests
│   ├── view.test.ts        # TreeView provider tests
│   ├── env.test.ts         # Env class tests
│   └── mcp.test.ts         # MCP provider tests
└── integration/
    ├── happy_path.test.ts  # E2E tests using VSCode commands
    ├── cli.test.ts         # Direct Flox CLI tests
    └── extension.test.ts   # Extension activation & commands
test-fixtures/
└── workspace/              # Test workspace for integration tests
    └── .gitkeep
```

### Mock Utilities (`src/test/mocks/vscode.ts`)

Provides mock implementations for testing without VSCode:

- **`MockMemento`**: Mock for `workspaceState`/`globalState`
- **`MockEnvironmentVariableCollection`**: Mock for terminal env vars
- **`MockFileSystemWatcher`**: Mock with manual event triggers
- **`createMockExtensionContext()`**: Factory for complete ExtensionContext mock

Example usage:
```typescript
import { createMockExtensionContext } from '../mocks/vscode';

const mockContext = createMockExtensionContext();
const env = new Env(mockContext, workspaceUri);

// Test workspace state
await mockContext.workspaceState.update('flox.envExists', true);
```

### Writing New Tests

**Unit Test Pattern:**
```typescript
import * as assert from 'assert';
import { createMockExtensionContext } from '../mocks/vscode';

suite('MyFeature Unit Tests', () => {
  let mockContext: vscode.ExtensionContext;

  setup(() => {
    mockContext = createMockExtensionContext();
  });

  test('should do something', async () => {
    // Arrange
    const env = new Env(mockContext, workspaceUri);

    // Act
    const result = await env.someMethod();

    // Assert
    assert.strictEqual(result, expected);
    env.dispose();
  });
});
```

**Integration Test Pattern:**
```typescript
suite('Extension Integration Tests', () => {
  test('command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes('flox.myCommand'));
  });
});
```

### What's Tested

| File | Coverage |
|------|----------|
| `config.ts` | System enum values, uniqueness |
| `view.ts` | TreeItem construction, getChildren(), refresh events |
| `env.ts` | System detection, file loading, TOML/JSON parsing, reload, env vars |
| `extension.ts` | Command registration, extension activation |

### Testing Tips

1. **Use temp directories** for file-based tests (cleaned up in `teardown()`)
2. **Skip platform-specific tests** with `this.skip()` when not on target platform
3. **Mock external calls** - don't call real Flox CLI in unit tests
4. **Test error cases** - invalid TOML, missing files, etc.
5. **Document test intent** - explain WHY you're testing, not just what

### Test Configuration

`.vscode-test.mjs` configures the test runner:
- Unit tests: 10s timeout per test
- Integration tests: 60s timeout (Flox operations can be slow)
- Integration tests use `test-fixtures/workspace` as the workspace folder
- Uses Mocha TDD style (`suite`/`test`)

### Writing Happy Path (E2E) Tests

Happy Path tests simulate user interactions using VSCode commands:

```typescript
suite('Happy Path Integration Tests', () => {
  let workspaceDir: string;

  setup(async function() {
    // Get workspace from test runner (configured in .vscode-test.mjs)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      this.skip();
      return;
    }
    workspaceDir = workspaceFolders[0].uri.fsPath;

    // Clean up any existing .flox directory
    const floxDir = path.join(workspaceDir, '.flox');
    if (fs.existsSync(floxDir)) {
      fs.rmSync(floxDir, { recursive: true, force: true });
    }
  });

  test('Complete workflow', async function() {
    this.timeout(120000); // 2 minutes for slow operations

    // Use VSCode commands (not CLI) to test user interactions
    await vscode.commands.executeCommand('flox.init');

    // Wait for async operations to complete
    await waitFor(() => fs.existsSync(path.join(workspaceDir, '.flox')), 30000);

    await vscode.commands.executeCommand('flox.activate');

    // For operations that require UI (like install picker), use CLI directly
    await execFileAsync('flox', ['install', 'hello', '--dir', workspaceDir]);

    // Verify state
    assert.ok(fs.existsSync(path.join(workspaceDir, '.flox', 'env', 'manifest.lock')));
  });
});
```

**Key Points for E2E Tests:**
1. Use VSCode commands (`vscode.commands.executeCommand`) not CLI commands
2. For UI-dependent commands (install picker), fall back to CLI
3. Use `waitFor()` helper to wait for async file operations
4. Set long timeouts (Flox operations can take 30+ seconds)
5. Clean up `.flox` directory in `setup()` and `teardown()`
6. Skip deactivate command in tests (it restarts extension host and kills the test)

### Important Testing Gotchas

1. **`flox.activate` and `flox.deactivate` restart the extension host**
   - These commands will kill the test process
   - For activate: the test runner handles the restart gracefully
   - For deactivate: skip it or just verify state before deactivation

2. **Commands must be registered before use**
   - Auto-activate code must run AFTER all `registerCommand()` calls
   - Otherwise you get "command not found" errors

3. **Workspace state vs. Context keys**
   - Context keys (`setContext`) are for UI conditions
   - Workspace state is for persistence across restarts
   - Both must be updated together for consistency

4. **Test workspace folder**
   - Integration tests use `test-fixtures/workspace/`
   - This is configured in `.vscode-test.mjs` via `workspaceFolder`
   - Without this, `vscode.workspace.workspaceFolders` is undefined

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

### Adding Tests for New Features

When adding a new feature, write tests in the appropriate location:

**For new Env methods:**
```typescript
// src/test/unit/env.test.ts
suite('myNewMethod', () => {
  test('should handle normal case', async () => {
    const env = new Env(mockContext, workspaceUri);
    const result = await env.myNewMethod();
    assert.ok(result);
    env.dispose();
  });

  test('should handle error case', async () => {
    // Test error handling
  });
});
```

**For new commands:**
```typescript
// src/test/integration/extension.test.ts
test('flox.myNewCommand should be registered', async () => {
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('flox.myNewCommand'));
});
```

**For new TreeView items:**
```typescript
// src/test/unit/view.test.ts
suite('MyNewItem', () => {
  test('should set properties correctly', () => {
    const item = new MyNewItem('label', 'description');
    assert.strictEqual(item.label, 'label');
    assert.strictEqual(item.contextValue, 'myNewItem');
  });
});
```

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
├── .claude/                  # Claude Code instructions
│   └── CLAUDE.md             # This file
├── .flox/                    # Flox environment definition
│   └── env/
│       ├── manifest.toml     # Environment packages & config
│       └── manifest.lock     # Locked dependencies
├── .vscode/                  # VSCode configuration
│   ├── launch.json           # Debugger configuration
│   └── tasks.json            # Build tasks
├── .vscode-test.mjs          # Test runner configuration
├── doc/                      # Developer documentation
│   └── activation.md         # Activation flow with Mermaid diagrams
├── src/                      # TypeScript source
│   ├── extension.ts          # Extension entry point
│   ├── env.ts                # Core Flox integration logic
│   ├── view.ts               # TreeView providers
│   ├── config.ts             # Type definitions
│   └── test/                 # Test files
│       ├── mocks/            # Mock utilities
│       │   └── vscode.ts     # VSCode API mocks
│       ├── unit/             # Unit tests (fast, mocked)
│       │   ├── config.test.ts
│       │   ├── view.test.ts
│       │   ├── env.test.ts
│       │   └── mcp.test.ts
│       └── integration/      # Integration tests (real VSCode)
│           ├── happy_path.test.ts  # E2E tests using VSCode commands
│           ├── cli.test.ts         # Direct Flox CLI tests
│           └── extension.test.ts   # Command registration tests
├── scripts/                  # Helper scripts
│   └── activate.sh           # Background activation script
├── test-fixtures/            # Test resources
│   └── workspace/            # Workspace for integration tests
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
2. Check if Flox environment is active: `flox activate`
3. Run linter to catch syntax issues: `npm run lint`
4. Run unit tests first (no external deps): `npm run test:unit`
5. For integration test failures, check if VSCode downloads correctly
6. Set `SKIP_FLOX_TESTS=1` to skip Flox CLI tests in CI environments
7. Platform-specific tests auto-skip on non-matching platforms (shows as "pending")

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

### Extension Logging System

The extension logs to the "Flox" output channel with prefixed messages:

| Prefix | Location | Description |
|--------|----------|-------------|
| `[STEP 1]` | extension.ts | User clicks activate |
| `[STEP 2]` | extension.ts | Post-activation flow (after restart) |
| `[STEP 3]` | extension.ts | Initial reload/refresh |
| `[STEP 4]` | extension.ts | Auto-activate prompt |
| `[STEP 5]` | extension.ts | Extension activation complete |
| `[SPAWN]` | env.ts | Background process spawning |
| `[RELOAD]` | env.ts | Manifest parsing and view refresh |
| `[MCP]` | env.ts | MCP server detection |

To view logs:
1. Open Output panel (View → Output)
2. Select "Flox" from dropdown
3. Logs appear in real-time during extension operations

### Common Debugging Scenarios

**Activation Hangs:**
1. Check for `[SPAWN]` messages - is the process spawning?
2. Look for `[MCP]` messages - MCP check might be hanging
3. Verify `activate.sh` IPC message format

**Auto-Activate Loop:**
1. Check if `flox.envActive` is set in BOTH context AND workspace state
2. Look for `[STEP 4]` messages repeating
3. Verify the command registration order (auto-activate must run after `registerCommand`)

**Commands Not Found:**
1. Ensure auto-activate code runs AFTER all `registerCommand()` calls
2. Check for registration errors in the output channel

**Performance Issues:**
1. Look for blocking `await` calls on slow operations
2. MCP checks should be non-blocking (use `.then()` not `await`)
3. Check if `reload()` is being called multiple times

### Detailed Architecture Documentation

For comprehensive documentation of the activation flow with Mermaid diagrams, see:
- [`doc/activation.md`](../doc/activation.md) - Complete activation flow documentation

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
- **VSCode Extension Testing**: https://code.visualstudio.com/api/working-with-extensions/testing-extension
- **Flox Documentation**: https://flox.dev/docs
- **TypeScript Handbook**: https://www.typescriptlang.org/docs/
- **smol-toml Documentation**: https://github.com/squirrelchat/smol-toml
- **Extension Development Guide**: https://code.visualstudio.com/api/get-started/your-first-extension
- **@vscode/test-cli**: https://github.com/microsoft/vscode-test-cli
