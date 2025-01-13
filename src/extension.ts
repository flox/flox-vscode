import * as vscode from 'vscode';
import Env from './env';
import { HelpView, InstallView, Package } from './view';

export async function activate(context: vscode.ExtensionContext) {

  const installView = new InstallView();
  const helpView = new HelpView();

  const env = new Env(context);
  env.registerView('floxInstallView', installView);
  env.registerView('floxHelpView', helpView);

  await env.reload();

  env.registerCommand('flox.init', async () => {
    const result = await env.exec("flox", { argv: ["init", "--dir", env.workspaceUri?.fsPath || ''] });
    if (result?.stdout) {
      env.displayMsg(`Flox environment created: ${result.stdout}`);
    }
    await env.exec("flox", { argv: ["activate", "--dir", env.workspaceUri?.fsPath || ''] });
    await env.reload();
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
        const envExists = env.context.workspaceState.get('flox.envExists', false);
        if (!envExists) {
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

  env.registerCommand('flox.install', async () => {
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

        const result = await env.exec("flox", { argv: ["search", "--json", searchStr] });
        progress.report({ increment: 100 });

        if (!result?.stdout) {
          env.displayError(`Something went wrong when searching for '${searchStr}': ${result?.stderr}`);
          reject();
          return
        }

        let parsedResult = [];
        try {
          parsedResult = JSON.parse(result?.stdout || '[]');
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

    // TODO: call install command once we have it
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
        const result = await env.exec("flox", { argv: ["install", selection.label || '', "--dir", env.workspaceUri?.fsPath || ''] });
        progress.report({ increment: 100 });
        if (result?.stderr && result.stderr.includes(`'${selection.label}' installed to environment`)) {
          env.displayMsg(`Package '${selection?.label}' installed successfully.`);
          resolve();
        } else {
          env.displayError(`Something went wrong when installing '${selection?.label}': ${result?.stderr}`);
          reject();
        }
      });
    });
  });

  env.registerCommand('flox.uninstall', async (pkg: Package) => {

    // Select a package to uninstall
    if (!pkg) {
      var pkgs: any[] = [];
      if (env.manifest?.install) {
        pkgs = Object.keys(env.manifest.install).map(x => new Package(x));
      }
      pkg = await vscode.window.showQuickPick(pkgs);

      if (pkg === undefined || pkg?.label == undefined) {
        env.displayMsg("No package selected to be uninstalled.");
        return
      }
    }

    // Uninstall the selected package
    const result = await env.exec("flox", { argv: ["uninstall", pkg.label, "--dir", env.workspaceUri?.fsPath || ''] });
    if (result?.stderr && result.stderr.includes(`'${pkg.label}' uninstalled from environment`)) {
      env.displayMsg(`Package '${pkg.label}' uninstalled successfully.`);
    } else {
      env.displayError(`Something went wrong when uninstalling '${pkg.label}': ${result?.stderr}`);
    }

  });

  env.registerCommand('flox.edit', async () => {
    if (env.workspaceUri === undefined) {
      return
    }

    const manifestUri = vscode.Uri.joinPath(env.workspaceUri, ".flox", "env", "manifest.toml");
    env.displayMsg("Opening manifest.toml");

    try {
      const doc = await vscode.workspace.openTextDocument(manifestUri);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      env.displayError(`Something went wrong when opening manifest.toml: ${error}`);
    }
  });

}
