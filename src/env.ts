import * as vscode from 'vscode';
import * as toml from 'toml';
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

  public workspaceUri?: vscode.Uri;
  public manifest?: any;
  public manifestLock?: any;


  private context: vscode.ExtensionContext;
  private error = new vscode.EventEmitter<unknown>();

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
  }

  async init() {
    // initialize Flox environment
    if (this.workspaceUri) {

      // We only work with single root workspaces or we will only
      // activate an environment from the first workspace
      //
      // See more on multi-root workspaces: 
      //   https://code.visualstudio.com/docs/editor/multi-root-workspaces

      // If the manifest file exists, then the we mark the
      // `flox.environmentExists` context to true, if manifest file does not
      // exist we mark `flox.environmentExists` context to false.
      const manifestFile = vscode.Uri.joinPath(this.workspaceUri, '.flox', 'env', 'manifest.toml');
      try {
        await vscode.workspace.fs.stat(manifestFile);
        console.log(`environment exists: ${manifestFile}`);
        this.environmentExists = true;
      } catch (e) {
        console.log(e);
        console.log(`${manifestFile} file does not exist.`);
        this.environmentExists = false;
      }

      if (this.environmentExists === true) {
        try {
          const data: string = await fs.readFile(manifestFile.fsPath, 'utf-8');
          this.manifest = toml.parse(data);
        } catch (e: any) {
          if (e.line && e.column && e.message) {
            console.error(`Parsing manifest.toml error on line ${e.line}, column ${e.column}: ${e.message}`);
          } else {
            console.error(`Parsing manifest.toml error: ${e}`);
          }
        }
        const manifestLockFile = vscode.Uri.joinPath(this.workspaceUri, '.flox', 'env', 'manifest.lock');
        try {
          const data: string = await fs.readFile(manifestLockFile.fsPath, 'utf-8');
          this.manifestLock = JSON.parse(data);
        } catch (e: any) {
          if (e.line && e.column && e.message) {
            console.error(`Parsing manifest.lock error on line ${e.line}, column ${e.column}: ${e.message}`);
          } else {
            console.error(`Parsing manifest.lock error: ${e}`);
          }
        }
      }
    }
  }

  dispose() { }

  public get environmentExists() {
    return this.context.workspaceState.get("environmentExists") ?? false;
  }

  private set environmentExists(exists: boolean) {
    vscode.commands.executeCommand('setContext', 'flox.environmentExists', exists);
    this.context.workspaceState.update("environmentExists", exists);
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
    const reopenScript = vscode.Uri.joinPath(this.context.extensionUri, 'scripts', 'reopen.sh');
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
