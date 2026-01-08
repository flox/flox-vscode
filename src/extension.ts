import * as vscode from 'vscode';
import * as os from 'os';
import Env from './env';
import { VarsView, InstallView, ServicesView, SettingsView, PackageItem, ServiceItem } from './view';
import { registerMcpProvider, FloxMcpProvider } from './mcp';

/**
 * Show auto-activate prompt and handle user selection
 * Returns true if environment was activated, false otherwise
 */
async function showAutoActivatePrompt(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
  env: Env
): Promise<boolean> {
  output.appendLine(`Showing activation prompt to user`);

  const selection = await vscode.window.showInformationMessage(
    'A Flox environment was detected in this workspace. Would you like to activate it?',
    'Always Activate',
    'Activate Once',
    'Never Activate'
  );

  output.appendLine(`User selected: ${selection}`);

  if (selection === 'Always Activate') {
    await context.workspaceState.update('flox.autoActivate', true);
    await env.updateAutoActivatePrefContext();
    output.appendLine(`Activating (Always Activate)`);
    await vscode.commands.executeCommand('flox.activate');
    output.appendLine(`Activation command completed`);
    return true;
  } else if (selection === 'Activate Once') {
    output.appendLine(`Activating (Activate Once)`);
    await vscode.commands.executeCommand('flox.activate');
    output.appendLine(`Activation command completed`);
    return true;
  } else if (selection === 'Never Activate') {
    await context.workspaceState.update('flox.autoActivate', false);
    await env.updateAutoActivatePrefContext();
    output.appendLine(`User chose Never Activate`);
    return false;
  } else {
    output.appendLine(`User dismissed prompt`);
    return false;
  }
}

export async function activate(context: vscode.ExtensionContext) {

  const output = vscode.window.createOutputChannel('Flox');
  context.subscriptions.push(output);

  // Log startup info for debugging
  const timestamp = new Date().toISOString();
  output.appendLine(`[${timestamp}] Flox extension starting...`);
  output.appendLine(`[${timestamp}] System: ${os.platform()} ${os.arch()}`);
  output.appendLine(`[${timestamp}] VSCode: ${vscode.version}`);
  if (vscode.workspace.workspaceFolders?.[0]) {
    output.appendLine(`[${timestamp}] Workspace: ${vscode.workspace.workspaceFolders[0].uri.fsPath}`);
  }

  const installView = new InstallView();
  const varsView = new VarsView();
  const servicesView = new ServicesView();
  const settingsView = new SettingsView();

  const env = new Env(context, undefined, output);

  // MCP provider instance
  let mcpProvider: FloxMcpProvider | undefined;

  // Check if Flox CLI is installed
  const isFloxInstalled = await env.checkFloxInstalled();
  await env.setFloxInstalled(isFloxInstalled);

  // Check if GitHub Copilot is installed
  const isCopilotInstalled = env.checkCopilotInstalled();
  await env.setCopilotInstalled(isCopilotInstalled);

  // Register command to open Flox installation page (always available)
  env.registerCommand('flox.openInstallPage', () => {
    vscode.env.openExternal(vscode.Uri.parse('https://flox.dev/docs/install-flox/'));
  });

  // Register command to open Flox upgrade page (always available)
  env.registerCommand('flox.openUpgradePage', () => {
    vscode.env.openExternal(vscode.Uri.parse('https://flox.dev/docs/install-flox/#upgrade-flox'));
  });

  // If Flox is not installed, skip further initialization
  if (!isFloxInstalled) {
    return;
  }

  // Create TreeView instances (not just providers) so we can update badges
  const installTreeView = vscode.window.createTreeView('floxInstallView', {
    treeDataProvider: installView
  });
  const varsTreeView = vscode.window.createTreeView('floxVarsView', {
    treeDataProvider: varsView
  });
  const servicesTreeView = vscode.window.createTreeView('floxServicesView', {
    treeDataProvider: servicesView
  });

  // Register views with Env (for backward compatibility with refresh logic)
  env.registerView('floxInstallView', installView);
  env.registerView('floxVarsView', varsView);
  env.registerView('floxServicesView', servicesView);
  env.registerView('floxSettingsView', settingsView);

  // Pass TreeView instances to Env for badge management
  env.registerTreeViews([installTreeView, varsTreeView, servicesTreeView]);

  // Add to subscriptions for cleanup
  context.subscriptions.push(installTreeView, varsTreeView, servicesTreeView);

  // Check if we just activated and need to spawn the background process.
  const justActivated = context.workspaceState.get('flox.justActivated', false);
  output.appendLine(`[STEP 2] Checking justActivated flag: ${justActivated}`);

  if (justActivated) {
    output.appendLine(`[STEP 2] justActivated is TRUE - entering post-activation flow`);

    // Unset the flag immediately to prevent this from running again.
    await context.workspaceState.update('flox.justActivated', false);
    output.appendLine(`[STEP 2] Cleared justActivated flag`);

    // Track existing terminal count BEFORE spawning activate process
    const existingTerminalCount = vscode.window.terminals.length;
    output.appendLine(`[STEP 2] Found ${existingTerminalCount} existing terminals`);
    await context.workspaceState.update('flox.terminalsBeforeActivation', existingTerminalCount);

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Activating Flox environment... ",
      cancellable: true,
    }, async (progress, token) => {
      return new Promise<void>(async (resolve, reject) => {
        output.appendLine(`[STEP 2] Progress dialog shown`);

        // Check if a process already exists
        if (env.floxActivateProcess) {
          output.appendLine(`[STEP 2] Process already exists (PID: ${env.floxActivateProcess.pid})`);
          console.log(`Flox activate process already running with PID: ${env.floxActivateProcess.pid}`);
          await vscode.commands.executeCommand('setContext', 'flox.envActive', true);
          env.displayMsg("Flox environment is already activated.");
          resolve();
          return;
        }

        // Handle cancellation
        token.onCancellationRequested(() => {
          output.appendLine(`[STEP 2] Activation cancelled by user`);
          console.log('Flox activation cancelled by user');
          env.killActivateProcess(true); // Silent mode - don't show messages
          reject(new Error('Activation cancelled by user'));
        });

        progress.report({ message: 'Starting flox activate process', increment: 60 });
        output.appendLine(`[STEP 2] Calling env.spawnActivateProcess()`);

        env.spawnActivateProcess(async () => {
          output.appendLine(`[STEP 2] spawnActivateProcess SUCCESS callback`);
          progress.report({ message: 'Environment activated', increment: 100 });
          resolve();
          await vscode.commands.executeCommand('setContext', 'flox.envActive', true);
          env.displayMsg("Flox environment activated successfully.");

          // Check if MCP is available and register provider (in background - don't block)
          output.appendLine(`[STEP 2] Starting background MCP check (non-blocking)...`);
          env.checkFloxMcpAvailable().then(async (isMcpAvailable) => {
            output.appendLine(`[STEP 2] MCP check complete: ${isMcpAvailable}`);
            await env.setFloxMcpAvailable(isMcpAvailable);

            if (isMcpAvailable && isCopilotInstalled) {
              // Register MCP provider
              mcpProvider = registerMcpProvider(context, env.workspaceUri);

              // Show one-time suggestion
              await env.showMcpSuggestion();
            } else if (!isMcpAvailable) {
              // MCP not found - offer to install it
              output.appendLine(`[STEP 2] MCP not available, offering to install...`);
              const installResult = await env.offerToInstallMcp();

              if (installResult.installed && installResult.mcpAvailable && isCopilotInstalled) {
                // Installation succeeded - register MCP provider
                output.appendLine(`[STEP 2] MCP installed successfully, registering provider...`);
                mcpProvider = registerMcpProvider(context, env.workspaceUri);

                // Show configuration suggestion
                await env.showMcpSuggestion();
              }
            }
          }).catch((error) => {
            output.appendLine(`[STEP 2] MCP check error: ${error}`);
          });

          output.appendLine(`[STEP 2] Post-activation complete (MCP check running in background)`);
        },
        async () => {
          output.appendLine(`[STEP 2] spawnActivateProcess FAILURE callback`);
          env.displayError("Failed to start flox activate process.");
          await vscode.commands.executeCommand('setContext', 'flox.envActive', false);
          env.killActivateProcess(true);
          reject();
        });

        output.appendLine(`[STEP 2] Waiting for spawnActivateProcess callbacks...`);
      });
    });
    output.appendLine(`[STEP 2] Post-activation flow complete`);
  } else {
    output.appendLine(`[STEP 2] justActivated is FALSE - skipping post-activation flow`);
  }

  // Only reload if we didn't just activate (activation already calls reload internally)
  if (!justActivated) {
    output.appendLine(`[STEP 3] Calling env.reload()`);
    await env.reload();
    output.appendLine(`[STEP 3] env.reload() complete`);
  } else {
    output.appendLine(`[STEP 3] Skipping reload (already done in post-activation flow)`);
  }

  // Validate manifest.toml on initial load
  output.appendLine(`[STEP 3] Validating manifest.toml`);
  await env.validateManifest();
  output.appendLine(`[STEP 3] Validation complete`);

  // Update auto-activate preference context key
  await env.updateAutoActivatePrefContext();

  // Check for Flox updates (once per day, in background)
  const checkForUpdates = vscode.workspace.getConfiguration('flox').get<boolean>('checkForUpdates', true);
  if (checkForUpdates) {
    env.checkForFloxUpdate();
  }

  env.registerCommand('flox.checkForUpdates', async () => {
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Checking for Flox updates...",
      cancellable: false,
    }, async (progress) => {
      progress.report({ increment: 0 });
      await env.checkForFloxUpdate(true); // force = true
      progress.report({ increment: 100 });
    });
  });

  env.registerCommand('flox.init', async () => {
    if (!env.workspaceUri) { return; }

    const result = await env.exec("flox", { argv: ["init", "--dir", env.workspaceUri.fsPath,] });
    setTimeout(async () => {
      if (!env.workspaceUri) { return; }
      if (result?.stdout) {
        // Non-blocking notification - don't await, use .then() to avoid blocking tests
        vscode.window.showInformationMessage(
          'Flox environment created successfully!',
          'Learn More'
        ).then((action) => {
          if (action === 'Learn More') {
            vscode.env.openExternal(vscode.Uri.parse('https://flox.dev/docs'));
          }
        });
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

    output.appendLine(`[STEP 1] flox.activate command called`);

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: "Activating Flox environment... ",
      cancellable: true,
    }, async (progress, token) => {
      return new Promise<void>(async (resolve, reject) => {
        try {
          const envExists = env.context.workspaceState.get('flox.envExists', false);
          output.appendLine(`[STEP 1] envExists: ${envExists}`);
          if (!envExists) {
            // Non-blocking notification - don't await to avoid blocking tests
            vscode.window.showErrorMessage(
              'No Flox environment found. Create one first.',
              'Create Environment'
            ).then((action) => {
              if (action === 'Create Environment') {
                vscode.commands.executeCommand('flox.init');
              }
            });
            reject();
            return;
          }

          token.onCancellationRequested(() => {
            console.log('Flox activation cancelled by user');
            reject(new Error('Activation cancelled by user'));
            return;
          });

          progress.report({ message: 'Activating environment...', increment: 50 });

          // Set a flag that will be checked after the reload/restart.
          output.appendLine(`[STEP 1] Setting flox.justActivated flag to true`);
          await env.context.workspaceState.update('flox.justActivated', true);
          output.appendLine(`[STEP 1] Flag set successfully`);

          // This command configures the directory so that future shells will be activated.
          output.appendLine(`[STEP 1] Running: flox activate --dir ${env.workspaceUri?.fsPath} -- true`);
          await env.exec("flox", { argv: ["activate", "--dir", env.workspaceUri?.fsPath || '', '--', 'true'] });
          output.appendLine(`[STEP 1] flox activate command completed`);

          progress.report({ message: 'Reloading VS Code to apply environment...', increment: 90 });

          // Now, reload the window or restart the extension host to apply the environment.
          // Skip restart in test mode to avoid killing test runner
          if (env.context.extensionMode === vscode.ExtensionMode.Test) {
            output.appendLine(`[STEP 1] Skipping restart in test mode`);
            resolve();
            return;
          }

          if (vscode.env.remoteName === undefined) {
            // For local environments, restarting the extension host is generally faster
            // and less disruptive than reloading the whole window.
            output.appendLine(`[STEP 1] Restarting extension host (local environment)`);
            await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
          } else {
            // For remote environments, a full window reload is required to get the
            // new environment variables from the remote server.
            output.appendLine(`[STEP 1] Reloading window (remote environment)`);
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
          }

          // The promise will likely not resolve here as the window is reloading,
          // but we call resolve() for completeness.
          resolve();
        } catch (e) {
          output.appendLine(`[STEP 1] ERROR in flox.activate: ${e}`);
          reject(e);
        }
      });
    });
  });

  env.registerCommand('flox.deactivate', async () => {
    // Terminate the background activation process.
    await env.killActivateProcess();

    // Restart the extension host or reload the window to clear the environment.
    if (vscode.env.remoteName === undefined) {
      await vscode.commands.executeCommand('workbench.action.restartExtensionHost');
    } else {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
  });

  env.registerCommand('flox.install', async () => {
    if (!env.workspaceUri) { return; }

    const searchResults = await env.search();

    let selection: any = await vscode.window.showQuickPick(searchResults.map((pkg: any) => {
      var version = '';
      if (pkg?.name && pkg?.pname && pkg.name !== pkg.pname) {
        version = '(' + pkg.name.replace(`${pkg.pname}-`, '') + ') ';
      }
      // Use pkg_path for display (shows catalog prefix like "flox/package-name")
      // Fall back to attr_path for non-catalog packages
      const displayName = pkg?.pkg_path || pkg?.attr_path;
      return {
        label: displayName,
        description: `${version}${pkg?.description || ''}`,
        id: pkg?.attr_path,
        pkgPath: pkg?.pkg_path || pkg?.attr_path,
      };
    }));

    if (selection === undefined || selection?.label === undefined) {
      // Silent - user intentionally dismissed the picker
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

        // Use pkgPath for installation (includes catalog prefix for catalog packages)
        const result = await env.exec("flox", { argv: ["install", "--dir", env.workspaceUri?.fsPath, selection.pkgPath] });
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
        // Silent - user intentionally dismissed the picker
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
        // Silent - user intentionally dismissed the picker
        return;
      }

      service = new ServiceItem(selected.label, "", "");
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Starting service '${service.label}'...`,
      cancellable: false,
    }, async (progress) => {
      try {
        progress.report({ increment: 0 });
        await env.exec("flox", { argv: ["services", "start", "--dir", env.workspaceUri!.fsPath, service!.label] });
        progress.report({ increment: 100 });
        await env.reload();
        env.displayMsg(`Service '${service!.label}' started successfully.`);
      } catch (error) {
        env.displayError(`Error starting '${service!.label}': ${error}. Check service configuration and try again. View logs in terminal for details.`);
      }
    });
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
        // Silent - user intentionally dismissed the picker
        return;
      }

      service = new ServiceItem(selected.label, "", "");
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Stopping service '${service.label}'...`,
      cancellable: false,
    }, async (progress) => {
      try {
        progress.report({ increment: 0 });
        await env.exec("flox", { argv: ["services", "stop", "--dir", env.workspaceUri!.fsPath, service!.label] });
        progress.report({ increment: 100 });
        await env.reload();
        env.displayMsg(`Service '${service!.label}' stopped successfully.`);
      } catch (error) {
        env.displayError(`Error stopping '${service!.label}': ${error}. Service may already be stopped. Try restarting manually. View logs in terminal for details.`);
      }
    });
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
        // Silent - user intentionally dismissed the picker
        return;
      }

      service = new ServiceItem(selected.label, "", "");
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Restarting service '${service.label}'...`,
      cancellable: false,
    }, async (progress) => {
      try {
        progress.report({ increment: 0 });
        await env.exec("flox", { argv: ["services", "restart", "--dir", env.workspaceUri!.fsPath, service!.label] });
        progress.report({ increment: 100 });
        await env.reload();
        env.displayMsg(`Service '${service!.label}' restarted successfully.`);
      } catch (error) {
        env.displayError(`Error restarting '${service!.label}': ${error}. Check service configuration and logs for details.`);
      }
    });
  });

  env.registerCommand('flox.serviceLogs', async (service: ServiceItem | undefined) => {
    if (!env.workspaceUri) { return; }

    // If service not provided (via Command Palette), show QuickPick of running services only
    if (!service) {
      const runningServices: vscode.QuickPickItem[] = [];
      if (env?.servicesStatus) {
        for (const [name, status] of env.servicesStatus) {
          if (status?.status?.toLowerCase() === "running") {
            runningServices.push({
              label: name,
              description: status?.status,
            });
          }
        }
      }

      if (runningServices.length === 0) {
        env.displayMsg("No running services to show logs for.");
        return;
      }

      const selected = await vscode.window.showQuickPick(runningServices, {
        placeHolder: 'Select a running service to show logs',
      });
      if (selected === undefined || selected?.label === undefined) {
        // Silent - user intentionally dismissed the picker
        return;
      }

      service = new ServiceItem(selected.label, "", "running");
    }

    const terminalName = `flox: ${service.label} logs`;

    // Reuse existing terminal if it exists
    let terminal = vscode.window.terminals.find(t => t.name === terminalName);
    if (!terminal) {
      terminal = vscode.window.createTerminal({ name: terminalName });
      terminal.sendText(`flox services logs --dir "${env.workspaceUri.fsPath}" --follow ${service.label}`, true);
    }
    terminal.show();
  });

  env.registerCommand('flox.edit', async () => {
    if (!env.workspaceUri) { return; }

    const manifestUri = vscode.Uri.joinPath(env.workspaceUri, ".flox", "env", "manifest.toml");

    try {
      const doc = await vscode.workspace.openTextDocument(manifestUri);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      env.displayError(`Failed to open manifest.toml. Ensure it exists and you have read permissions. See logs for details. You can edit it directly with: flox edit`);
    }
  });

  env.registerCommand('flox.search', async () => {
    const searchResults = await env.search();

    let selection: any = await vscode.window.showQuickPick(searchResults.map((pkg: any) => {
      var version = '';
      if (pkg?.name && pkg?.pname && pkg.name !== pkg.pname) {
        version = '(' + pkg.name.replace(`${pkg.pname}-`, '') + ') ';
      }
      // Use pkg_path for display (shows catalog prefix like "flox/package-name")
      // Fall back to attr_path for non-catalog packages
      const displayName = pkg?.pkg_path || pkg?.attr_path;
      return {
        label: displayName,
        description: `${version}${pkg?.description || ''}`,
        id: pkg?.attr_path,
        pkgPath: pkg?.pkg_path || pkg?.attr_path,
      };
    }));

    if (selection === undefined || selection?.label === undefined) {
      // Silent - user intentionally dismissed the picker
      return;
    }

    const command = `flox show ${selection.pkgPath}`;
    const terminal = vscode.window.createTerminal({ name: command });
    terminal.show(false);
    terminal.sendText(command, true);
  });

  env.registerCommand('flox.configureMcp', async () => {
    // Check conditions
    const mcpAvailable = await env.checkFloxMcpAvailable();
    const copilotInstalled = env.checkCopilotInstalled();
    const envActive = env.isEnvActive;

    if (!envActive) {
      vscode.window.showWarningMessage(
        'Flox environment must be active to configure MCP server. Please activate first.'
      );
      return;
    }

    if (!mcpAvailable) {
      // Non-blocking notification
      vscode.window.showWarningMessage(
        'flox-mcp command not found in PATH. Install it in your Flox environment first.',
        'Learn More'
      ).then((action) => {
        if (action === 'Learn More') {
          vscode.env.openExternal(vscode.Uri.parse('https://flox.dev/docs/tutorials/flox-agentic/'));
        }
      });
      return;
    }

    if (!copilotInstalled) {
      // Non-blocking notification
      vscode.window.showWarningMessage(
        'GitHub Copilot extension is not installed. Install it to use MCP features.',
        'Install Copilot'
      ).then((action) => {
        if (action === 'Install Copilot') {
          vscode.env.openExternal(vscode.Uri.parse('https://marketplace.visualstudio.com/items?itemName=GitHub.copilot'));
        }
      });
      return;
    }

    // All conditions met - register provider if not already done
    if (!mcpProvider) {
      mcpProvider = registerMcpProvider(context, env.workspaceUri);
    }

    if (mcpProvider) {
      vscode.window.showInformationMessage(
        'Flox Agentic MCP server is configured! Use @flox in Copilot Chat to access Flox tools and resources.'
      );
    } else {
      // Non-blocking notification
      vscode.window.showErrorMessage(
        'Failed to configure MCP server. This requires VSCode 1.102 or newer.',
        'Upgrade VSCode',
        'Learn More'
      ).then((action) => {
        if (action === 'Upgrade VSCode') {
          vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/download'));
        } else if (action === 'Learn More') {
          vscode.env.openExternal(vscode.Uri.parse('https://flox.dev/docs/tutorials/flox-agentic/'));
        }
      });
    }
  });

  env.registerCommand('flox.resetAutoActivate', async () => {
    output.appendLine('Reset auto-activate command invoked');

    // Reset preference
    await env.resetAutoActivatePreference();

    // Refresh settings view to update UI
    await settingsView.refresh();

    // Show success message
    vscode.window.showInformationMessage('Auto-activate preference reset. You will be prompted next time.');

    output.appendLine('Auto-activate preference reset successfully');

    // IMMEDIATELY show the prompt (user wants to make a new choice)
    const envExists = context.workspaceState.get('flox.envExists', false);
    const envActive = context.workspaceState.get('flox.envActive', false);

    if (envExists && !envActive) {
      output.appendLine('Showing auto-activate prompt after reset');
      await showAutoActivatePrompt(context, output, env);
    }
  });

  /**
   * Auto-Activate and Prompt Feature (Issues #47, #141)
   *
   * When a Flox environment is detected but not activated, either auto-activate
   * (if user previously chose "Always Activate") or show a popup asking.
   *
   * Workspace state key `flox.autoActivate`:
   * - `true`: Auto-activate without prompting (user chose "Always Activate")
   * - `false`: Never activate or prompt (user chose "Never Activate")
   * - `undefined`: Show popup (first time or user chose "Activate Once")
   *
   * The popup offers three options:
   * - "Always Activate": Activates AND remembers to auto-activate this workspace
   * - "Activate Once": Activates just this time, asks again next time
   * - "Never Activate": Remembers NOT to activate/prompt for this workspace
   *
   * The global `flox.promptToActivate` setting (default: true) acts as a master
   * switch - if disabled, no prompts or auto-activation occurs.
   *
   * The feature will NOT trigger when:
   * - No Flox environment exists in the workspace
   * - Environment is already activated
   * - flox.promptToActivate global setting is false
   * - Extension just restarted after activation (justActivated flag was set)
   *
   * NOTE: This code runs AFTER all commands are registered to ensure
   * that the flox.activate command exists when we try to call it.
   */
  const envExists = context.workspaceState.get('flox.envExists', false);
  const envActive = context.workspaceState.get('flox.envActive', false);
  const promptEnabled = vscode.workspace.getConfiguration('flox').get('promptToActivate', true);

  output.appendLine(`[STEP 4] Auto-activate check: envExists=${envExists}, envActive=${envActive}, promptEnabled=${promptEnabled}`);

  if (envExists && !envActive && promptEnabled) {
    output.appendLine(`[STEP 4] Entering auto-activate flow`);

    // Check if user has a remembered preference for this workspace
    const autoActivate = context.workspaceState.get<boolean | undefined>('flox.autoActivate');
    output.appendLine(`[STEP 4] autoActivate preference: ${autoActivate}`);

    if (autoActivate === true) {
      // User previously chose "Always Activate" - auto-activate silently
      output.appendLine(`[STEP 4] Auto-activating (user preference: Always Activate)`);
      await vscode.commands.executeCommand('flox.activate');
      output.appendLine(`[STEP 4] Auto-activate command completed`);
    } else if (autoActivate === false) {
      // User previously chose "Never Activate" - skip silently
      output.appendLine(`[STEP 4] Skipping activation (user preference: Never Activate)`);
    } else {
      // No preference (undefined) - show popup (non-blocking)
      output.appendLine(`[STEP 4] Showing activation prompt to user`);
      vscode.window.showInformationMessage(
        'A Flox environment was detected in this workspace. Would you like to activate it now?',
        'Always Activate',
        'Activate Once',
        'Not Now'
      ).then(async (selection) => {
        output.appendLine(`[STEP 4] User selected: ${selection}`);

        if (selection === 'Always Activate') {
          await context.workspaceState.update('flox.autoActivate', true);
          output.appendLine(`[STEP 4] Activating (Always Activate)`);
          await vscode.commands.executeCommand('flox.activate');
          output.appendLine(`[STEP 4] Activation command completed`);
        } else if (selection === 'Activate Once') {
          output.appendLine(`[STEP 4] Activating (Activate Once)`);
          await vscode.commands.executeCommand('flox.activate');
          output.appendLine(`[STEP 4] Activation command completed`);
        } else if (selection === 'Not Now') {
          output.appendLine(`[STEP 4] User chose Not Now`);
        } else {
          output.appendLine(`[STEP 4] User dismissed prompt`);
        }
        // Dismiss (undefined) - do nothing, popup will appear next time
      });
    }
  } else {
    output.appendLine(`[STEP 4] Skipping auto-activate (conditions not met)`);
  }

  output.appendLine(`[STEP 5] Extension activation complete`);
}
