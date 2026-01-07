import * as vscode from 'vscode';
import os from "os";
import { promises as fs } from "fs";
import { promisify } from 'util';
import { spawn, execFile, ExecOptions, ChildProcess } from 'child_process';
import { View, System, Packages, Package, Services, ItemState, Variable } from './config';

const EDITORS: { [key: string]: string } = {
  "vscodium": "codium",
  "visual studio code": "code",
  "cursor": "cursor",
};

interface CommandExecOptions {
  argv: Array<string>;
  cwd?: boolean;
}

interface Msg {
  action: string;
  env?: { [key: string]: string };
}

export default class Env implements vscode.Disposable {

  manifestWatcher: vscode.FileSystemWatcher;
  manifestLockWatcher: vscode.FileSystemWatcher;
  workspaceUri?: vscode.Uri;
  manifest?: any;
  tomlManifest?: any;  // Parsed manifest.toml for comparison
  lockExists: boolean = false;  // Track if lock file exists
  packages?: Packages;
  variables: Map<string, Variable> = new Map();  // Variables with state tracking
  servicesStatus?: Services;
  system?: System;
  views: View[];  // TODO: specify a type
  treeViews: vscode.TreeView<any>[] = [];  // Store TreeView instances for badge updates

  context: vscode.ExtensionContext;
  error = new vscode.EventEmitter<unknown>();
  floxActivateProcess: ChildProcess | undefined;
  isEnvActive: boolean = false;
  isActivationInProgress: boolean = false;  // Track activation state
  originalEnvVars: { [key: string]: string } = {};
  activatedEnvVars: { [key: string]: string } = {};
  private output?: vscode.OutputChannel;
  private manifestChangeTimeout: NodeJS.Timeout | undefined;
  private isReactivating: boolean = false;
  private _isFloxInstalled: boolean = false;

  constructor(
    ctx: vscode.ExtensionContext,
    workspaceUri?: vscode.Uri,
    output?: vscode.OutputChannel,
  ) {
    this.context = ctx;
    this.output = output;
    this.error.event((e) => this.onError(e));
    if (!workspaceUri && vscode.workspace.workspaceFolders) {
      this.workspaceUri = vscode.workspace.workspaceFolders[0].uri;
    } else {
      this.workspaceUri = workspaceUri;
    }

    // Creating file watcher to watch for events on manifest files
    this.manifestWatcher = vscode.workspace.createFileSystemWatcher("**/.flox/env/manifest.toml", false, false, false);
    this.manifestWatcher.onDidDelete(async _ => {
      this.log('manifest.toml file deleted');
      await this.reload();
    });
    this.manifestWatcher.onDidCreate(async _ => {
      this.log('manifest.toml file created');
      await this.reload();
    });
    this.manifestWatcher.onDidChange(async _ => {
      this.log('manifest.toml file changed');

      // Clear pending debounce timer
      if (this.manifestChangeTimeout) {
        clearTimeout(this.manifestChangeTimeout);
      }

      // Debounce: wait 500ms after last change
      this.manifestChangeTimeout = setTimeout(async () => {
        this.manifestChangeTimeout = undefined;

        if (this.isEnvActive) {
          // Active: full reactivation to capture new env vars
          await this.reactivateEnvironment();
        } else {
          // Inactive: just refresh UI
          await this.exec("flox", { argv: ["activate", "--dir", this.workspaceUri?.fsPath || '', "--", "true"] });
          await this.reload();
        }
      }, 500);
    });

    this.manifestLockWatcher = vscode.workspace.createFileSystemWatcher("**/.flox/env/manifest.lock", false, false, false);
    this.manifestLockWatcher.onDidDelete(async _ => {
      this.log('manifest.lock file deleted');
      await this.reload();
    });
    this.manifestLockWatcher.onDidCreate(async _ => {
      this.log('manifest.lock file created');
      await this.reload();
    });
    this.manifestLockWatcher.onDidChange(async _ => {
      this.log('manifest.lock file changed');
      await this.reload();
    });

    this.views = [];

    // Detect system
    const platform = os.platform();
    const arch = os.arch();
    switch (`${arch}-${platform}`) {
      case "arm64-darwin":
        this.system = System.AARCH64_DARWIN;
        break;
      case "arm64-linux":
        this.system = System.AARCH64_LINUX;
        break;
      case "x64-linux":
        this.system = System.X86_64_LINUX;
        break;
      case "x64-darwin":
        this.system = System.X86_64_DARWIN;
        break;
      default:
        this.displayError(`Unsupported system: ${arch}-${platform}`);
    }
  }

  async fileExists(file: vscode.Uri): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(file);
    } catch (e) {
      return false;
    }
    return true;
  }

  async loadFile(file: vscode.Uri): Promise<any> {
    if (await this.fileExists(file)) {
      try {
        const data: string = await fs.readFile(file.fsPath, 'utf-8');
        if (file.fsPath.endsWith('.toml')) {
          let TOML = await import('smol-toml');
          return TOML.parse(data);
        } else if (file.fsPath.endsWith('.lock')) {
          return JSON.parse(data);
        }
      } catch (e: any) {
        const filename = file.fsPath.split('/').reverse()[0];
        if (e.line && e.column && e.message) {
          this.logError(`Parsing ${filename} failed at line ${e.line}, column ${e.column}`, e.message);
        } else {
          this.logError(`Parsing ${filename} failed`, e);
        }
      }
    }
    return undefined;
  }

  /**
   * Merge packages from lock file (ACTIVE) and toml file (PENDING).
   * Items only in toml are marked as PENDING.
   */
  private mergePackages(lockExists: boolean) {
    this.packages = new Map();

    // Get install IDs from lock file (these are ACTIVE)
    const lockInstallIds = new Set<string>();
    if (this.manifest?.packages) {
      for (const p of this.manifest.packages) {
        lockInstallIds.add(p.install_id);
      }
    }

    // Get install IDs from toml file
    const tomlInstallIds = new Set<string>();
    if (this.tomlManifest?.install) {
      for (const key of Object.keys(this.tomlManifest.install)) {
        tomlInstallIds.add(key);
      }
    }

    // Build packages map for each system
    for (const system in System) {
      const systemValue = System[system as keyof typeof System];
      const pkgsForSystem: Map<string, Package> = new Map();

      // Add packages from lock file (ACTIVE)
      if (this.manifest?.packages) {
        for (const p of this.manifest.packages) {
          if (p.system === systemValue) {
            // Check if this package has pending changes in toml
            const tomlPkg = this.tomlManifest?.install?.[p.install_id];
            const hasPendingChanges = tomlPkg && this.packageHasChanges(p, tomlPkg);

            pkgsForSystem.set(p.install_id, {
              install_id: p.install_id,
              system: p.system,
              version: p.version,
              group: p.group,
              license: p.license,
              description: p.description,
              attr_path: p.attr_path,
              state: hasPendingChanges ? ItemState.PENDING : ItemState.ACTIVE,
            });
          }
        }
      }

      // Add packages only in toml (PENDING)
      if (this.tomlManifest?.install) {
        for (const [installId, tomlPkg] of Object.entries(this.tomlManifest.install)) {
          if (!lockInstallIds.has(installId)) {
            const pkg = tomlPkg as any;
            pkgsForSystem.set(installId, {
              install_id: installId,
              system: systemValue,
              version: '(pending)',
              group: 'toplevel',
              license: '',
              description: '',
              attr_path: pkg['pkg-path'] || installId,
              state: ItemState.PENDING,
            });
          }
        }
      }

      this.packages.set(systemValue, pkgsForSystem);
    }
  }

  /**
   * Check if a package has changes between lock and toml.
   */
  private packageHasChanges(lockPkg: any, tomlPkg: any): boolean {
    // Compare pkg-path if specified in toml
    if (tomlPkg['pkg-path'] && tomlPkg['pkg-path'] !== lockPkg.attr_path) {
      return true;
    }
    // Compare version if specified in toml
    if (tomlPkg.version && tomlPkg.version !== lockPkg.version) {
      return true;
    }
    return false;
  }

  /**
   * Merge variables from lock file (ACTIVE) and toml file (PENDING).
   * Items only in toml are marked as PENDING.
   */
  private mergeVariables(lockExists: boolean) {
    this.variables = new Map();

    // Get vars from lock file (these are ACTIVE)
    const lockVars = this.manifest?.manifest?.vars || {};

    // Get vars from toml file
    const tomlVars = this.tomlManifest?.vars || {};

    // Add vars from lock file (ACTIVE)
    for (const [name, value] of Object.entries(lockVars)) {
      const tomlValue = tomlVars[name];
      const hasPendingChanges = tomlValue !== undefined && tomlValue !== value;

      this.variables.set(name, {
        name,
        value: value as string,
        state: hasPendingChanges ? ItemState.PENDING : ItemState.ACTIVE,
      });
    }

    // Add vars only in toml (PENDING)
    for (const [name, value] of Object.entries(tomlVars)) {
      if (!this.variables.has(name)) {
        this.variables.set(name, {
          name,
          value: value as string,
          state: lockExists ? ItemState.PENDING : ItemState.ACTIVE,
        });
      }
    }
  }

  /**
   * Get the state for a service based on lock/toml comparison.
   */
  getServiceState(serviceName: string, lockExists: boolean): ItemState {
    const lockServices = this.manifest?.manifest?.services || {};
    const tomlServices = this.tomlManifest?.services || {};

    const inLock = serviceName in lockServices;
    const inToml = serviceName in tomlServices;

    if (!lockExists) {
      // No lock file, everything is active (or pending if you prefer)
      return ItemState.ACTIVE;
    }

    if (inLock && inToml) {
      // In both - check if they differ
      const lockService = lockServices[serviceName];
      const tomlService = tomlServices[serviceName];
      if (JSON.stringify(lockService) !== JSON.stringify(tomlService)) {
        return ItemState.PENDING;
      }
      return ItemState.ACTIVE;
    }

    if (inToml && !inLock) {
      // Only in toml = pending
      return ItemState.PENDING;
    }

    // Only in lock = active
    return ItemState.ACTIVE;
  }

  /**
   * Get merged service names from both lock and toml.
   */
  getMergedServiceNames(): string[] {
    const lockServices = this.manifest?.manifest?.services || {};
    const tomlServices = this.tomlManifest?.services || {};

    const serviceNames = new Set<string>();
    for (const name of Object.keys(lockServices)) {
      serviceNames.add(name);
    }
    for (const name of Object.keys(tomlServices)) {
      serviceNames.add(name);
    }
    return Array.from(serviceNames);
  }

  // initialize Flox environment
  async reload() {
    this.log('Reloading environment...');

    // if there is no workspaceUri, we don't have a workspace to work with
    if (!this.workspaceUri) {
      this.log('No workspace URI, skipping reload');
      return;
    }

    this.log(`Workspace: ${this.workspaceUri.fsPath}`);

    // We only work with single root workspaces or we will only
    // activate an environment from the first workspace
    const manifestFile = vscode.Uri.joinPath(this.workspaceUri, '.flox', 'env', 'manifest.toml');
    const manifestLockFile = vscode.Uri.joinPath(this.workspaceUri, '.flox', 'env', 'manifest.lock');

    // Load BOTH files for comparison
    const lockExists = await this.fileExists(manifestLockFile);
    const tomlExists = await this.fileExists(manifestFile);
    this.lockExists = lockExists;  // Store for views to use

    if (lockExists) {
      this.log(`Loading manifest from: ${manifestLockFile.fsPath}`);
      this.manifest = await this.loadFile(manifestLockFile);
    }
    if (tomlExists) {
      this.log(`Loading manifest from: ${manifestFile.fsPath}`);
      this.tomlManifest = await this.loadFile(manifestFile);
    }
    if (!lockExists && !tomlExists) {
      this.log('No manifest file found');
    }

    // If no lock file but toml exists, wrap toml in manifest structure
    if (!lockExists && tomlExists) {
      this.manifest = { manifest: this.tomlManifest };
    }

    // Merge packages from lock and toml, marking state
    this.mergePackages(lockExists);

    // Merge variables from lock and toml, marking state
    this.mergeVariables(lockExists);

    var exists = false;
    var hasPkgs = false;
    var hasVars = false;
    var hasServices = false;
    if (this.manifest || this.tomlManifest) {
      exists = true;
      // Check packages from both lock and toml
      const lockPkgs = this.manifest?.manifest?.install || {};
      const tomlPkgs = this.tomlManifest?.install || {};
      hasPkgs = Object.keys(lockPkgs).length > 0 || Object.keys(tomlPkgs).length > 0;
      // Check variables from merged map
      hasVars = this.variables.size > 0;
      // Check services from merged sources
      hasServices = this.getMergedServiceNames().length > 0;

      // Log summary of loaded manifest (use merged counts)
      const systemPkgs = this.packages?.get(this.system!) || new Map();
      const pkgCount = systemPkgs.size;
      const varCount = this.variables.size;
      const serviceCount = this.getMergedServiceNames().length;
      this.log(`Environment loaded: ${pkgCount} packages, ${varCount} variables, ${serviceCount} services`);
    }

    this.log(`[RELOAD] Setting context and workspace state...`);
    await Promise.all([
      vscode.commands.executeCommand('setContext', 'flox.envExists', exists),
      vscode.commands.executeCommand('setContext', 'flox.hasPkgs', hasPkgs),
      vscode.commands.executeCommand('setContext', 'flox.hasVars', hasVars),
      vscode.commands.executeCommand('setContext', 'flox.hasServices', hasServices),
      this.context.workspaceState.update('flox.envExists', exists),
      this.context.workspaceState.update('flox.hasPkgs', hasPkgs),
      this.context.workspaceState.update('flox.hasVars', hasVars),
      this.context.workspaceState.update('flox.hasServices', hasServices)
    ]);
    this.log(`[RELOAD] Context and workspace state set`);

    // Check if the environment is active
    this.log(`[RELOAD] Setting flox.envActive to ${this.isEnvActive}`);
    await Promise.all([
      vscode.commands.executeCommand('setContext', 'flox.envActive', this.isEnvActive),
      this.context.workspaceState.update('flox.envActive', this.isEnvActive)
    ]);
    this.log(`[RELOAD] flox.envActive set (context and workspace state)`);
    this.updateActivityBadge();

    // Check for services status
    if (hasServices === true) {
      this.log(`[RELOAD] Checking services status...`);
      const result = await this.exec(
        "flox",
        { argv: ["services", "status", "--json", "--dir", this.workspaceUri?.fsPath || ''] },
        (error) => {
          // XXX: This is a hack to avoid showing an error message when the services are not started
          //      Remove once this will be fixed in Flox cli
          if (error?.message && error.message.includes("ERROR: Services not started or quit unexpectedly.")) {
            return false;
          }
          return true;
        },
      );
      this.servicesStatus = new Map();
      if (result?.stdout) {
        const servicesJson = typeof result.stdout === 'string' ? result.stdout : result.stdout.toString();
        if (servicesJson.startsWith('(')) {
          // This handles an older version of flox services status json output
          for (const data of servicesJson.split('\n')) {
            if (data.length === 0) {
              continue;
            }
            const service = JSON.parse(data);
            this.servicesStatus.set(service?.name, service);
          }
        } else if (servicesJson.length > 0 && servicesJson !== '' && servicesJson !== '[]') {
          const services = JSON.parse(servicesJson);
          for (const service of services) {
            this.servicesStatus.set(service?.name, service);
          }
        }
      }
      this.log(`[RELOAD] Services status checked`);
    } else {
      this.log(`[RELOAD] No services to check (hasServices=false)`);
    }

    // Check if MCP availability changed (environment might have flox-mcp now)
    // Run this in the background to avoid blocking activation
    this.log(`[RELOAD] Checking MCP availability (isEnvActive=${this.isEnvActive})...`);
    if (this.isEnvActive) {
      this.log(`[RELOAD] Starting background MCP check (non-blocking)...`);

      // Fire and forget - don't await this!
      this.checkFloxMcpAvailable().then(async (mcpAvailable) => {
        this.log(`[RELOAD] MCP available: ${mcpAvailable}`);
        const previousMcpState = this.context.workspaceState.get('flox.mcpAvailable', false);

        if (mcpAvailable !== previousMcpState) {
          this.log(`[RELOAD] MCP state changed from ${previousMcpState} to ${mcpAvailable}`);
          await this.setFloxMcpAvailable(mcpAvailable);

          // If MCP just became available, trigger suggestion
          if (mcpAvailable && this.checkCopilotInstalled()) {
            this.log(`[RELOAD] Showing MCP suggestion...`);
            await this.showMcpSuggestion();
            this.log(`[RELOAD] MCP suggestion shown`);
          }
        } else {
          this.log(`[RELOAD] MCP state unchanged (${mcpAvailable})`);
        }
      }).catch((error) => {
        this.log(`[RELOAD] MCP check error: ${error}`);
      });

      this.log(`[RELOAD] MCP check started in background, continuing...`);
    } else {
      this.log(`[RELOAD] Skipping MCP check (environment not active)`);
    }

    // Refresh all UI components (we need to do this last)
    this.log(`[RELOAD] Refreshing views (${this.views.length} views)...`);
    if (this.manifest) {
      for (const view of this.views) {
        if (view?.refresh) {
          this.log(`[RELOAD] Refreshing view...`);
          await view.refresh();
        }
      }
      this.log(`[RELOAD] All views refreshed`);
    } else {
      this.log(`[RELOAD] No manifest, skipping view refresh`);
    }
    this.log(`[RELOAD] Reload complete!`);
  }

  dispose() {
    // Clear any pending reactivation timer
    if (this.manifestChangeTimeout) {
      clearTimeout(this.manifestChangeTimeout);
      this.manifestChangeTimeout = undefined;
    }
    this.manifestWatcher.dispose();
    this.manifestLockWatcher.dispose();
    // Kill the activate process to prevent orphaned sleep processes
    this.killActivateProcess(true);
  }

  private async onError(error: unknown) {
    await this.displayError(error);
  }

  /**
   * Log a message to the Flox output channel with timestamp.
   * @param message - The message to log
   */
  public log(message: string) {
    const timestamp = new Date().toISOString();
    this.output?.appendLine(`[${timestamp}] ${message}`);
  }

  /**
   * Log an error message to the Flox output channel with timestamp.
   * @param message - The error message to log
   * @param error - Optional error object for additional context
   */
  public logError(message: string, error?: unknown) {
    const timestamp = new Date().toISOString();
    this.output?.appendLine(`[${timestamp}] ERROR: ${message}`);
    if (error) {
      if (error instanceof Error) {
        this.output?.appendLine(`  ${error.message}`);
        if (error.stack) {
          this.output?.appendLine(`  ${error.stack}`);
        }
      } else {
        this.output?.appendLine(`  ${error}`);
      }
    }
  }

  public async displayMsg(message: string) {
    this.log(message);
    await vscode.window.showInformationMessage(message);
  }

  public async displayError(error: unknown) {
    var message: string = "";
    if (typeof error === 'string') {
      message = error;
    } else if (error instanceof Error) {
      message = error.message;
    }
    if (message !== undefined) {
      this.logError(message, error);
      const displayMessage = message.startsWith('Error:') ? message : `Error: ${message}`;
      await vscode.window.showErrorMessage(displayMessage);
    }
  }

  public registerView(viewName: string, view: any) {
    this.context.subscriptions.push(view.registerProvider(viewName));
    view.env = this;
    this.views.push(view);
  }

  public registerCommand(commandName: string, command: (...args: any[]) => any) {
    const tryCommand = async (...args: any[]) => {
      try {
        return await command(...args);
      } catch (error) {
        this.error.fire(error);
      }
    };
    this.context.subscriptions.push(
      vscode.commands.registerCommand(
        commandName,
        tryCommand,
      ));
  }

  /**
   * Register TreeView instances for badge updates.
   * Called from extension.ts after creating TreeView objects.
   */
  public registerTreeViews(treeViews: vscode.TreeView<any>[]) {
    this.treeViews = treeViews;
    this.log('TreeView instances registered for badge updates');
  }

  /**
   * Update badge on all TreeViews based on environment active state.
   * Shows a green checkmark when environment is active.
   */
  private updateActivityBadge() {
    if (this.treeViews.length === 0) {
      this.log('No TreeViews registered, skipping badge update');
      return;
    }

    const badge: vscode.ViewBadge | undefined = this.isEnvActive
      ? {
        tooltip: 'Flox environment is active',
        value: 1  // Show "1" to indicate active
      }
      : undefined;  // No badge when inactive

    for (const treeView of this.treeViews) {
      treeView.badge = badge;
    }

    this.log(`Activity badge ${this.isEnvActive ? 'set' : 'cleared'}`);
  }

  public async exec(command: string, options: CommandExecOptions, handleError?: (error: any) => boolean) {
    let execOptions: ExecOptions = {};
    if (options.cwd === null || options.cwd) {
      execOptions.cwd = this.workspaceUri?.fsPath;
    }

    const fullCommand = this.isEnvActive
      ? `flox activate --dir ${this.workspaceUri?.fsPath || ''} -- ${command} ${options.argv.join(' ')}`
      : `${command} ${options.argv.join(' ')}`;
    this.log(`Executing: ${fullCommand}`);

    try {
      let result;
      if (this.isEnvActive) {
        result = await promisify(execFile)('flox',
          ['activate', "--dir", this.workspaceUri?.fsPath || "", '--']
            .concat([command])
            .concat(options.argv),
          execOptions);
      } else {
        result = await promisify(execFile)(command, options.argv, execOptions);
      }
      this.log(`Command completed successfully`);
      return result;
    } catch (error) {
      this.logError(`Command failed: ${fullCommand}`, error);
      var fireError = true;
      if (handleError) {
        fireError = handleError(error);
      }
      if (fireError === true) {
        this.error.fire(error);
      }
    }
  }

  async applyEnvironmentVariables(activatedEnv: { [key: string]: string }) {
    // Store the current process environment as original (before any flox activation)
    if (Object.keys(this.originalEnvVars).length === 0) {
      this.originalEnvVars = { ...process.env } as { [key: string]: string };
    }

    // Store the activated environment variables
    this.activatedEnvVars = activatedEnv;

    // Apply to terminal environment variable collection
    const envCollection = this.context.environmentVariableCollection;
    envCollection.clear();

    // Calculate the diff between original and activated environments
    for (const [key, value] of Object.entries(activatedEnv)) {
      const originalValue = this.originalEnvVars[key];

      if (originalValue !== value) {
        // This variable was added or changed by flox
        envCollection.replace(key, value);
        process.env[key] = value;
      }
    }

    envCollection.description = 'Flox Environment';
    this.log(`Applied ${Object.keys(activatedEnv).length} environment variables to terminals`);
  }

  async clearEnvironmentVariables() {
    // Clear the environment variable collection to restore original environment
    const envCollection = this.context.environmentVariableCollection;
    envCollection.clear();

    // Clear stored variables
    this.activatedEnvVars = {};

    this.log('Cleared environment variables from terminals');
  }

  async spawnActivateProcess(resolve: (value: void) => void, reject: (reason?: any) => void) {
    // Spawn the flox activate -- sleep infinity process, this ensures an activation is started in the background
    this.log(`[SPAWN] Starting spawnActivateProcess`);
    this.isActivationInProgress = true;

    let spawnComplete = false;
    const activateScript = vscode.Uri.joinPath(this.context.extensionUri, 'scripts', 'activate.sh');

    this.log(`[SPAWN] Script path: ${activateScript.fsPath}`);
    this.log(`[SPAWN] Workspace path: ${this.workspaceUri?.fsPath}`);
    this.log(`Starting flox activate process...`);

    this.floxActivateProcess = spawn('flox', ['activate', '--dir', this.workspaceUri?.fsPath || '', '--', activateScript.fsPath], {
      cwd: this.workspaceUri?.fsPath || '',
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      detached: false, // Keep as child process so it dies with the parent
    });

    this.log(`[SPAWN] spawn() called, checking PID...`);

    if (this.floxActivateProcess.pid) {
      this.log(`[SPAWN] Process spawned successfully (PID: ${this.floxActivateProcess.pid})`);

      // Store the PID in workspace state
      await this.context.workspaceState.update('flox.activatePid', this.floxActivateProcess.pid);
      this.log(`Flox activate process started (PID: ${this.floxActivateProcess.pid})`);

      // Handle process exit
      this.floxActivateProcess.on('exit', (code, signal) => {
        this.log(`[SPAWN] Process exited (code: ${code}, signal: ${signal}, spawnComplete: ${spawnComplete})`);
        this.floxActivateProcess = undefined;
        this.isActivationInProgress = false;
        this.context.workspaceState.update('flox.activatePid', undefined);
        if (!spawnComplete) {
          this.log(`[SPAWN] Process exited before completion - calling reject()`);
          reject();
        }
      });

      // Capture stderr for debugging (only log if there's an error)
      let stderrBuffer = '';
      this.floxActivateProcess.stderr?.on('data', (data) => {
        const chunk = data.toString();
        stderrBuffer += chunk;
        this.log(`[SPAWN] stderr: ${chunk}`);
      });

      // Capture stdout too
      this.floxActivateProcess.stdout?.on('data', (data) => {
        this.log(`[SPAWN] stdout: ${data.toString()}`);
      });

      this.log(`[SPAWN] Registered event handlers, waiting for 'message' event...`);

      this.floxActivateProcess.on('message', async (msg: Msg) => {
        this.log(`[SPAWN] Received IPC message: ${JSON.stringify(msg).substring(0, 200)}...`);

        if (msg.action === 'ready' && msg.env) {
          this.log(`[SPAWN] Ready message with ${Object.keys(msg.env).length} env vars`);
          spawnComplete = true;
          this.isEnvActive = true;
          this.isActivationInProgress = false;

          this.log(`[SPAWN] Applying environment variables...`);
          // Apply environment variables to terminals
          this.applyEnvironmentVariables(msg.env);

          this.log(`[SPAWN] Calling reload()...`);
          // Reload to get fresh data from lock file
          await this.reload();

          this.log('[SPAWN] Environment activated successfully - calling resolve()');
          this.updateActivityBadge();
          resolve();
        } else if (msg.action === 'ready') {
          // Fallback if no env vars were sent
          this.log(`[SPAWN] Ready message without env vars`);
          spawnComplete = true;
          this.isEnvActive = true;
          this.isActivationInProgress = false;
          this.log('Environment activated (no env vars received)');
          await this.reload();
          resolve();
        } else {
          this.logError('[SPAWN] Unexpected message from activate script', msg);
          this.isActivationInProgress = false;
          this.error.fire("Failed to activate Flox environment.");
          reject();
        }
      });
      // Handle errors
      this.floxActivateProcess.on('error', (error) => {
        this.logError('[SPAWN] Flox activate process error', error);
        if (stderrBuffer) {
          this.logError('[SPAWN] Process stderr buffer', stderrBuffer);
        }
        if (error.message?.includes('ENOENT')) {
          this.displayError("Flox is not installed or not in PATH. Install Flox from flox.dev and try again. See logs for details.");
        } else {
          this.displayError(`Activation failed: ${error.message}. Check Flox is installed and try restarting VSCode. See logs for details.`);
        }
        this.floxActivateProcess = undefined;
        this.isActivationInProgress = false;
        this.context.workspaceState.update('flox.activatePid', undefined);
        reject();
      });

      this.log(`[SPAWN] All event handlers registered, process is running`);

    } else {
      this.logError('[SPAWN] Failed to get PID after spawn() call');
      this.isActivationInProgress = false;
      this.displayError("Failed to start Flox environment. Verify your manifest.toml is valid. See logs for details.");
      reject();
    }
  }

  async killActivateProcess(silent: boolean = false) {
    if (!this.floxActivateProcess || !this.floxActivateProcess.pid) {
      if (!silent) {
        this.displayMsg("Flox environment is not currently activated.");
      }
      return;
    }

    const pid = this.floxActivateProcess.pid;
    this.log(`Deactivating environment (PID: ${pid})...`);

    try {
      // With detached: false, we kill the process directly, not the process group.
      process.kill(pid, 'SIGKILL');

      // Clear environment variables from terminals
      await this.clearEnvironmentVariables();
    } catch (e: any) {
      // If the process is already gone, just ignore the error (ESRCH).
      // This can happen in a race condition where the process exits
      // and its 'exit' event has not yet been processed.
      if (e.code !== 'ESRCH') {
        // For any other error, log it and display it to the user.
        this.logError('Failed to kill flox activate process', e);
        if (!silent) {
          this.displayError(`Deactivation failed: ${e}. Your environment may still be active. Try restarting VSCode to clear it fully. See logs for details.`);
        }
        return; // Stop further processing on unexpected errors.
      }
      this.log(`Process ${pid} already exited, continuing cleanup`);
    }

    this.floxActivateProcess = undefined;
    this.isEnvActive = false;
    await this.context.workspaceState.update('flox.activatePid', undefined);
    await vscode.commands.executeCommand('setContext', 'flox.envActive', false);

    this.log('Environment deactivated');
    this.updateActivityBadge();
    if (!silent) {
      this.displayMsg("Flox environment deactivated successfully.");
    }
  }

  async reactivateEnvironment(): Promise<void> {
    if (this.isReactivating) {
      this.log('Reactivation already in progress, skipping');
      return;
    }

    this.isReactivating = true;
    this.log('Reactivating environment...');

    try {
      // 1. Kill existing background process (silent)
      await this.killActivateProcess(true);

      // 2. Respawn activation process
      await new Promise<void>((resolve, reject) => {
        this.spawnActivateProcess(
          () => {
            this.log('Environment reactivated successfully');
            resolve();
          },
          (error?: any) => {
            this.log(`Failed to reactivate: ${error}`);
            reject(error);
          }
        );
      });

      // 3. Update context and refresh UI
      await vscode.commands.executeCommand('setContext', 'flox.envActive', true);
      await this.reload();

    } catch (error) {
      this.log(`Reactivation failed: ${error}`);
      this.displayError('Reactivation failed when manifest changed. Your packages may be out of sync. Check your manifest.toml and manually run "flox activate" or restart VSCode.');
      this.isEnvActive = false;
      await vscode.commands.executeCommand('setContext', 'flox.envActive', false);
    } finally {
      this.isReactivating = false;
    }
  }

  public async searchInput(query?: string): Promise<string | undefined> {
    let searchStr: string | undefined = await vscode.window.showInputBox({
      prompt: 'Search packages',
      placeHolder: query,
    });
    if (!searchStr || searchStr.trim().length === 0) {
      this.displayMsg("Search query is empty. Please enter a search term and try again.");
      return;
    }
    searchStr = searchStr.trim();

    return searchStr;
  }

  public async search(query?: string): Promise<any[]> {
    query = await this.searchInput(query);

    if (!query) {
      return [];
    }

    const searchResults = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Searching for '${query}' ... `,
      cancellable: true,
    }, async (progress, _) => {
      return new Promise<any[]>(async (resolve, reject) => {
        progress.report({ increment: 0 });
        setTimeout(() => progress.report({ increment: 10 }), 1000);
        setTimeout(() => progress.report({ increment: 40 }), 2000);
        setTimeout(() => progress.report({ increment: 60 }), 4000);
        setTimeout(() => progress.report({ increment: 70 }), 8000);
        setTimeout(() => progress.report({ increment: 80 }), 9000);
        setTimeout(() => progress.report({ increment: 85 }), 10000);
        setTimeout(() => progress.report({ increment: 90 }), 12000);
        setTimeout(() => progress.report({ increment: 95 }), 15000);
        setTimeout(() => progress.report({ increment: 97 }), 20000);

        const result = await this.exec("flox", { argv: ["search", "--json", query] }, (error) => {
          return true;
        });
        progress.report({ increment: 100 });

        if (!result?.stdout) {
          if (result?.stderr?.includes('network') || result?.stderr?.includes('connection')) {
            this.displayError(`Search failed for '${query}'. Check your internet connection and try again. See logs for details.`);
          } else {
            this.displayError(`Search failed for '${query}'. ${result?.stderr}. Try searching for a different term or check logs.`);
          }
          reject([]);
          return;
        }

        let parsedResult = [];
        try {
          const raw = typeof result?.stdout === 'string'
            ? result!.stdout
            : result?.stdout?.toString('utf8') ?? '[]';
          parsedResult = JSON.parse(raw);
        } catch (e) {
          this.error.fire(e);
          reject([]);
          return;
        }
        if (parsedResult === undefined || parsedResult.length === 0) {
          this.displayMsg(`No results found for '${query}'.`);
          resolve([]);
          return;
        }

        resolve(parsedResult);
      });
    });

    if (searchResults.length === 0) {
      return await this.search(query);
    }

    return searchResults;
  }

  get isFloxInstalled(): boolean {
    return this._isFloxInstalled;
  }

  async checkFloxInstalled(): Promise<boolean> {
    try {
      await promisify(execFile)('flox', ['--version'], { timeout: 5000 }); // 5 second timeout
      return true;
    } catch {
      return false;
    }
  }

  async setFloxInstalled(value: boolean): Promise<void> {
    this._isFloxInstalled = value;
    await vscode.commands.executeCommand('setContext', 'flox.isInstalled', value);
    await this.context.workspaceState.update('flox.isInstalled', value);
  }

  /**
   * Check if flox-mcp command is available in PATH.
   * This command is typically available when a Flox environment with flox-mcp package is active.
   * @returns true if flox-mcp is in PATH, false otherwise
   */
  async checkFloxMcpAvailable(): Promise<boolean> {
    this.log('[MCP] Checking if flox-mcp is available...');
    try {
      this.log('[MCP] Running: flox-mcp --version');
      await promisify(execFile)('flox-mcp', ['--version'], { timeout: 2000 }); // 2 second timeout
      this.log('[MCP] flox-mcp command succeeded');
      return true;
    } catch (error: any) {
      this.log(`[MCP] flox-mcp check failed: ${error?.message || error}`);
      if (error?.killed) {
        this.log('[MCP] flox-mcp command timed out after 2 seconds');
      }
      return false;
    }
  }

  async setFloxMcpAvailable(value: boolean): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'flox.mcpAvailable', value);
    await this.context.workspaceState.update('flox.mcpAvailable', value);
    this.log(`MCP available: ${value}`);
  }

  /**
   * Check if GitHub Copilot or Copilot Chat extension is installed.
   * Either extension being active counts as "Copilot available".
   * @returns true if Copilot is available, false otherwise
   */
  checkCopilotInstalled(): boolean {
    const copilot = vscode.extensions.getExtension('GitHub.copilot');
    const copilotChat = vscode.extensions.getExtension('GitHub.copilot-chat');
    return !!(copilot || copilotChat);
  }

  async setCopilotInstalled(value: boolean): Promise<void> {
    await vscode.commands.executeCommand('setContext', 'flox.copilotInstalled', value);
    await this.context.workspaceState.update('flox.copilotInstalled', value);
    this.log(`Copilot installed: ${value}`);
  }

  /**
   * Show one-time suggestion to configure MCP server.
   * Only shows if:
   * - Copilot is installed
   * - Flox env is active
   * - MCP command is available
   * - Notification hasn't been shown before
   *
   * @returns true if notification was shown, false otherwise
   */
  async showMcpSuggestion(): Promise<boolean> {
    // Check if we've already shown this
    const alreadyShown = this.context.workspaceState.get('flox.mcpSuggestionShown', false);
    if (alreadyShown) {
      this.log('MCP suggestion already shown in this workspace');
      return false;
    }

    // Check all conditions
    const copilotInstalled = this.checkCopilotInstalled();
    const mcpAvailable = await this.checkFloxMcpAvailable();
    const envActive = this.isEnvActive;

    if (!copilotInstalled || !mcpAvailable || !envActive) {
      this.log(`MCP suggestion skipped: copilot=${copilotInstalled}, mcp=${mcpAvailable}, active=${envActive}`);
      return false;
    }

    // Mark as shown BEFORE showing notification (prevents duplicates if user dismisses quickly)
    await this.context.workspaceState.update('flox.mcpSuggestionShown', true);

    this.log('Showing MCP configuration suggestion');

    // Show notification with action button
    const action = await vscode.window.showInformationMessage(
      'Flox Agentic MCP server is available! Configure it to enhance AI coding with Copilot.',
      'Configure MCP',
      'Learn More'
    );

    if (action === 'Configure MCP') {
      await vscode.commands.executeCommand('flox.configureMcp');
    } else if (action === 'Learn More') {
      vscode.env.openExternal(vscode.Uri.parse('https://flox.dev/docs/tutorials/flox-agentic/'));
    }

    return true;
  }

  /**
   * Get the currently installed Flox version.
   * @returns The version string (e.g., "1.3.1") or undefined if not available
   */
  async getFloxVersion(): Promise<string | undefined> {
    try {
      const result = await promisify(execFile)('flox', ['--version']);
      // Output is like "flox 1.3.1" or "flox version 1.3.1"
      const match = result.stdout.toString().match(/(\d+\.\d+\.\d+)/);
      return match ? match[1] : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Fetch the latest Flox version from GitHub releases.
   * @returns The latest version string (e.g., "1.3.2") or undefined if fetch fails
   */
  async getLatestFloxVersion(): Promise<string | undefined> {
    try {
      // Use GitHub API to get the latest release
      const https = await import('https');
      return new Promise((resolve) => {
        const options = {
          hostname: 'api.github.com',
          path: '/repos/flox/flox/releases/latest',
          headers: {
            'User-Agent': 'flox-vscode-extension',
            'Accept': 'application/vnd.github.v3+json',
          },
        };

        const req = https.get(options, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              // tag_name is like "v1.3.2"
              const match = json.tag_name?.match(/(\d+\.\d+\.\d+)/);
              resolve(match ? match[1] : undefined);
            } catch {
              resolve(undefined);
            }
          });
        });

        req.on('error', () => resolve(undefined));
        req.setTimeout(10000, () => {
          req.destroy();
          resolve(undefined);
        });
      });
    } catch {
      return undefined;
    }
  }

  /**
   * Compare two semantic version strings.
   * @returns negative if v1 < v2, 0 if equal, positive if v1 > v2
   */
  compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 !== p2) {
        return p1 - p2;
      }
    }
    return 0;
  }

  /**
   * Check if a newer version of Flox is available.
   * Only checks once per day (stores last check time in globalState).
   * Shows a notification with upgrade link if update is available.
   */
  async checkForFloxUpdate(force: boolean = false): Promise<void> {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const lastCheckKey = 'flox.lastUpdateCheck';
    const lastVersionKey = 'flox.lastKnownVersion';

    // Check if we've already checked today (skip cooldown if forced)
    const lastCheck = this.context.globalState.get<number>(lastCheckKey, 0);
    const now = Date.now();

    if (!force && now - lastCheck < ONE_DAY_MS) {
      this.log('Skipping update check (checked within last 24 hours)');
      return;
    }

    this.log('Checking for Flox updates...');

    const currentVersion = await this.getFloxVersion();
    if (!currentVersion) {
      this.log('Could not determine current Flox version');
      if (force) {
        vscode.window.showWarningMessage('Could not determine Flox version. Is Flox installed?');
      }
      return;
    }

    const latestVersion = await this.getLatestFloxVersion();
    if (!latestVersion) {
      this.log('Could not fetch latest Flox version');
      if (force) {
        vscode.window.showWarningMessage('Could not check for updates. Please check your internet connection.');
      }
      return;
    }

    // Store the check time
    await this.context.globalState.update(lastCheckKey, now);

    this.log(`Current Flox version: ${currentVersion}, Latest: ${latestVersion}`);

    // Compare versions
    if (this.compareVersions(latestVersion, currentVersion) > 0) {
      // Don't show notification if we already notified about this version
      const lastNotifiedVersion = this.context.globalState.get<string>(lastVersionKey);
      if (lastNotifiedVersion === latestVersion) {
        this.log(`Already notified about version ${latestVersion}`);
        return;
      }

      // Store that we've notified about this version
      await this.context.globalState.update(lastVersionKey, latestVersion);

      this.log(`New Flox version available: ${latestVersion}`);

      // Show notification with upgrade button
      const action = await vscode.window.showInformationMessage(
        `A new version of Flox is available (${latestVersion}). You are using ${currentVersion}.`,
        'Upgrade Instructions'
      );

      if (action === 'Upgrade Instructions') {
        vscode.env.openExternal(vscode.Uri.parse('https://flox.dev/docs/install-flox/#upgrade-flox'));
      }
    } else {
      this.log('Flox is up to date');
      if (force) {
        vscode.window.showInformationMessage(`Flox is up to date (version ${currentVersion})`);
      }
    }
  }
}
