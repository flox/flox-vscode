# Change Log

All notable changes to the "flox" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.1] - 2026-02-11

### Fixed

- **Terminal export pollution** - Removed automatic environment reactivation
  in existing terminals which caused `export` statements to be printed. Now warns
  when terminals need to be re-opened.

### Added

- **CLI telemetry source** - Set `FLOX_INVOCATION_SOURCE=vscode.plugin`
  so the Flox CLI can distinguish extension-triggered invocations when telemetry is enabled

### Changed

- **README features formatting** - Features section now renders as a
  proper bulleted list instead of a single paragraph

## [1.0.0] - 2025-01-15

This is a major release with significant new features, improved UX, and AI integration capabilities.

### Highlights

**Remote Development Support** - The extension now works seamlessly with VSCode's remote development features including Remote SSH, Dev Containers, and WSL. This was made possible by a complete rework of the activation mechanism to use a background process instead of requiring VSCode restarts.

**AI-Assisted Development** - Full MCP (Model Context Protocol) server integration allows AI assistants like GitHub Copilot to interact with your Flox environments.

### Added

#### Remote Development
- **Background activation** - Complete rework of environment activation to use a background process instead of restarting VSCode
- **Remote SSH support** - Works with VSCode Remote SSH connections
- **Dev Containers support** - Works within VSCode Dev Containers
- **WSL support** - Works with Windows Subsystem for Linux

#### AI & MCP Integration
- **Flox Agentic MCP server integration** - Enable AI assistants like GitHub Copilot to interact with your Flox environments
- **Offer to install Flox MCP server** - Prompts to install MCP server when not found (useful for AI-assisted development)
- **Configure MCP Server command** - Easy setup for MCP integration with AI tools

#### Environment Activation
- **Auto-activate prompt** - Asks to activate Flox environment when detected in workspace
- **Remember activation preference** - Saves per-workspace choice to always/never auto-activate
- **Reset auto-activate preference** - Command to clear saved preference and be prompted again
- **Deactivate environment command** - Cleanly deactivate the Flox environment when needed

#### Visual Improvements
- **Status bar indicator** - Shows active environment status with custom Flox icon
- **Activity bar badge** - Visual indicator when environment is active
- **Custom Flox icon** - New icon font for consistent branding throughout the extension
- **Pending indicators** - Shows loading state when packages are being resolved from lock file

#### Editor Integration
- **TOML syntax highlighting** - Full syntax highlighting for manifest.toml files
- **manifest.toml validation** - Real-time diagnostics with error highlighting and suggestions
- **Flox output channel** - Debug logs visible in VSCode Output panel

#### Version Management
- **Daily version check** - Notifies when a new Flox version is available
- **Manual version check command** - Check for Flox updates on demand
- **Setting to disable update checks** - Option to turn off automatic update notifications

#### Terminal Integration
- **Auto-update terminal environment** - Existing terminals receive new env vars on reactivation
- **Environment variable propagation** - Terminal sessions automatically get Flox environment variables

#### Services
- **Service logs command** - View logs for running services directly in VSCode

#### Installation & Setup
- **Flox installation detection** - Shows installation guidance when Flox CLI is not found
- **Install Flox page** - Quick link to Flox installation page

#### Distribution
- **Open VSX publishing** - Extension now available on Open VSX registry

### Changed
- **Renamed activation buttons** - Removed confusing "& Restart" terminology
- **Moved "Edit manifest.toml" button** - Now in packages section for better discoverability
- **Removed redundant text from Commands view** - Cleaner, more focused UI
- **Improved notifications** - More consistent and non-blocking notification messages

### Fixed
- **Auto-reactivation control** - Prevents auto-reactivation when manifest.toml is manually edited
- **Schema validation** - Checks for env.json before attempting validation
- **Corrupted environment handling** - Gracefully handles incomplete Flox environments
- **Package installation** - Uses correct `pkg_path` instead of `attr_path` for catalog packages
- **Lock file parsing** - Prevents errors when lock file doesn't exist yet
- **View state consistency** - Resolved issues with view colors and state (#191, #192, #194, #195)
- **Orphaned process** - Fixed issue where activate.sh could become orphaned
- **JSON parsing** - Corrected parsing for services status data
- **Test infrastructure** - Improved tests to not interfere with project files

## [0.0.2] - 2025-02-11

- Basic Flox environment management
- Package installation/removal
- Services start/stop/restart
- Environment variables view
- manifest.toml editing

## [0.0.1] - 2025-01-30

- Initial release of Flox VSCode extension