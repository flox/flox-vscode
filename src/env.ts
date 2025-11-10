import * as vscode from 'vscode';
import os from "os";
import { promises as fs } from "fs";
import { promisify } from 'util';
import { spawn, execFile, ExecOptions } from 'child_process';
import { View, System, Packages, Package, Services } from './config';
import { parseServicesStatus } from './serviceStatus';
import { isWorkspaceActive } from './envActive';



const EDITORS: { [key: string]: string } = {
  "vscodium": "codium",
  "visual studio code": "code",
  "cursor": "cursor",
};

interface CommandExecOptions {
  argv: Array<string>;
  cwd?: boolean;
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
    let envActive = false;
    if (this.workspaceUri) {
      const workspaceFloxPath = vscode.Uri.joinPath(this.workspaceUri, '.flox').fsPath;
      envActive = isWorkspaceActive(this.workspaceUri.fsPath, workspaceFloxPath);
    }
    vscode.commands.executeCommand('setContext', 'flox.envActive', envActive);

    // Check for services status
    if (hasServices === true) {
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
      this.servicesStatus = parseServicesStatus(result?.stdout);
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

  public async exec(command: string, options: CommandExecOptions, handleError?: (error: any) => boolean) {
    let execOptions: ExecOptions = {};
    if (options.cwd === null || options.cwd) {
      execOptions.cwd = this.workspaceUri?.fsPath;
    }
    try {
      return await promisify(execFile)(command, options.argv, execOptions);
    } catch (error) {
      var fireError = true;
      if (handleError) {
        fireError = handleError(error);
      }
      if (fireError === true) {
        this.error.fire(error);
      }
    }
  }

  public async searchInput(query?: string): Promise<string | undefined> {
    let searchStr: string | undefined = await vscode.window.showInputBox({
      prompt: 'Search packages',
      placeHolder: query,
    });
    if (searchStr === undefined) {
      this.displayMsg("Search query is empty, try again.");
      return;
    }
    searchStr = searchStr.trim();
    if (searchStr.length <= 0) {
      this.displayMsg("Search query is empty, try again.");
    }

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
          this.displayError(`Something went wrong when searching for '${query}': ${result?.stderr}`);
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

  public async reopen(_: any, reject: any, resolve: any) {
    if (!this.workspaceUri) {
      reject();
      return;
    }

    const editor = EDITORS[vscode.env.appName.toLocaleLowerCase()] || 'code';
    const workspacePath = this.workspaceUri.fsPath;
    const floxArgs = [
      "activate",
      "--dir",
      workspacePath,
      "--",
      editor,
      "--new-window",
      "--wait",
      workspacePath,
    ];

    try {
      await new Promise<void>((spawnResolve, spawnReject) => {
        const child = spawn("flox", floxArgs, {
          cwd: workspacePath,
          detached: true,
          stdio: "ignore",
        });

        child.once('error', (error) => {
          spawnReject(error);
        });

        child.once('spawn', () => {
          child.unref();
          spawnResolve();
        });
      });

      resolve();
      await vscode.commands.executeCommand("workbench.action.closeWindow");
    } catch (error) {
      console.error("Failed to relaunch VS Code through Flox:", error);
      this.error.fire("Failed to relaunch VS Code through Flox. Check the Flox output for details.");
      reject();
    }
  }
}
