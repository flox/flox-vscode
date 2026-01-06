# Flox VSCode Extension - Activation Flow

This document explains the complete activation flow of the Flox VSCode extension, including all phases, state management, and IPC communication.

## Overview

The Flox extension activation is a multi-phase process that:
1. Detects if a Flox environment exists in the workspace
2. Optionally prompts the user to activate
3. Spawns a background `flox activate` process
4. Captures environment variables via IPC
5. Applies those variables to VSCode terminals

## Architecture Diagram

```mermaid
graph TB
    subgraph "VSCode Extension"
        EXT[extension.ts<br/>Entry Point]
        ENV[env.ts<br/>Core Logic]
        VIEW[view.ts<br/>UI Components]
        WS[Workspace State]

        EXT --> ENV
        ENV --> VIEW
        EXT --> WS
        ENV --> WS
    end

    subgraph "Background Process"
        SPAWN[Child Process<br/>spawn]
        SCRIPT[activate.sh]

        ENV -->|spawn| SPAWN
        SPAWN -->|runs| SCRIPT
        SCRIPT -->|IPC fd 3| ENV
    end

    subgraph "Flox CLI"
        FLOX[flox activate]
        SCRIPT -->|runs inside| FLOX
    end
```

## Activation Phases

### Phase 1: User Initiates Activation

When the user clicks "Activate & Restart" or runs the `flox.activate` command:

```mermaid
sequenceDiagram
    participant User
    participant Command as flox.activate
    participant State as Workspace State
    participant VSCode

    User->>Command: Click "Activate & Restart"
    Command->>State: Set justActivated = true
    Command->>State: Set envActive = true
    Command->>VSCode: Restart extension host
    Note over VSCode: Extension restarts...
```

**Code location:** `src/extension.ts` - `flox.activate` command handler

```typescript
// Set flag to indicate we just activated
await context.workspaceState.update('flox.justActivated', true);
await context.workspaceState.update('flox.envActive', true);

// Restart extension host (local) or reload window (remote)
if (vscode.env.remoteName) {
  await vscode.commands.executeCommand('workbench.action.reloadWindow');
} else {
  await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
}
```

### Phase 2: Extension Restart & Post-Activation

After restart, the extension checks if it was just activated:

```mermaid
flowchart TD
    A[Extension activates] --> B{Check justActivated flag}
    B -->|true| C[Clear justActivated flag]
    B -->|false| D[Normal startup]
    C --> E[spawnActivateProcess]
    E --> F[Apply env vars to terminals]
    D --> G{Environment exists?}
    G -->|yes| H{Auto-activate enabled?}
    G -->|no| I[Show 'Create environment']
    H -->|yes| J[Prompt to activate]
    H -->|no| K[Wait for user action]
```

**Code location:** `src/extension.ts` - post-activation flow

```typescript
const justActivated = context.workspaceState.get<boolean>('flox.justActivated');
if (justActivated) {
  // Clear the flag
  await context.workspaceState.update('flox.justActivated', false);

  // Spawn the activation process
  await env.spawnActivateProcess((envVars) => {
    env.applyEnvironmentVariables(envVars);
  });
}
```

### Phase 3: Background Process Spawning

The extension spawns `flox activate -- activate.sh` as a long-running child process:

```mermaid
sequenceDiagram
    participant Ext as Extension
    participant Spawn as Child Process
    participant Flox as flox activate
    participant Script as activate.sh

    Ext->>Spawn: spawn with IPC stdio
    Spawn->>Flox: flox activate -- activate.sh
    Flox->>Script: Run script in activated env
    Script->>Script: Capture environment variables
    Script-->>Ext: IPC message (fd 3)
    Script->>Script: Sleep loop (keep alive)
```

**Code location:** `src/env.ts` - `spawnActivateProcess()`

```typescript
async spawnActivateProcess(callback: (envVars: Record<string, string>) => void): Promise<void> {
  const scriptPath = path.join(this.context.extensionPath, 'scripts', 'activate.sh');

  this.activateProcess = spawn('flox', ['activate', '--', scriptPath], {
    cwd: this.workspaceUri?.fsPath,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],  // fd 3 for IPC
    env: { ...process.env, FLOX_NO_INTERACTIVE: '1' }
  });

  // Listen for IPC messages from activate.sh
  this.activateProcess.on('message', (message: any) => {
    if (message.action === 'ready' && message.env) {
      callback(message.env);
    }
  });
}
```

### Phase 4: IPC Communication

The `activate.sh` script captures environment variables and sends them back via IPC:

```mermaid
sequenceDiagram
    participant Script as activate.sh
    participant IPC as IPC Channel (fd 3)
    participant Node as Node.js Extension
    participant Terms as VSCode Terminals

    Script->>Script: Source Flox environment
    Script->>Script: Capture all env vars
    Script->>Script: Build JSON message
    Script->>IPC: Write JSON to fd 3
    IPC->>Node: {"action":"ready","env":{...}}
    Node->>Node: Parse JSON
    Node->>Terms: Apply env vars
    Script->>Script: Sleep forever (keep process alive)
```

**Code location:** `scripts/activate.sh`

```bash
#!/usr/bin/env bash

# Capture all environment variables
declare -A env_vars
while IFS='=' read -r key value; do
  env_vars["$key"]="$value"
done < <(env)

# Build JSON message
json='{"action":"ready","env":{'
# ... build env JSON ...
json+='}}'

# Send via IPC (file descriptor 3)
echo "$json" >&3

# Keep process alive to maintain activation
while true; do
  sleep 86400
done
```

### Phase 5: Environment Variable Application

The extension applies captured env vars to VSCode's terminal environment:

```mermaid
flowchart LR
    A[Receive env vars] --> B{First activation?}
    B -->|yes| C[Store original env vars]
    B -->|no| D[Skip storing]
    C --> E[Apply to envVarCollection]
    D --> E
    E --> F[All new terminals<br/>have Flox env]
```

**Code location:** `src/env.ts` - `applyEnvironmentVariables()`

```typescript
applyEnvironmentVariables(envVars: Record<string, string>): void {
  const collection = this.context.environmentVariableCollection;

  // Store original values on first activation
  if (!this.originalEnvVars) {
    this.originalEnvVars = { ...process.env };
  }

  // Apply each env var
  for (const [key, value] of Object.entries(envVars)) {
    collection.replace(key, value);
  }

  this.activatedEnvVars = envVars;
}
```

## State Management

### Workspace State Keys

| Key | Type | Description |
|-----|------|-------------|
| `flox.justActivated` | boolean | Set before restart, cleared after spawn |
| `flox.envActive` | boolean | Whether environment is currently active |
| `flox.autoActivate` | boolean/undefined | User preference for auto-activation |
| `flox.activatePid` | number | PID of background activate process |
| `flox.mcpSuggestionShown` | boolean | Whether MCP suggestion was shown |

### Context Keys (for UI conditions)

| Key | Type | Description |
|-----|------|-------------|
| `flox.isInstalled` | boolean | Whether Flox CLI is installed |
| `flox.envExists` | boolean | Whether .flox directory exists |
| `flox.envActive` | boolean | Whether environment is activated |
| `flox.hasPkgs` | boolean | Whether packages are installed |
| `flox.mcpAvailable` | boolean | Whether flox-mcp is available |
| `flox.copilotInstalled` | boolean | Whether GitHub Copilot is installed |

## Complete Activation Flow Diagram

```mermaid
flowchart TB
    subgraph "Phase 1: User Action"
        A[User clicks<br/>'Activate & Restart'] --> B[flox.activate command]
        B --> C[Set justActivated = true]
        C --> D[Set envActive = true]
        D --> E[Restart extension host]
    end

    subgraph "Phase 2: Extension Restart"
        E --> F[Extension.activate called]
        F --> G{justActivated?}
        G -->|no| H[Normal startup]
        G -->|yes| I[Clear justActivated flag]
        I --> J[spawnActivateProcess]
    end

    subgraph "Phase 3: Background Process"
        J --> K["spawn('flox', ['activate', '--', 'activate.sh'])"]
        K --> L[activate.sh runs inside flox activate]
    end

    subgraph "Phase 4: IPC Communication"
        L --> M[Capture all env vars]
        M --> N[Build JSON message]
        N --> O["Send via IPC (fd 3)"]
        O --> P[Extension receives message]
    end

    subgraph "Phase 5: Apply Environment"
        P --> Q[Parse env vars from JSON]
        Q --> R[applyEnvironmentVariables]
        R --> S[Update context keys]
        S --> T[Refresh views]
        T --> U[All new terminals<br/>have Flox env!]
    end

    L --> V[Sleep forever<br/>keep process alive]
```

## Deactivation Flow

```mermaid
sequenceDiagram
    participant User
    participant Cmd as flox.deactivate
    participant Env as env.ts
    participant Process as Background Process
    participant VSCode

    User->>Cmd: Run deactivate command
    Cmd->>Env: Kill background process
    Env->>Process: SIGTERM
    Process-->>Env: Process exits
    Cmd->>Env: Clear environment vars
    Env->>Env: Restore original env vars
    Cmd->>VSCode: Set envActive = false
    Cmd->>VSCode: Restart extension host
```

## File Watchers

The extension watches for changes to Flox environment files:

```mermaid
flowchart LR
    subgraph "File Changes"
        M[manifest.toml changed]
        L[manifest.lock changed]
    end

    subgraph "Actions"
        M -->|debounced| R[Reactivate environment]
        L --> V[Reload & refresh views]
    end
```

| Pattern | Action |
|---------|--------|
| `**/.flox/env/manifest.toml` | Trigger reactivation (debounced) |
| `**/.flox/env/manifest.lock` | Trigger reload (refresh views) |

## Debugging Tips

### Enable Logging

All activation steps are logged to the "Flox" output channel with prefixes:

| Prefix | Description |
|--------|-------------|
| `[STEP 1]` | User activation command |
| `[STEP 2]` | Post-activation flow |
| `[STEP 3]` | Reload/refresh |
| `[SPAWN]` | Background process spawning |
| `[RELOAD]` | Manifest parsing |
| `[MCP]` | MCP server detection |

### Common Issues

```mermaid
flowchart TD
    A[Activation Problem] --> B{What symptom?}

    B -->|Hangs forever| C[Check flox-mcp timeout]
    B -->|Auto-activate loop| D[Check envActive in BOTH<br/>context AND workspace state]
    B -->|Env vars not applied| E[Check IPC message format]
    B -->|Commands not found| F[Ensure auto-activate runs<br/>AFTER command registration]

    C --> C1[Add timeout to execFile]
    D --> D1[Update both: setContext + workspaceState]
    E --> E1[Debug activate.sh JSON output]
    F --> F1[Move auto-activate code after registerCommand]
```

### Testing Activation

Use the Happy Path integration tests:
```bash
npm run test:integration
```

The tests use VSCode commands to simulate user interactions:
```typescript
await vscode.commands.executeCommand('flox.init');
await vscode.commands.executeCommand('flox.activate');
```

## Performance Considerations

1. **MCP checks run in background** - Don't block activation for flox-mcp detection
2. **Skip redundant reloads** - When `justActivated` is true, skip the initial reload
3. **Debounce manifest changes** - Avoid rapid reactivation on file saves
4. **Timeout external commands** - Always set timeouts on CLI calls (e.g., 2s for version checks)

```mermaid
flowchart LR
    subgraph "Performance Optimizations"
        A[MCP check] -->|async, non-blocking| B[Don't await]
        C[Reload on justActivated] -->|skip| D[Already done in post-activation]
        E[Manifest changes] -->|debounce 500ms| F[Prevent rapid reactivation]
        G[CLI calls] -->|timeout 2s| H[Prevent hanging]
    end
```
