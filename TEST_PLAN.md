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

### TEST-011: Deactivate Environment
**Prerequisites:** Activated Flox environment

- [ ] Run Command Palette → "Flox: Deactivate"
- [ ] VSCode reloads
- [ ] Environment is no longer active
- [ ] Sidebar shows "Activate & Restart" button
- [ ] New terminals don't have Flox environment variables

---

## 4. Environment Initialization

### TEST-012: Create New Environment
**Prerequisites:** Workspace WITHOUT `.flox/` directory

- [ ] Run Command Palette → "Flox: Init"
- [ ] `.flox/env/manifest.toml` is created
- [ ] Sidebar updates to show environment options

---

## 5. Package Management

### TEST-013: Install Package
**Prerequisites:** Activated Flox environment

- [ ] Click "+" button in Packages view OR run "Flox: Install"
- [ ] Package picker appears
- [ ] Select a package (e.g., `hello`)
- [ ] Package appears in sidebar
- [ ] `manifest.toml` updated with package

### TEST-014: Uninstall Package
**Prerequisites:** Environment with at least one package installed

- [ ] Right-click package in sidebar → "Uninstall"
- [ ] Package removed from sidebar
- [ ] `manifest.toml` updated (package removed)

### TEST-015: Pending Indicator - Package
**Prerequisites:** Activated environment with lock file

- [ ] Manually edit `manifest.toml` to add a package in `[install]` section
- [ ] Save file
- [ ] Sidebar shows package with `*` suffix and warning color
- [ ] Tooltip explains "pending" state
- [ ] Run `flox activate` (via CLI or deactivate/reactivate)
- [ ] `*` indicator disappears (package committed to lock)

---

## 6. Environment Variables

### TEST-016: View Variables
**Prerequisites:** Environment with variables in manifest

- [ ] Add `[vars]` section to `manifest.toml` with `TEST_VAR = "value"`
- [ ] Activate environment
- [ ] Variables view shows TEST_VAR
- [ ] Open new terminal
- [ ] Run `echo $TEST_VAR` - shows "value"

### TEST-017: Pending Indicator - Variable
**Prerequisites:** Activated environment with lock file

- [ ] Add new variable to `manifest.toml` `[vars]` section
- [ ] Save file
- [ ] Variable appears with `*` suffix in Variables view
- [ ] Run `flox activate` to commit
- [ ] `*` indicator disappears

---

## 7. Services

### TEST-018: View Services
**Prerequisites:** Environment with service defined

- [ ] Add service to `manifest.toml`:
  ```toml
  [services.test-svc]
  command = "echo hello && sleep 60"
  ```
- [ ] Activate environment
- [ ] Services view shows "test-svc"

### TEST-019: Start/Stop Service
**Prerequisites:** Environment with service defined

- [ ] Click play button on service in sidebar
- [ ] Service status changes to "running"
- [ ] Click stop button
- [ ] Service status changes to "stopped"

### TEST-020: Service Restart
**Prerequisites:** Running service

- [ ] Start a service
- [ ] Click restart button on running service
- [ ] Service stops and starts again
- [ ] Status returns to "running"

### TEST-021: Service Logs
**Prerequisites:** Running service

- [ ] Start a service
- [ ] Click "Show Logs" button (only visible when running)
- [ ] Terminal opens with `flox services logs --follow`
- [ ] Click "Show Logs" again
- [ ] Same terminal is focused (not new one created)

### TEST-022: Service Logs via Command Palette
**Prerequisites:** At least one running service

- [ ] Run Command Palette → "Flox: Show service logs"
- [ ] QuickPick shows only running services
- [ ] Select service
- [ ] Terminal opens with logs

### TEST-023: Pending Indicator - Service
**Prerequisites:** Activated environment with lock file

- [ ] Add new service to `manifest.toml`
- [ ] Save file
- [ ] Service appears with `*` suffix in Services view
- [ ] Run `flox activate` to commit
- [ ] `*` indicator disappears

---

## 8. Auto-Reactivate on Manifest Changes

### TEST-024: Auto-Reactivate When Active
**Prerequisites:** Activated environment

- [ ] Edit `manifest.toml` (add/remove package or variable)
- [ ] Save file
- [ ] Wait 1-2 seconds (500ms debounce)
- [ ] Sidebar refreshes automatically
- [ ] New env vars applied to terminals

### TEST-025: Debounce Rapid Edits
**Prerequisites:** Activated environment

- [ ] Make multiple rapid edits to `manifest.toml` (save multiple times quickly)
- [ ] Only ONE reactivation occurs (check Output panel logs)

---

## 9. Debug Output Channel

### TEST-026: Output Channel Exists
**Prerequisites:** Extension installed

- [ ] Open Output panel (View → Output)
- [ ] "Flox" appears in dropdown
- [ ] Select "Flox"
- [ ] Logs are visible

### TEST-027: Startup Logs
**Prerequisites:** Fresh VSCode window

- [ ] Open Output panel → "Flox"
- [ ] Logs show system info (platform, VSCode version)
- [ ] Logs show workspace path

### TEST-028: Command Logs
**Prerequisites:** Flox environment

- [ ] Run any Flox command (e.g., "Flox: Init")
- [ ] Open Output panel → "Flox"
- [ ] Command execution is logged

### TEST-029: File Change Logs
**Prerequisites:** Flox environment

- [ ] Edit `manifest.toml`
- [ ] Open Output panel → "Flox"
- [ ] File change event is logged

---

## 10. MCP Integration

### TEST-030: MCP Prerequisites Check
**Prerequisites:** VSCode 1.102+, GitHub Copilot installed, `flox-mcp` in PATH

- [ ] Activate Flox environment
- [ ] Notification appears: "Flox Agentic MCP server is available!"
- [ ] "Configure MCP" and "Learn More" buttons visible

### TEST-031: Configure MCP
**Prerequisites:** TEST-030 passed

- [ ] Click "Configure MCP" button
- [ ] Success message appears
- [ ] MCP tools available in Copilot Chat agent mode

### TEST-032: MCP Graceful Degradation
**Prerequisites:** VSCode < 1.102 OR no GitHub Copilot OR no flox-mcp

- [ ] Activate Flox environment
- [ ] NO crash occurs
- [ ] Helpful error message if running "Flox: Configure MCP" manually

### TEST-033: No Duplicate MCP Notification
**Prerequisites:** MCP previously configured

- [ ] Deactivate and reactivate environment
- [ ] Notification does NOT appear again (one-time only)

---

## 11. Other Commands

### TEST-034: Edit Manifest
**Prerequisites:** Flox environment exists

- [ ] Run Command Palette → "Flox: Edit"
- [ ] `manifest.toml` opens in editor

### TEST-035: Search Packages
**Prerequisites:** Flox installed

- [ ] Run Command Palette → "Flox: Search"
- [ ] Search interface appears
- [ ] Enter package name
- [ ] Results are displayed

### TEST-036: Show Version
**Prerequisites:** Flox installed

- [ ] Run Command Palette → "Flox: Show version"
- [ ] Version information displayed

---

## 12. Edge Cases

### TEST-037: No Workspace Open
**Prerequisites:** VSCode with no folder open

- [ ] Extension loads without errors
- [ ] Sidebar shows appropriate message

### TEST-038: Invalid Manifest
**Prerequisites:** Flox environment with syntax error in manifest.toml

- [ ] Save invalid manifest
- [ ] Extension handles gracefully (no crash)
- [ ] Error logged to Output panel

### TEST-039: Flox CLI Errors
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
| Activation Flow | 7 | | |
| Environment Init | 1 | | |
| Package Management | 3 | | |
| Environment Variables | 2 | | |
| Services | 6 | | |
| Auto-Reactivate | 2 | | |
| Debug Output | 4 | | |
| MCP Integration | 4 | | |
| Other Commands | 3 | | |
| Edge Cases | 3 | | |
| **TOTAL** | **39** | | |

---

## Notes

_Add any notes, issues discovered, or observations during testing:_

-
-
-

---

**Tested by:** _________________ **Date:** _____________ **Version:** _____________
