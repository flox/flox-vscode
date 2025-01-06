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
    vscode.window.withProgress({
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
}
