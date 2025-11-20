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
    if (!env.workspaceUri) { return; }

    const result = await env.exec("flox", { argv: ["init", "--dir", env.workspaceUri.fsPath,] });
    setTimeout(async () => {
      if (!env.workspaceUri) { return; }
      if (result?.stdout) {
        env.displayMsg(`Flox environment created: ${result.stdout}`);
      }
      await env.exec("flox", { argv: ["activate", "--dir", env.workspaceUri.fsPath, "--", "true"] });
      await env.reload();

    }, 1000); // We added the timeout of one second because flox is too fast :)
  });

  env.registerCommand('flox.version', async () => {
    const result = await env.exec("flox", { argv: ["--version"] });
    if (result?.stdout) {
      env.displayMsg(`Flox version: ${result.stdout}`);
    }
  });

  env.registerCommand('flox.activate', async () => {
    if (!env.workspaceUri) { return; }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Activating Flox environment... ",
      cancellable: true,
    }, async (progress, token) => {
      return new Promise<void>(async (resolve, reject) => {
        const envExists = env.context.workspaceState.get('flox.envExists', false);
        if (!envExists) {
          env.displayError("Environment does not exist.");
          reject();
          return;
        }

        // Check if a process already exists
        if (env.floxActivateProcess) {
          console.log(`Flox activate process already running with PID: ${env.floxActivateProcess.pid}`);
          await vscode.commands.executeCommand('setContext', 'flox.envActive', true);
          env.displayMsg("Flox environment is already activated.");
          resolve();
          return;
        }

        // Handle cancellation
        token.onCancellationRequested(() => {
          console.log('Flox activation cancelled by user');
          env.killActivateProcess(true); // Silent mode - don't show messages
          reject(new Error('Activation cancelled by user'));
        });

        // Ensure that activation works and doesn't hang in a blocking context
        progress.report({ message: 'Installing packages', increment: 20 });
        await env.exec("flox", { argv: ["activate", "--dir", env.workspaceUri?.fsPath || '', '--', 'true'] });

        progress.report({ message: 'Starting flox activate process', increment: 60 });

        await env.spawnActivateProcess(async () => {
          progress.report({ message: 'Environment activated', increment: 100 });
          resolve();
          await vscode.commands.executeCommand('setContext', 'flox.envActive', true);
          env.displayMsg("Flox environment activated successfully.");
        },
        async () => {
          env.displayError("Failed to start flox activate process.");
          await vscode.commands.executeCommand('setContext', 'flox.envActive', false);
          env.killActivateProcess(true); // Silent mode - don't show messages
          reject();
        });
      });
    });
  });

  env.registerCommand('flox.deactivate', async () => {
    await env.killActivateProcess();
  });

  env.registerCommand('flox.install', async () => {
    if (!env.workspaceUri) { return; }

    const searchResults = await env.search();

    let selection: any = await vscode.window.showQuickPick(searchResults.map((pkg: any) => {
      var version = ''
      if (pkg?.name && pkg?.pname && pkg.name != pkg.pname) {
        version = '(' + pkg.name.replace(`${pkg.pname}-`, '') + ') ';
      }
      return {
        label: pkg?.attr_path,
        description: `${version}${pkg?.description || ''}`,
        id: pkg?.attr_path,
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

        const result = await env.exec("flox", { argv: ["install", "--dir", env.workspaceUri?.fsPath, "--id", selection.id, selection.label] });
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
    if (!env.workspaceUri) { return; }

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
    if (!env.workspaceUri) { return; }

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
    if (!env.workspaceUri) { return; }

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
    if (!env.workspaceUri) { return; }

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
    if (!env.workspaceUri) { return; }

    const manifestUri = vscode.Uri.joinPath(env.workspaceUri, ".flox", "env", "manifest.toml");
    env.displayMsg("Opening manifest.toml");

    try {
      const doc = await vscode.workspace.openTextDocument(manifestUri);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      env.displayError(`Something went wrong when opening manifest.toml: ${error}`);
    }
  });

  env.registerCommand('flox.search', async () => {
    const searchResults = await env.search();

    let selection: any = await vscode.window.showQuickPick(searchResults.map((pkg: any) => {
      var version = ''
      if (pkg?.name && pkg?.pname && pkg.name != pkg.pname) {
        version = '(' + pkg.name.replace(`${pkg.pname}-`, '') + ') ';
      }
      return {
        label: pkg?.attr_path,
        description: `${version}${pkg?.description || ''}`,
        id: pkg?.attr_path,
      };
    }));

    if (selection === undefined || selection?.label === undefined) {
      env.displayMsg("No package selected.");
      return;
    }

    const command = `flox show ${selection.label}`;
    const terminal = vscode.window.createTerminal({ name: command });
    terminal.show(false);
    terminal.sendText(command, true);
  });
}
