# Manual Test Plan

This document contains manual test cases to verify after each release. Run through these tests to ensure all features work correctly.

## Prerequisites

- Flox CLI installed (`flox --version` works)
- VSCode 1.87.0 or higher (1.102+ for MCP features)
- A test workspace directory (not the extension source code)

---

## 1. Installation Detection

### TEST-001: Flox Not Installed
**Prerequisites:** Uninstall or rename Flox CLI temporarily

- [ ] Open VSCode with extension installed
- [ ] Sidebar shows "Flox is not installed" message
- [ ] "Install Flox" button is visible
- [ ] Click "Install Flox" opens flox.dev/docs/install-flox in browser
- [ ] Package/Variables/Services views are hidden

### TEST-002: Flox Installed
**Prerequisites:** Flox CLI installed and in PATH

- [ ] Open VSCode with extension installed
- [ ] Sidebar shows normal UI (not "not installed" message)
- [ ] All views (Packages, Variables, Services) are visible

---

## 2. Version Update Check

### TEST-003: Update Check Runs
**Prerequisites:** Flox installed

- [ ] Open Output panel, select "Flox"
- [ ] Look for update check log message on startup
- [ ] If newer version available: notification appears with "Upgrade" button
- [ ] Click "Upgrade" opens upgrade instructions page

### TEST-004: Disable Update Check
**Prerequisites:** Flox installed

- [ ] Set `flox.checkForUpdates` to `false` in settings
- [ ] Reload window
- [ ] Open Output panel, select "Flox"
- [ ] Verify NO update check log message appears

---

## 3. Activation Flow

### TEST-005: Prompt to Activate
**Prerequisites:** Workspace with `.flox/` directory, environment NOT activated

- [ ] Open workspace with Flox environment
- [ ] Popup appears asking to activate
- [ ] Three options visible: "Always Activate", "Activate Once", "Never Activate"

### TEST-006: Always Activate Preference
**Prerequisites:** Complete TEST-005

- [ ] Click "Always Activate"
- [ ] Environment activates (VSCode reloads)
- [ ] Close and reopen workspace
- [ ] Environment auto-activates WITHOUT showing popup

### TEST-007: Never Activate Preference
**Prerequisites:** Fresh workspace with `.flox/` directory

- [ ] Open workspace, popup appears
- [ ] Click "Never Activate"
- [ ] Popup dismissed, environment NOT activated
- [ ] Close and reopen workspace
- [ ] NO popup shown, environment NOT activated

### TEST-008: Activate Once
**Prerequisites:** Fresh workspace with `.flox/` directory

- [ ] Open workspace, popup appears
- [ ] Click "Activate Once"
- [ ] Environment activates (VSCode reloads)
- [ ] Close and reopen workspace
- [ ] Popup appears AGAIN (preference not remembered)

### TEST-009: Disable Activation Prompt Globally
**Prerequisites:** Fresh workspace with `.flox/` directory

- [ ] Set `flox.promptToActivate` to `false` in settings
- [ ] Open workspace with Flox environment
- [ ] NO popup appears
- [ ] Environment is NOT auto-activated

### TEST-010: Activation Speed
**Prerequisites:** Workspace with Flox environment

- [ ] Time the activation process
- [ ] Should complete in under 2 seconds (not 15+ seconds)

### TEST-011: Reset Activation Preference ([#188](https://github.com/flox/flox-vscode/issues/188))
**Prerequisites:** Workspace where "Always Activate" or "Never Activate" was previously selected

- [ ] Run Command Palette → "Flox: Reset Activation Preference"
- [ ] Notification confirms preference was reset
- [ ] Close and reopen workspace
- [ ] Activation prompt appears again (preference no longer remembered)
- [ ] Test resetting "Always Activate" preference
- [ ] Test resetting "Never Activate" preference

### TEST-012: Activity Bar Badge Indicator
**Prerequisites:** Workspace with Flox environment

- [ ] When environment is NOT activated: no badge on Flox icon in activity bar
- [ ] Activate environment
- [ ] Green checkmark badge appears on Flox activity bar icon
- [ ] Tooltip shows "Flox environment active"
- [ ] Deactivate environment
- [ ] Badge disappears

### TEST-013: Deactivate Environment
**Prerequisites:** Activated Flox environment

- [ ] Run Command Palette → "Flox: Deactivate"
- [ ] VSCode reloads
- [ ] Environment is no longer active
- [ ] Sidebar shows "Activate" button (not "Activate & Restart")
- [ ] New terminals don't have Flox environment variables

### TEST-054: Status Bar Indicator
**Prerequisites:** Workspace with Flox environment

- [ ] Status bar shows Flox logo icon
- [ ] When environment NOT activated: shows "Not Activated" (no background color)
- [ ] Activate environment
- [ ] Status bar shows "Activated" with green background
- [ ] Edit `manifest.toml` to add a new package (without reactivating)
- [ ] Status bar shows "Pending" with yellow/warning background
- [ ] Tooltip explains pending changes need reactivation
- [ ] Click status bar item → Flox sidebar opens/focuses
- [ ] Reactivate environment → status returns to "Activated"

### TEST-055: Status Bar Visibility
**Prerequisites:** Various workspace states

- [ ] Workspace WITHOUT `.flox/` directory: status bar hidden
- [ ] Workspace WITH `.flox/` directory: status bar visible
- [ ] Initialize new environment → status bar appears

### TEST-056: Deactivate Resets Always-Activate Preference
**Prerequisites:** Workspace with "Always Activate" preference set

- [ ] Set "Always Activate" preference (click it when prompted)
- [ ] Run "Flox: Deactivate" command
- [ ] Close and reopen workspace
- [ ] Activation prompt appears again (preference was reset)

---

## 4. Environment Initialization

### TEST-014: Create New Environment ([#182](https://github.com/flox/flox-vscode/issues/182))
**Prerequisites:** Workspace WITHOUT `.flox/` directory

- [ ] Run Command Palette → "Flox: Init"
- [ ] `.flox/env/manifest.toml` is created
- [ ] Sidebar updates to show environment options
- [ ] Notification appears: "Flox environment created successfully"
- [ ] Notification includes "Learn More" button linking to Flox docs

---

## 5. Package Management

### TEST-015: Install Package
**Prerequisites:** Activated Flox environment

- [ ] Click "+" button in Packages view OR run "Flox: Install"
- [ ] Package picker appears
- [ ] Select a package (e.g., `hello`)
- [ ] Package appears in sidebar
- [ ] `manifest.toml` updated with package

### TEST-016: Install Catalog Package ([#197](https://github.com/flox/flox-vscode/issues/197))
**Prerequisites:** Activated Flox environment

- [ ] Click "+" button in Packages view OR run "Flox: Install"
- [ ] Search for "flox-mcp" (catalog package)
- [ ] QuickPick shows full path with catalog prefix (e.g., `flox/flox-mcp-server`)
- [ ] Select the package
- [ ] Package installs successfully (no error)
- [ ] Package appears in sidebar with catalog prefix
- [ ] Verify in `manifest.toml`: package entry uses correct catalog path

### TEST-017: Uninstall Package
**Prerequisites:** Environment with at least one package installed

- [ ] Right-click package in sidebar → "Uninstall"
- [ ] Package removed from sidebar
- [ ] `manifest.toml` updated (package removed)

### TEST-018: Pending Indicator - Package ([#191](https://github.com/flox/flox-vscode/issues/191))
**Prerequisites:** Activated environment with lock file

- [ ] Manually edit `manifest.toml` to add a package in `[install]` section
- [ ] Save file
- [ ] Sidebar shows package with `*` suffix and warning color
- [ ] Tooltip explains "pending" state
- [ ] Click "Activate" button in sidebar (triggers reactivation)
- [ ] After activation completes: `*` indicator disappears (package committed to lock)
- [ ] Package shows normal color (not pending)
- [ ] View correctly refreshes without needing manual reload

---

## 6. Environment Variables

### TEST-019: View Variables
**Prerequisites:** Environment with variables in manifest

- [ ] Add `[vars]` section to `manifest.toml` with `TEST_VAR = "value"`
- [ ] Activate environment
- [ ] Variables view shows TEST_VAR
- [ ] Open new terminal
- [ ] Run `echo $TEST_VAR` - shows "value"

### TEST-020: Pending Indicator - Variable ([#192](https://github.com/flox/flox-vscode/issues/192))
**Prerequisites:** Activated environment with lock file

- [ ] Add new variable to `manifest.toml` `[vars]` section
- [ ] Save file
- [ ] Variable appears with `*` suffix in Variables view
- [ ] Variable shows warning color (same as pending packages)
- [ ] Tooltip explains pending state
- [ ] Click "Activate" to commit changes
- [ ] `*` indicator disappears after activation
- [ ] Variable shows normal color

### TEST-021: Terminal Environment Updates ([#193](https://github.com/flox/flox-vscode/issues/193))
**Prerequisites:** Activated environment with existing terminal open

- [ ] Open a terminal while environment is active
- [ ] Edit `manifest.toml`, add a new variable `NEW_VAR = "test"`
- [ ] Click "Activate" to reactivate environment
- [ ] Check EXISTING terminal: run `echo $NEW_VAR`
- [ ] New variable should be available (terminals updated)
- [ ] Or: notification appears explaining to restart terminals
- [ ] Open NEW terminal and verify `echo $NEW_VAR` works

---

## 7. Services

### TEST-022: View Services
**Prerequisites:** Environment with service defined

- [ ] Add service to `manifest.toml`:
  ```toml
  [services.test-svc]
  command = "echo hello && sleep 60"
  ```
- [ ] Activate environment
- [ ] Services view shows "test-svc"

### TEST-023: Start/Stop Service
**Prerequisites:** Environment with service defined

- [ ] Click play button on service in sidebar
- [ ] Service status changes to "running"
- [ ] Click stop button
- [ ] Service status changes to "stopped"

### TEST-024: Service Restart
**Prerequisites:** Running service

- [ ] Start a service
- [ ] Click restart button on running service
- [ ] Service stops and starts again
- [ ] Status returns to "running"

### TEST-025: Service Logs
**Prerequisites:** Running service

- [ ] Start a service
- [ ] Click "Show Logs" button (only visible when running)
- [ ] Terminal opens with `flox services logs --follow`
- [ ] Click "Show Logs" again
- [ ] Same terminal is focused (not new one created)

### TEST-026: Service Logs via Command Palette
**Prerequisites:** At least one running service

- [ ] Run Command Palette → "Flox: Show service logs"
- [ ] QuickPick shows only running services
- [ ] Select service
- [ ] Terminal opens with logs

### TEST-027: Pending Indicator - Service ([#194](https://github.com/flox/flox-vscode/issues/194))
**Prerequisites:** Activated environment with lock file

- [ ] Add new service to `manifest.toml`
- [ ] Save file
- [ ] Service appears with `*` suffix in Services view
- [ ] Service shows warning color (pending state)
- [ ] Tooltip explains pending state
- [ ] Click "Activate" to commit
- [ ] `*` indicator disappears after activation
- [ ] Service shows normal color

### TEST-028: Service Color Coding ([#195](https://github.com/flox/flox-vscode/issues/195))
**Prerequisites:** Environment with at least one service defined and activated

- [ ] **Pending service**: Add new service to manifest, save (no activation)
  - Shows warning color with `*` suffix
- [ ] **Stopped service**: Service exists in lock but not running
  - Shows neutral/default color
- [ ] **Running service**: Start a service
  - Shows success/green color or running icon
- [ ] Colors are distinct and easily distinguishable at a glance
- [ ] Colors match VSCode theme (light/dark mode appropriate)

---

## 8. Auto-Reactivate on Manifest Changes

### TEST-029: Auto-Reactivate When Active
**Prerequisites:** Activated environment

- [ ] Edit `manifest.toml` (add/remove package or variable)
- [ ] Save file
- [ ] Wait 1-2 seconds (500ms debounce)
- [ ] Sidebar refreshes automatically
- [ ] New env vars applied to terminals

### TEST-030: Debounce Rapid Edits
**Prerequisites:** Activated environment

- [ ] Make multiple rapid edits to `manifest.toml` (save multiple times quickly)
- [ ] Only ONE reactivation occurs (check Output panel logs)

---

## 9. Debug Output Channel

### TEST-031: Output Channel Exists
**Prerequisites:** Extension installed

- [ ] Open Output panel (View → Output)
- [ ] "Flox" appears in dropdown
- [ ] Select "Flox"
- [ ] Logs are visible

### TEST-032: Startup Logs
**Prerequisites:** Fresh VSCode window

- [ ] Open Output panel → "Flox"
- [ ] Logs show system info (platform, VSCode version)
- [ ] Logs show workspace path

### TEST-033: Command Logs
**Prerequisites:** Flox environment

- [ ] Run any Flox command (e.g., "Flox: Init")
- [ ] Open Output panel → "Flox"
- [ ] Command execution is logged

### TEST-034: File Change Logs
**Prerequisites:** Flox environment

- [ ] Edit `manifest.toml`
- [ ] Open Output panel → "Flox"
- [ ] File change event is logged

---

## 10. MCP Integration

### TEST-035: MCP Prerequisites Check
**Prerequisites:** VSCode 1.102+, GitHub Copilot installed, `flox-mcp` in PATH

- [ ] Activate Flox environment
- [ ] Notification appears: "Flox MCP server is available!"
- [ ] "Configure MCP" and "Learn More" buttons visible

### TEST-036: Configure MCP
**Prerequisites:** TEST-035 passed

- [ ] Click "Configure MCP" button
- [ ] Success message appears
- [ ] MCP tools available in Copilot Chat agent mode

### TEST-037: MCP Graceful Degradation
**Prerequisites:** VSCode < 1.102 OR no GitHub Copilot OR no flox-mcp

- [ ] Activate Flox environment
- [ ] NO crash occurs
- [ ] Helpful error message if running "Flox: Configure MCP" manually

### TEST-038: No Duplicate MCP Notification
**Prerequisites:** MCP previously configured

- [ ] Deactivate and reactivate environment
- [ ] Notification does NOT appear again (one-time only)

### TEST-039: MCP Server Installation Prompt ([#196](https://github.com/flox/flox-vscode/issues/196))
**Prerequisites:** Activated Flox environment, `flox-mcp` NOT installed

- [ ] Activate environment without MCP server installed
- [ ] Notification appears: "Flox MCP server not found. Would you like to install it?"
- [ ] Three buttons visible: "Install MCP Server", "Learn More", "Not Now"
- [ ] Click "Install MCP Server"
- [ ] Progress notification shows installation in progress
- [ ] After installation: MCP configuration suggestion appears
- [ ] Verify `flox-mcp-server` appears in `manifest.toml`
- [ ] Test "Not Now" button - dismisses without installing
- [ ] Test "Learn More" button - opens documentation

---

## 11. Other Commands

### TEST-040: Edit Manifest
**Prerequisites:** Flox environment exists

- [ ] Run Command Palette → "Flox: Edit"
- [ ] `manifest.toml` opens in editor

### TEST-041: Search Packages
**Prerequisites:** Flox installed

- [ ] Run Command Palette → "Flox: Search"
- [ ] Search interface appears
- [ ] Enter package name
- [ ] Results are displayed

### TEST-042: Show Version
**Prerequisites:** Flox installed

- [ ] Run Command Palette → "Flox: Show version"
- [ ] Version information displayed

### TEST-043: Manual Version Check ([#189](https://github.com/flox/flox-vscode/issues/189))
**Prerequisites:** Flox installed

- [ ] Run Command Palette → "Flox: Check for Updates"
- [ ] Version check runs immediately
- [ ] If update available: notification shows with upgrade button
- [ ] If up to date: notification confirms current version is latest
- [ ] Works after updating Flox CLI without reloading VSCode

---

## 12. TOML Syntax Highlighting ([#49](https://github.com/flox/flox-vscode/issues/49))

### TEST-044: Manifest Syntax Highlighting
**Prerequisites:** Flox environment with `manifest.toml`

- [ ] Open `manifest.toml` file
- [ ] Syntax highlighting is active (no additional extensions needed)
- [ ] Table headers (`[install]`, `[hook]`, `[vars]`, etc.) are highlighted
- [ ] Comments (`#`) are properly highlighted in comment color
- [ ] Strings are highlighted in string color
- [ ] Numbers and booleans are highlighted appropriately
- [ ] Keys and values are visually distinct

### TEST-045: TOML Language Features
**Prerequisites:** Open a `.toml` file

- [ ] Comment toggling works (Cmd+/ or Ctrl+/)
- [ ] Bracket matching works for `[]`, `{}`, `""`
- [ ] Auto-closing pairs work (type `[` and `]` is inserted)

---

## 13. Manifest Validation ([#198](https://github.com/flox/flox-vscode/issues/198))

### TEST-046: TOML Syntax Error Detection
**Prerequisites:** Flox environment with `manifest.toml`

- [ ] Open `manifest.toml`
- [ ] Add a syntax error (e.g., missing closing quote: `FOO = "bar`)
- [ ] Save file
- [ ] Red squiggly line appears at error location
- [ ] Hover over error shows message: "TOML syntax error: ..."
- [ ] Error source shows "Flox (TOML)"
- [ ] Problems panel shows the error
- [ ] Fix the error and save
- [ ] Red squiggly line disappears

### TEST-047: Flox Schema Validation
**Prerequisites:** Activated Flox environment with `manifest.toml`

- [ ] Add invalid Flox content (e.g., `[install.!!!invalid]`)
- [ ] Save file
- [ ] Red squiggly line appears
- [ ] Error message explains Flox schema issue
- [ ] Error source shows "Flox (Schema)"
- [ ] Fix the error and save
- [ ] Error disappears

### TEST-048: Validation on Startup
**Prerequisites:** `manifest.toml` with existing error

- [ ] Create manifest with syntax error
- [ ] Close and reopen VSCode
- [ ] Error is detected and shown immediately on startup
- [ ] No manual save required to trigger validation

### TEST-049: Corrupted Environment Handling
**Prerequisites:** Corrupted or incomplete `.flox` directory

- [ ] Create `.flox` directory without proper `env.json`
- [ ] Open workspace
- [ ] Extension does NOT crash
- [ ] Validation is skipped gracefully
- [ ] User can still initialize a proper environment

---

## 14. Notification Quality ([#184](https://github.com/flox/flox-vscode/issues/184))

### TEST-050: Notification Clarity
**Prerequisites:** Flox installed

- [ ] All notifications are clear and understandable
- [ ] No "weird" or confusing messages
- [ ] Consistent tone across all notifications
- [ ] Action buttons have clear labels
- [ ] Notifications don't block user workflow (non-modal)

### TEST-051: Notification Actions
**Prerequisites:** Various operations

- [ ] "Learn More" buttons open correct documentation pages
- [ ] "Upgrade" buttons in version notifications work
- [ ] Action buttons are appropriately positioned

---

## 15. Edge Cases

### TEST-052: No Workspace Open
**Prerequisites:** VSCode with no folder open

- [ ] Extension loads without errors
- [ ] Sidebar shows appropriate message

### TEST-053: Invalid Manifest (Graceful Handling)
**Prerequisites:** Flox environment with syntax error in manifest.toml

- [ ] Save invalid manifest
- [ ] Extension handles gracefully (no crash)
- [ ] Validation errors shown via diagnostics
- [ ] Other extension features continue to work

### TEST-054: Flox CLI Errors
**Prerequisites:** Simulate CLI error (e.g., network issue during install)

- [ ] Error message shown to user
- [ ] Extension remains functional
- [ ] Error logged to Output panel

---

## Test Summary

| Category | Tests | Pass | Fail |
|----------|-------|------|------|
| Installation Detection | 2 | | |
| Version Update Check | 2 | | |
| Activation Flow | 12 | | |
| Environment Init | 1 | | |
| Package Management | 4 | | |
| Environment Variables | 3 | | |
| Services | 7 | | |
| Auto-Reactivate | 2 | | |
| Debug Output | 4 | | |
| MCP Integration | 5 | | |
| Other Commands | 4 | | |
| TOML Syntax Highlighting | 2 | | |
| Manifest Validation | 4 | | |
| Notification Quality | 2 | | |
| Edge Cases | 3 | | |
| **TOTAL** | **57** | | |

---

## Notes

_Add any notes, issues discovered, or observations during testing:_

-
-
-

---

**Tested by:** _________________ **Date:** _____________ **Version:** _____________
