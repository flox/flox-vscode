import * as vscode from 'vscode';
import { promises as fs } from "fs";
import { promisify } from 'util';
import { spawn, execFile, ExecOptions } from 'child_process';


interface CommandExecOptions {
  argv: Array<string>;
  cwd?: boolean;
}

interface Msg {
  action: string
}

export default class Env implements vscode.Disposable {

  manifestWatcher: vscode.FileSystemWatcher;
  workspaceUri?: vscode.Uri;
  manifest?: any;
  views: any[];

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
    this.manifestWatcher = vscode.workspace.createFileSystemWatcher("**/.flox/{env.json,env/manifest.toml,env/manifest.lock}", false, false, false);
    this.manifestWatcher.onDidDelete(async _ => {
      console.log('manifest file deleted');
      await this.reload();
    });
    this.manifestWatcher.onDidCreate(async _ => {
      console.log('manifest file created');
      await this.reload();
    });
    this.manifestWatcher.onDidChange(async _ => {
      console.log('manifest file changed');
      await this.reload();
    });
    this.views = [];
  }

  // initialize Flox environment
  async reload() {

    // if there is no workspaceUri, we don't have a workspace to work with
    if (!this.workspaceUri) {
      return
    }

    // We only work with single root workspaces or we will only
    // activate an environment from the first workspace
    this.manifest = undefined;
    const manifestFile = vscode.Uri.joinPath(this.workspaceUri, '.flox', 'env', 'manifest.toml');
    try {
      // check if manifest file exists
      await vscode.workspace.fs.stat(manifestFile);
      console.log(`environment exists: ${manifestFile}`);
    } catch (e) {
      console.log(e);
      console.log(`${manifestFile} file does not exist.`);
    }
    try {
      const data: string = await fs.readFile(manifestFile.fsPath, 'utf-8');
      let TOML = await import('smol-toml');
      this.manifest = TOML.parse(data);
    } catch (e: any) {
      if (e.line && e.column && e.message) {
        console.error(`Parsing manifest.toml error on line ${e.line}, column ${e.column}: ${e.message}`);
      } else {
        console.error(`Parsing manifest.toml error: ${e}`);
      }
    }

    var exists = false;
    var hasPkgs = false;
    var hasVars = false;
    var hasServices = false;
    if (this.manifest) {
      exists = this.manifest !== undefined || true;
      hasPkgs = this.manifest?.install !== undefined && Object.keys(this.manifest.install).length > 0;
      hasVars = this.manifest?.vars !== undefined && Object.keys(this.manifest.vars).length > 0;
      hasServices = this.manifest?.services !== undefined && Object.keys(this.manifest.services).length > 0;
    }
    vscode.commands.executeCommand('setContext', 'flox.envExists', exists);
    vscode.commands.executeCommand('setContext', 'flox.hasPkgs', hasPkgs);
    vscode.commands.executeCommand('setContext', 'flox.hasVars', hasVars);
    vscode.commands.executeCommand('setContext', 'flox.hasServices', hasServices);

    // Check if the environment is active
    var envActive = false
    if (process.env["_FLOX_ACTIVE_ENVIRONMENTS"]) {
      try {
        const result = JSON.parse(process.env["_FLOX_ACTIVE_ENVIRONMENTS"]);
        const workspaceFloxPath = vscode.Uri.joinPath(this.workspaceUri, '.flox').fsPath

        // Check that the last active environment is the same as the VSCode workspace
        if (Array.isArray(result) && result.length > 0 && vscode.Uri.parse(result[0].path).fsPath === workspaceFloxPath) {
          envActive = true
          // TODO: inside result[0] there is also the information of remove
          // environment
        }
      } catch (e: any) {
        console.error(`Parsing FLOX_ACTIVE_ENVIRONMENTS variable error: ${e}`);
      }
    }
    vscode.commands.executeCommand('setContext', 'flox.envActive', envActive);

    // Refresh all UI components (we need to do this last)
    if (this.manifest) {
      for (const view of this.views) {
        if (view?.refresh) {
          await view.refresh();
        }
      }
    }
  }

  dispose() { }

  public get envExists() {
    return this.context.workspaceState.get("flox.envExists") ?? false;
  }

  private set envExists(manifest: any) {
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
    this.context.subscriptions.push(view.registerProvider(viewName))
    view.env = this;
    this.views.push(view);
  }

  public registerCommand(commandName: string, command: (...args: any[]) => any) {
    const tryCommand = async () => {
      try {
        return await command();
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

  public async reopen(progress: any, reject: any, resolve: any) {
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
