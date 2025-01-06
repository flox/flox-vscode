import * as vscode from 'vscode';
import Env from './env';
import { HelpView, InstallView } from './view';

export async function activate(context: vscode.ExtensionContext) {

  const env = new Env(context);
  await env.init();

  const installView = new InstallView(env);
  const helpView = new HelpView();

  env.registerView('floxInstallView', installView);
  env.registerView('floxHelpView', helpView);


  env.registerCommand('flox.init', async () => {
    const result = await env.exec("flox", { argv: ["init", "--dir", env.workspaceUri?.fsPath || ''] });
    if (result?.stdout) {
      env.displayMsg(`Flox environment created: ${result.stdout}`);
    }
    await env.exec("flox", { argv: ["activate", "--dir", env.workspaceUri?.fsPath || ''] });
    await env.init();
  });

  env.registerCommand('flox.version', async () => {
    const result = await env.exec("flox", { argv: ["--version"] });
    if (result?.stdout) {
      env.displayMsg(`Flox version: ${result.stdout}`);
    }
  });

  env.registerCommand('flox.activate', async () => {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Activating Flox environment... ",
      cancellable: true,
    }, async (progress, _) => {
      return new Promise<void>(async (resolve, reject) => {
        if (env.envExists === false) {
          await env.displayError("Environment does not exist.");
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
        await env.exec("flox", { argv: ["activate", "--dir", env.workspaceUri?.fsPath || '', '--', 'true'] });

        progress.report({ message: 'Reloading the window', increment: 80 });
        await env.reopen(progress, reject, resolve);

        resolve();
      });
    });
  });

  env.registerCommand('flox.search', async () => {
    let searchStr: string | undefined = await vscode.window.showInputBox({
      prompt: 'Search packages'
    });
    if (searchStr === undefined) {
      env.displayMsg("Search query is empty, try again.");
      return
    }
    searchStr = searchStr.trim()
    if (searchStr.length <= 0) {
      env.displayMsg("Search query is empty, try again.");
    }

    const parsedResult: any = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Searching for '${searchStr}' ... `,
      cancellable: true,
    }, async (progress, _) => {
      return new Promise<void>(async (resolve, reject) => {
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

        const resultSearch = await env.exec("flox", { argv: ["search", "--json", searchStr] });
        progress.report({ increment: 100 });

        if (!resultSearch?.stdout) {
          env.displayError(`Something went wrong when searching for '${searchStr}': ${resultSearch?.stderr}`);
          reject();
          return
        }

        let parsedResult = [];
        try {
          parsedResult = JSON.parse(resultSearch?.stdout || '[]');
        } catch (error) {
          env.error.fire(error);
          reject();
          return
        }
        if (parsedResult === undefined || parsedResult.length === 0) {
          env.displayMsg(`No results found for '${searchStr}'.`);
          reject();
          return
        }

        resolve(parsedResult);
      });
    });

    let selection: any = await vscode.window.showQuickPick(parsedResult.map((pkg: any) => {
      return {
        label: pkg?.pname,
        description: pkg?.description,
      };
    }));

    if (selection === undefined || selection?.label == undefined) {
      env.displayMsg("No package selected to be installed.");
      return
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Install '${selection.label}' package ... `,
      cancellable: true,
    }, async (progress, _) => {
      return new Promise<void>(async (resolve, reject) => {
        progress.report({ increment: 0 });
        setTimeout(() => progress.report({ increment: 10 }), 1000);
        setTimeout(() => progress.report({ increment: 40 }), 3000);
        setTimeout(() => progress.report({ increment: 60 }), 8000);
        setTimeout(() => progress.report({ increment: 70 }), 13000);
        setTimeout(() => progress.report({ increment: 80 }), 20000);
        setTimeout(() => progress.report({ increment: 85 }), 28000);
        setTimeout(() => progress.report({ increment: 90 }), 38000);
        setTimeout(() => progress.report({ increment: 95 }), 50000);
        setTimeout(() => progress.report({ increment: 97 }), 60000);
        const resultInstall = await env.exec("flox", { argv: ["install", selection.label || '', "--dir", env.workspaceUri?.fsPath || ''] });
        progress.report({ increment: 100 });
        if (resultInstall?.stderr && resultInstall.stderr.includes(`'${selection.label}' installed to environment`)) {
          env.displayMsg(`Package '${selection?.label}' installed successfully.`);
          await installView.refresh();
          resolve();
        } else {
          env.displayError(`Something went wrong when installing '${selection?.label}': ${selection?.stderr}`);
          reject();
        }
      });
    });

  });
}
