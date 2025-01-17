import * as vscode from 'vscode';
import Env from './env';
import { VarsView, InstallView, ServicesView, PackageItem, ServiceItem } from './view';

export async function activate(context: vscode.ExtensionContext) {

  const installView = new InstallView();
  const varsView = new VarsView();
  const servicesView = new ServicesView();

  const env = new Env(context);

  env.registerView('floxInstallView', installView);
  env.registerView('floxVarsView', varsView);
  env.registerView('floxServicesView', servicesView);

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
      return;
    }
    searchStr = searchStr.trim();
    if (searchStr.length <= 0) {
      env.displayMsg("Search query is empty, try again.");
    }

    const parsedResult: any[] = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Searching for '${searchStr}' ... `,
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

        const result = await env.exec("flox", { argv: ["search", "--json", searchStr] }, (error) => {
          return true;
        });
        progress.report({ increment: 100 });

        if (!result?.stdout) {
          env.displayError(`Something went wrong when searching for '${searchStr}': ${result?.stderr}`);
          reject();
          return;
        }

        let parsedResult = [];
        try {
          parsedResult = JSON.parse(result?.stdout || '[]');
        } catch (error) {
          env.error.fire(error);
          reject();
          return;
        }
        if (parsedResult === undefined || parsedResult.length === 0) {
          env.displayMsg(`No results found for '${searchStr}'.`);
          resolve([]);
          return;
        }

        resolve(parsedResult);
      });
    });

    if (parsedResult.length === 0) {
      return;
    }

    let selection: any = await vscode.window.showQuickPick(parsedResult.map((pkg: any) => {
      return {
        label: pkg.relPath.join('.'),
        description: `(${pkg.version}) ${pkg.description}`,
      };
    }));

    if (selection === undefined || selection?.label === undefined) {
      env.displayMsg("No package selected to be installed.");
      return;
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

  env.registerCommand('flox.uninstall', async (pkg: PackageItem | undefined) => {
    if (env.workspaceUri === undefined) {
      return;
    }

    // Select a package to uninstall
    if (!pkg) {
      var pkgs: vscode.QuickPickItem[] = [];
      if (env?.packages && env?.system && env.packages.get(env.system)) {
        for (const [_, p] of env.packages.get(env.system) || []) {
          pkgs.push({
            label: p.install_id,
            description: `${p.attr_path} ( ${p.version} )`,
          });
        }
      }

      if (pkgs.length === 0) {
        env.displayMsg("No packages to uninstall.");
        return;
      }

      const selected = await vscode.window.showQuickPick(pkgs);
      if (selected === undefined || selected?.label === undefined) {
        env.displayMsg("No package selected to be uninstalled.");
        return;
      }

      if (env?.packages && env?.system && env.packages.get(env.system)) {
        const _pkg = env.packages.get(env.system)?.get(selected.label);
        if (_pkg) {
          pkg = new PackageItem(_pkg.install_id, `${_pkg.attr_path} ( ${_pkg.version} )`);
        }
      }

      if (!pkg) {
        return;
      }
    }


    // Uninstall the selected package
    const result = await env.exec("flox", { argv: ["uninstall", pkg.label, "--dir", env.workspaceUri.fsPath] });
    if (result?.stderr && result.stderr.includes(`'${pkg.label}' uninstalled from environment`)) {
      env.displayMsg(`Package '${pkg.label}' uninstalled successfully.`);
    } else {
      env.displayError(`Something went wrong when uninstalling '${pkg.label}': ${result?.stderr}`);
    }

  });

  env.registerCommand('flox.serviceStart', async (service: ServiceItem | undefined) => {
    if (env.workspaceUri === undefined) {
      return;
    }

    // Select a service to start
    if (!service) {
      var services: vscode.QuickPickItem[] = [];
      if (env?.manifest?.manifest?.services) {
        for (const s of env.manifest.manifest.services) {
          services.push({
            label: s.name,
            description: s?.command,
          });
        }
      }
      if (services.length === 0) {
        env.displayMsg("No services to start.");
        return;
      }

      const selected = await vscode.window.showQuickPick(services);
      if (selected === undefined || selected?.label === undefined) {
        env.displayMsg("No service selected to be started.");
        return;
      }

      service = new ServiceItem(selected.label, "", "");
    }

    try {
      //await env.exec("flox", { argv: ["activate", "--dir", env.workspaceUri.fsPath, "--", "flox", "services", "start", "--dir", env.workspaceUri.fsPath, service.label] });
      await env.exec("flox", { argv: ["services", "start", "--dir", env.workspaceUri.fsPath, service.label] });
      // TODO: Show progress bad and wait until service is marked as Running
    } catch (error) {
      env.displayError(`Starting ${service.label} service error: ${error}`);
    }

    env.reload();
  });

  env.registerCommand('flox.serviceStop', async (service: ServiceItem | undefined) => {
    if (env.workspaceUri === undefined) {
      return;
    }

    // Select a service to start
    if (!service) {
      var services: vscode.QuickPickItem[] = [];
      if (env?.servicesStatus) {
        for (const [name, status] of env.servicesStatus) {
          if (status?.status === "Running") {
            services.push({
              label: name,
              description: status?.status || "Not started",
            });
          }
        }
      }
      if (services.length === 0) {
        env.displayMsg("No services to stop.");
        return;
      }

      const selected = await vscode.window.showQuickPick(services);
      if (selected === undefined || selected?.label === undefined) {
        env.displayMsg("No service selected to be started.");
        return;
      }

      service = new ServiceItem(selected.label, "", "");
    }

    try {
      await env.exec("flox", { argv: ["services", "stop", "--dir", env.workspaceUri.fsPath, service.label] });
      // TODO: Show progress bad and wait until service is marked as Running
    } catch (error) {
      env.displayError(`Starting ${service.label} service error: ${error}`);
    }

    env.reload();
  });

  env.registerCommand('flox.serviceRestart', async (service: ServiceItem | undefined) => {
    if (env.workspaceUri === undefined) {
      return;
    }

    // Select a service to start
    if (!service) {
      var services: vscode.QuickPickItem[] = [];
      if (env?.manifest?.manifest?.services) {
        for (const s of env.manifest.manifest.services) {
          var status = "Not started";
          if (env?.servicesStatus && env.servicesStatus.get(s.name)) {
            const serviceStatus = env.servicesStatus.get(s.name);
            status = serviceStatus?.status || "Not started";
          }
          services.push({
            label: s.name,
            description: `( ${status} ) ${s?.command}`,
          });
        }
      }
      if (services.length === 0) {
        env.displayMsg("No services to restart.");
        return;
      }

      const selected = await vscode.window.showQuickPick(services);
      if (selected === undefined || selected?.label === undefined) {
        env.displayMsg("No service selected to be started.");
        return;
      }

      service = new ServiceItem(selected.label, "", "");
    }

    try {
      //await env.exec("flox", { argv: ["activate", "--dir", env.workspaceUri.fsPath, "--", "flox", "services", "restart", "--dir", env.workspaceUri.fsPath, service.label] });
      await env.exec("flox", { argv: ["services", "restart", "--dir", env.workspaceUri.fsPath, service.label] });
      // TODO: Show progress bad and wait until service is marked as Running
    } catch (error) {
      env.displayError(`Starting ${service.label} service error: ${error}`);
    }

    env.reload();
  });

  env.registerCommand('flox.edit', async () => {
    if (env.workspaceUri === undefined) {
      return;
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
