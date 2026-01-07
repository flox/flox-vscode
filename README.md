# Flox VSCode Extension

<p align="center">
  <img src="./assets/demo.gif" width="100%" />
</p>

<img src="./assets/icon.png" align="right" width="128" height="128">

**Flox: Your dev environment, everywhere.**

[Flox](https://flox.dev) is a virtual environment and package manager all in one. With Flox you create environments that layer and replace dependencies just where it matters, making them portable across the full software lifecycle.

`flox-vscode` is a VSCode extension that integrates Flox environments with Visual Studio Code, providing a seamless UI for managing packages, environment variables, and services.

## Features

✨ **Sidebar UI** - Manage your Flox environment directly from VSCode's sidebar
📦 **Package Management** - Install, upgrade, and remove packages with one click
🔧 **Environment Variables** - View and manage environment variables
🚀 **Services** - Monitor and control background services
🔄 **Auto-sync** - Automatic refresh when manifest files change
💻 **Integrated Terminal** - Environment variables automatically applied to terminals
🔔 **Auto-Activation** - Prompts to activate environment with remember preference
📌 **Pending Indicators** - Visual markers for uncommitted manifest changes
🔄 **Auto-Reactivate** - Environment refreshes when manifest.toml changes
📋 **Service Logs** - View real-time logs for running services
🐛 **Debug Output** - Detailed logs in the Output panel for troubleshooting
🤖 **MCP Integration** - AI-powered tools for GitHub Copilot users
✅ **Update Checks** - Notifies when newer Flox versions are available

## Installation

### Prerequisites
- **Flox**: Install from [flox.dev/docs/install-flox](https://flox.dev/docs/install-flox/)
- **VSCode**: Version 1.87.0 or higher

> **Note:** If Flox is not installed, the extension will display a message with a link to the installation guide. Once Flox is installed, reload VSCode to start using the extension.

### From VSCode Marketplace
1. Open VSCode
2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)
3. Search for "Flox"
4. Click "Install"

### From .vsix File
```bash
code --install-extension flox-vscode-*.vsix
```

## Quick Start

### Creating Your First Flox Environment
```bash
# Navigate to your project directory
cd my-project

# Initialize a new Flox environment
flox init

# Install some packages
flox install nodejs python3 git

# Activate in VSCode
# Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
# Run: "Flox: Activate"
```

### Using the Extension

**Activating an Environment:**
1. Open a project with a Flox environment (`.flox/` directory)
2. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
3. Run `Flox: Activate`
4. VSCode will reload with the environment active

**Installing Packages:**
1. Open the Flox sidebar view
2. Click the "+" icon in the Packages section
3. Enter the package name (e.g., `nodejs`, `python3`)
4. Package will be installed and available immediately

**Viewing Environment Variables:**
- Open the Flox sidebar
- Expand the "Variables" section
- All environment variables from your manifest are listed

**Managing Services:**
- View service status in the "Services" section
- Start/stop services with the play/stop buttons
- Check service logs in the Output panel

## Commands

Access these via Command Palette (Cmd+Shift+P / Ctrl+Shift+P):

- `Flox: Init` - Create a new Flox environment in current workspace
- `Flox: Activate` - Activate the Flox environment (reloads VSCode)
- `Flox: Deactivate` - Deactivate the current environment
- `Flox: Install` - Install a package
- `Flox: Uninstall` - Remove a package
- `Flox: Upgrade` - Upgrade a package to latest version
- `Flox: Edit` - Open manifest in editor
- `Flox: Search` - Search for packages in Flox catalog
- `Flox: Show service logs` - Open terminal with live service logs
- `Flox: Configure Flox Agentic MCP Server` - Set up MCP for Copilot
- `Flox: Install Flox` - Open installation page (shown when Flox not installed)
- `Flox: Upgrade Flox` - Open upgrade instructions (shown when update available)

## Settings

Configure the extension behavior via VSCode settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `flox.promptToActivate` | `true` | Show popup when Flox environment is detected |
| `flox.checkForUpdates` | `true` | Check for Flox CLI updates (once per 24 hours) |

**Per-Workspace Behavior:**
- After activation prompt, choose "Always Activate" or "Never Activate" to remember preference
- Preference is stored per-workspace in VSCode's workspace state

## AI Integration (MCP)

The extension integrates with GitHub Copilot via the Model Context Protocol (MCP) to provide AI-powered Flox tools.

### Prerequisites
- VSCode 1.102 or higher
- GitHub Copilot extension installed
- `flox-mcp` command available in PATH (from [Flox Agentic](https://github.com/flox/flox-agentic))

### Setup
1. Activate your Flox environment
2. If `flox-mcp` is detected, a notification will appear
3. Click "Configure MCP" to enable the integration
4. Or run Command Palette → "Flox: Configure Flox Agentic MCP Server"

### What You Get
- Flox-specific tools available in Copilot Chat agent mode
- Context-aware package suggestions
- Environment management through natural language

## FAQ

### Why do you need to restart VSCode when activating Flox environment?

This is needed to ensure the Flox environment is loaded first and software from the Flox environment will be in the `$PATH` for other VSCode extensions to use.

The extension:
1. Spawns a background `flox activate` process
2. Captures all environment variables
3. Applies them to VSCode's integrated terminal
4. Ensures tools like Node.js, Python, etc. are available to other extensions

### How does the extension detect Flox environments?

The extension looks for a `.flox/` directory in your workspace root. When detected:
- Sidebar view becomes available
- Commands are enabled
- File watchers monitor `manifest.toml` and `manifest.lock` for changes

### What happens to my system packages?

Flox environments are isolated - your system packages remain unchanged. When you activate a Flox environment:
- Flox packages take precedence in `$PATH`
- System packages are still accessible as fallback
- Deactivating restores your original environment

### Can I use multiple Flox environments?

Currently, the extension supports one environment per workspace. For multiple environments:
- Use VSCode multi-root workspaces
- Layer environments at runtime (see [Flox layering docs](https://flox.dev/docs))
- Switch between projects with different environments

### How do I share my environment with my team?

Flox environments are fully reproducible:
```bash
# Commit the Flox manifest
git add .flox/env/manifest.toml .flox/env/manifest.lock
git commit -m "Add Flox environment"
git push

# Team members can activate immediately
git clone <your-repo>
cd <your-repo>
flox activate
```

### Where can I find available packages?

- **VSCode**: Use `Flox: Search` command
- **CLI**: `flox search <package-name>`
- **Web**: Browse at [flox.dev](https://flox.dev/docs)

Flox has millions of package versions from the Nix ecosystem!

### How do I view debug logs?

1. Open the Output panel (View → Output)
2. Select "Flox" from the dropdown
3. Logs show command execution, file changes, and activation lifecycle

### How do I disable the activation prompt?

**Global:** Set `flox.promptToActivate` to `false` in settings
**Per-Workspace:** Click "Never Activate" when prompted - this workspace won't prompt again

### How do I disable update checks?

Set `flox.checkForUpdates` to `false` in settings to skip periodic Flox version checks.

### What does the asterisk (*) mean next to a package?

Items with `*` are "pending" - they exist in `manifest.toml` but haven't been committed to the lock file yet. Run `flox activate` to apply changes.

## 🔧 Development

Want to contribute or modify the extension? Here's how to get started!

### Prerequisites
- **Flox**: Install from [flox.dev](https://flox.dev)
- **VSCode**: Version 1.87.0 or higher
- **Git**: For cloning the repository

### Setup Development Environment

```bash
# 1. Clone the repository
git clone https://github.com/flox/flox-vscode.git
cd flox-vscode

# 2. Activate the Flox development environment
# This provides Node.js, npm, TypeScript, and all build tools
flox activate

# 3. Install npm dependencies
npm install

# 4. Compile TypeScript
npm run compile
```

### Development Workflow

```bash
# Start watch mode (auto-recompile on changes)
npm run watch

# In VSCode, press F5 to launch Extension Development Host
# Or use "Run > Start Debugging"
```

The Extension Development Host window opens with your development version loaded. Make changes to the code, and reload the window (Cmd+R / Ctrl+R) to see updates.

### Running Tests

```bash
# Run all tests (lint + unit tests)
npm test

# Run only linting
npm run lint

# Run only unit tests
npm run test:unit
```

### Project Structure

```
flox-vscode/
├── .flox/                    # Flox development environment
├── src/
│   ├── extension.ts          # Extension entry point
│   ├── env.ts                # Core Flox integration
│   ├── view.ts               # TreeView providers (sidebar UI)
│   ├── config.ts             # Type definitions
│   └── test/                 # Tests
├── scripts/
│   └── activate.sh           # Background activation script
├── package.json              # Extension manifest
└── tsconfig.json             # TypeScript config
```

### Key Development Commands

```bash
# Compile TypeScript
npm run compile

# Watch mode (auto-compile)
npm run watch

# Clean build artifacts
npm run clean

# Run tests
npm test

# Package extension as .vsix
npm run package

# Install packaged extension
code --install-extension flox-vscode-*.vsix
```

### Debugging

1. Open the project in VSCode
2. Activate Flox environment: `flox activate`
3. Press F5 to launch Extension Development Host
4. Set breakpoints in TypeScript source files
5. Use Debug Console to inspect variables
6. Check Output panel for extension logs

### Making Changes

**Adding a New Command:**
1. Register in `src/extension.ts`: `env.registerCommand('flox.myCommand', handler)`
2. Implement handler in `src/env.ts`
3. Add to `package.json` under `contributes.commands`
4. Test in Extension Development Host

**Modifying the Sidebar:**
1. Edit view classes in `src/view.ts`
2. Update `getChildren()` for new items
3. Update `getTreeItem()` for rendering
4. Refresh with `_onDidChangeTreeData.fire()`

**Understanding Flox Integration:**
- `src/env.ts` - All Flox CLI interactions
- `scripts/activate.sh` - Background process that captures env vars
- File watchers monitor `manifest.toml` and `manifest.lock` for changes
- Environment variables applied to VSCode terminals via `environmentVariableCollection`

### Testing Your Changes

```bash
# 1. Compile your changes
npm run compile

# 2. Run tests
npm test

# 3. Launch Extension Development Host (F5)
# 4. Test functionality manually

# 5. Package and test the .vsix
npm run package
code --install-extension flox-vscode-*.vsix
```

### Troubleshooting Development

**Extension won't load:**
- Check for TypeScript errors: `npm run compile`
- Verify package.json syntax
- Check Output panel for error messages

**Changes not reflected:**
- Ensure watch mode is running: `npm run watch`
- Reload Extension Development Host (Cmd+R / Ctrl+R)
- Check TypeScript compiled successfully

**Flox environment issues:**
- Verify activation: `flox list` should show packages
- Check manifest: `flox list -c`
- Reinstall dependencies: `npm install`

### Using Flox for Development

**Why Flox?**
- Reproducible development environment
- Same Node.js and npm versions for all contributors
- No conflicts with system packages
- Cross-platform (macOS, Linux)

**Modifying the Development Environment:**
```bash
# Add a development tool
flox install <package>

# View installed packages
flox list

# Edit manifest
flox edit
```

**Running Commands Without Activating:**
```bash
# Useful for CI/CD
flox activate -- npm test
flox activate -- npm run compile
```

### Documentation

- **CLAUDE.md** - Comprehensive development guide for Claude Code users
- **Architecture** - See CLAUDE.md for detailed architecture documentation
- **VSCode Extension API** - https://code.visualstudio.com/api
- **Flox Docs** - https://flox.dev/docs

## ⭐️ Contribute

We welcome contributions to this project! Here's how:

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/your-username/flox-vscode.git`
3. **Create a branch**: `git checkout -b feature/my-feature`
4. **Activate Flox**: `flox activate`
5. **Make changes** and test thoroughly
6. **Run tests**: `npm test`
7. **Commit**: `git commit -m "feat: add feature"`
8. **Push**: `git push origin feature/my-feature`
9. **Open a Pull Request**

Please read the [Contributor guide](./CONTRIBUTING.md) for detailed guidelines.

### Contribution Guidelines

- Follow existing code style (TypeScript strict mode)
- Add tests for new features
- Update documentation (README, CLAUDE.md)
- Ensure all tests pass: `npm test`
- Keep PRs focused on a single feature/fix

## 📚 Resources

- 📖 [Flox Documentation](https://flox.dev/docs) - Learn about Flox
- 🚀 [Get Support](https://go.flox.dev/slack) - Join Slack community
- 💬 [Discourse Forum](https://discourse.flox.dev) - Ask questions
- 🐛 [Report Issues](https://github.com/flox/flox-vscode/issues/new/choose) - File bugs or feature requests
- 📘 [VSCode Extension API](https://code.visualstudio.com/api) - Extension development guide

## 🪪 License

The Flox VSCode Extension is licensed under the GPLv2. See [LICENSE](./LICENSE).
