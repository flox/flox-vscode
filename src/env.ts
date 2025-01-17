import * as vscode from 'vscode';
import os from "os";
import { promises as fs } from "fs";
import { promisify } from 'util';
import { spawn, execFile, ExecOptions } from 'child_process';
import { View, System, Packages, Package, Services } from './config';



interface CommandExecOptions {
  argv: Array<string>;
  cwd?: boolean;
}

interface Msg {
  action: string
}

export default class Env implements vscode.Disposable {

  manifestWatcher: vscode.FileSystemWatcher;
  manifestLockWatcher: vscode.FileSystemWatcher;
  workspaceUri?: vscode.Uri;
  manifest?: any;
  packages?: Packages;
  servicesStatus?: Services;
  system?: System;
  views: View[];  // TODO: specify a type

  context: vscode.ExtensionContext;
  error = new vscode.EventEmitter<unknown>();

  constructor(
    ctx: vscode.ExtensionContext,
    workspaceUri?: vscode.Uri,
  ) {
    this.context = ctx;
    this.error.event((e) => this.onError(e));
    if (!workspaceUri && vscode.workspace.workspaceFolders) {
      this.workspaceUri = vscode.workspace.workspaceFolders[0].uri;
    } else {
      this.workspaceUri = workspaceUri;
    }

    // Creating file watcher to watch for events on devbox.json
    this.manifestWatcher = vscode.workspace.createFileSystemWatcher("**/.flox/env/manifest.toml", false, false, false);
    this.manifestWatcher.onDidDelete(async _ => {
      // TODO: what to do if manifest.toml gets deleted?
      console.log('manifest.toml file deleted');
      await this.reload();
    });
    this.manifestWatcher.onDidCreate(async _ => {
      console.log('manifest.toml file created');
      await this.reload();
    });
    this.manifestWatcher.onDidChange(async _ => {
      console.log('manifest.toml file changed');
      await this.exec("flox", { argv: ["activate", "--dir", this.workspaceUri?.fsPath || '', "--", "true"] });
    });

    this.manifestLockWatcher = vscode.workspace.createFileSystemWatcher("**/.flox/env/manifest.lock", false, false, false);
    this.manifestLockWatcher.onDidDelete(async _ => {
      console.log('manifest.lock file deleted');
      await this.reload();
    });
    this.manifestLockWatcher.onDidCreate(async _ => {
      console.log('manifest.lock file created');
      await this.reload();
    });
    this.manifestLockWatcher.onDidChange(async _ => {
      console.log('manifest.lock file changed');
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
      // check if manifest file exists
      await vscode.workspace.fs.stat(file);
      console.log(`environment exists: ${file}`);
    } catch (e) {
      console.log(e);
      console.log(`${file} file does not exist.`);
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
          console.error(`Parsing ${filename} error on line ${e.line}, column ${e.column}: ${e.message}`);
        } else {
          console.error(`Parsing ${filename} error: ${e}`);
        }
      }
    }
    return undefined;
  }

  // initialize Flox environment
  async reload() {
    console.log("Environment reload");

    // if there is no workspaceUri, we don't have a workspace to work with
    if (!this.workspaceUri) {
      return;
    }

    // We only work with single root workspaces or we will only
    // activate an environment from the first workspace
    const manifestFile = vscode.Uri.joinPath(this.workspaceUri, '.flox', 'env', 'manifest.toml');
    const manifestLockFile = vscode.Uri.joinPath(this.workspaceUri, '.flox', 'env', 'manifest.lock');
    if (await this.fileExists(manifestLockFile)) {
      this.manifest = await this.loadFile(manifestLockFile);
    } else if (await this.fileExists(manifestFile)) {
      this.manifest = { manifest: await this.loadFile(manifestLockFile) };
    }
    if (this.manifest?.packages) {
      this.packages = new Map();
      for (const system in System) {
        const systemValue = System[system as keyof typeof System];
        const pkgsForSystem: Map<string, Package> = new Map(
          this.manifest.packages
            .filter((p: any) => p.system === systemValue)
            .map((p: any) => [
              p.install_id,
              {
                install_id: p.install_id,
                system: p.system,
                version: p.version,
                group: p.group,
                license: p.license,
                description: p.description,
                attr_path: p.attr_path,
              }
            ])
        );
        this.packages.set(System[system as keyof typeof System], pkgsForSystem);
      }
    }

    var exists = false;
    var hasPkgs = false;
    var hasVars = false;
    var hasServices = false;
    if (this.manifest) {
      exists = this.manifest !== undefined || true;
      hasPkgs = this.manifest?.manifest?.install !== undefined && Object.keys(this.manifest.manifest.install).length > 0;
      hasVars = this.manifest?.manifest?.vars !== undefined && Object.keys(this.manifest.manifest.vars).length > 0;
      hasServices = this.manifest?.manifest?.services !== undefined && Object.keys(this.manifest.manifest.services).length > 0;
    }

    Promise.all([
      vscode.commands.executeCommand('setContext', 'flox.envExists', exists),
      vscode.commands.executeCommand('setContext', 'flox.hasPkgs', hasPkgs),
      vscode.commands.executeCommand('setContext', 'flox.hasVars', hasVars),
      vscode.commands.executeCommand('setContext', 'flox.hasServices', hasServices),
      this.context.workspaceState.update('flox.envExists', exists),
      this.context.workspaceState.update('flox.hasPkgs', hasPkgs),
      this.context.workspaceState.update('flox.hasVars', hasVars),
      this.context.workspaceState.update('flox.hasServices', hasServices)
    ]);

    // Check if the environment is active
    var envActive = false;
    if (process.env["_FLOX_ACTIVE_ENVIRONMENTS"]) {
      try {
        const result = JSON.parse(process.env["_FLOX_ACTIVE_ENVIRONMENTS"]);
        const workspaceFloxPath = vscode.Uri.joinPath(this.workspaceUri, '.flox').fsPath;

        // Check that the last active environment is the same as the VSCode workspace
        if (Array.isArray(result) && result.length > 0 && vscode.Uri.parse(result[0].path).fsPath === workspaceFloxPath) {
          envActive = true;
          // TODO: inside result[0] there is also the information of remove
          // environment
        }
      } catch (e: any) {
        console.error(`Parsing FLOX_ACTIVE_ENVIRONMENTS variable error: ${e}`);
      }
    }
    vscode.commands.executeCommand('setContext', 'flox.envActive', envActive);

    // Check for services status
    if (hasServices === true) {
      const result = await this.exec("flox", { argv: ["services", "status", "--json", "--dir", this.workspaceUri?.fsPath || ''] });
      this.servicesStatus = new Map();
      if (result?.stdout) {
        for (const data of result.stdout.split('\n')) {
          if (data.length === 0) {
            continue;
          }
          const service = JSON.parse(data);
          this.servicesStatus.set(service?.name, service);
        }
      }
    }

    // Refresh all UI components (we need to do this last)
    if (this.manifest) {
      for (const view of this.views) {
        if (view?.refresh) {
          await view.refresh();
        }
      }
    }
  }

  dispose() {
    this.manifestWatcher.dispose();
    this.manifestLockWatcher.dispose();
  }

  private async onError(error: unknown) {
    await this.displayError(error);
  }

  public async displayMsg(message: string) {
    await vscode.window.showInformationMessage(`Flox: ${message}`);
  }

  public async displayError(error: unknown) {
    var message: string = "";
    if (typeof error === 'string') {
      message = error;
    } else if (error instanceof Error) {
      message = error.message;
    }
    if (message !== undefined) {
      await vscode.window.showErrorMessage(`Flox Error: ${message}`);
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

  public async exec(command: string, options: CommandExecOptions) {
    let execOptions: ExecOptions = {};
    if (options.cwd === null || options.cwd) {
      execOptions.cwd = this.workspaceUri?.fsPath;
    }
    try {
      return await promisify(execFile)(command, options.argv, execOptions);
    } catch (error) {
      this.error.fire(error);
    }
  }

  public async reopen(_: any, reject: any, resolve: any) {
    const reopenScript = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'scripts', 'reopen.sh');
    console.log('reopen.sh path: ', reopenScript.fsPath);

    let reopen = spawn(reopenScript.fsPath, {
      cwd: this.workspaceUri?.fsPath,
      stdio: [0, 1, 2, 'ipc']
    });

    // reopen.sh closes before sending "close" message
    reopen.on('close', (code: number) => {
      console.log("reopen.sh process closed with exit code:", code);
      if (code !== 0) {
        this.error.fire("Failed to activate Flox environment.");
        reject();
      }
    });

    reopen.stdout?.on('data', (data) => {
      console.log('stdout:', data.toString().length, 'chars');
    });
    reopen.stderr?.on('data', (data) => {
      console.log('stderr:', data.toString().length, 'chars');
    });

    // reopen.sh listens for messages (to close vscode window)
    reopen.on('message', (msg: Msg) => {
      if (msg.action === "close") {
        resolve();
        vscode.commands.executeCommand("workbench.action.closeWindow");
        // Trigger script by sending workspacePath
        reopen.send({ workspacePath: this.workspaceUri?.fsPath });
      } else {
        console.log(msg);
        this.error.fire("Failed to activate Flox environment.");
        reject();
      }
    });


  }
}
