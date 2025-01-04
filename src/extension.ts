import * as vscode from 'vscode';
import { promisify } from 'util';
import { spawn, execFile, ExecOptions } from 'child_process';

interface CommandExecOptions {
  argv: Array<string>;
  cwd?: boolean;
}

interface Msg {
  action: string
}

class FloxEnv implements vscode.Disposable {

  public workspaceUri?: vscode.Uri;

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
      } catch (err) {
        console.log(err);
        console.log(`${manifestFile} file does not exist.`);
        this.environmentExists = false;
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


class FloxExampleView implements vscode.TreeDataProvider<FloxItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FloxItem | undefined | null | void> = new vscode.EventEmitter<FloxItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FloxItem | undefined | null | void> = this._onDidChangeTreeData.event;

  getTreeItem(element: FloxItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FloxItem): Thenable<FloxItem[]> {
    if (!element) {
      // Root items
      return Promise.resolve([
        new FloxItem('Item 1'),
        new FloxItem('Item 2')
      ]);
    }
    return Promise.resolve([]);
  }
}

class FloxItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label);
  }
}

export async function activate(context: vscode.ExtensionContext) {

  const floxEnv = new FloxEnv(context);
  await floxEnv.init();

  const floxInstallView = new FloxExampleView();
  const floxVarsView = new FloxExampleView();
  const floxServicesView = new FloxExampleView();
  const floxHelpView = new FloxExampleView();

  vscode.window.registerTreeDataProvider('floxInstallView', floxInstallView);
  vscode.window.registerTreeDataProvider('floxVarsView', floxVarsView);
  vscode.window.registerTreeDataProvider('floxServicesView', floxServicesView);
  vscode.window.registerTreeDataProvider('floxHelpView', floxHelpView);


  floxEnv.registerCommand('flox.init', async () => {
    const result = await floxEnv.exec("flox", { argv: ["init", "--dir", floxEnv.workspaceUri?.fsPath || ''] });
    if (result?.stdout) {
      floxEnv.displayMsg(`Flox environment created: ${result.stdout}`);
    }
    await floxEnv.init();
  });

  floxEnv.registerCommand('flox.version', async () => {
    const result = await floxEnv.exec("flox", { argv: ["--version"] });
    if (result?.stdout) {
      floxEnv.displayMsg(`Flox version: ${result.stdout}`);
    }
  });

  floxEnv.registerCommand('flox.activate', async () => {
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Activating Flox environment... ",
      cancellable: true,
    }, async (progress, _) => {
      return new Promise<void>(async (resolve, reject) => {
        if (floxEnv.environmentExists === false) {
          await floxEnv.displayError("Environment does not exist.");
          reject();
        }

        if (process.platform === 'darwin') {
          progress.report({ message: 'Adjusting VSCode SHELL...', increment: 10 });
          vscode.workspace.getConfiguration().update(
            'terminal.integrated.profiles.osx',
            {
              "floxShellProfile": {
                "path": process.env["SHELL"] ?? "/bin/zsh",
              }
            },
            vscode.ConfigurationTarget.Workspace
          );
          vscode.workspace.getConfiguration().update(
            'terminal.integrated.defaultProfile.osx',
            'floxShellProfile',
            vscode.ConfigurationTarget.Workspace
          );
        }

        progress.report({ message: 'Installing packages', increment: 20 });
        await floxEnv.exec("flox", { argv: ["activate", "--dir", floxEnv.workspaceUri?.fsPath || '', '--', 'true'] });

        progress.report({ message: 'Reloading the window', increment: 80 });
        await floxEnv.reopen(progress, reject, resolve);

        resolve();
      });
    });

  });
}
