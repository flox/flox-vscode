import * as vscode from 'vscode';
import Env from './env';
import { View, ItemState } from './config';


export class PackageItem extends vscode.TreeItem {
  public readonly state: ItemState;

  constructor(
    public readonly label: string,
    public readonly description: string,
    state: ItemState = ItemState.ACTIVE,
  ) {
    super(label);
    this.state = state;

    if (state === ItemState.PENDING) {
      // Pending indicator: asterisk suffix + warning color
      this.label = `${label} *`;
      this.iconPath = new vscode.ThemeIcon('package', new vscode.ThemeColor('list.warningForeground'));
      this.description = `${description} (pending)`;
      this.tooltip = 'Pending - changes not yet locked. Run "flox activate" to commit.';
    } else {
      this.iconPath = new vscode.ThemeIcon('package');
    }
  }
  contextValue = 'package';
}

export class VariableItem extends vscode.TreeItem {
  public readonly state: ItemState;

  constructor(
    public readonly label: string,
    public readonly description: string,
    state: ItemState = ItemState.ACTIVE,
  ) {
    super(label);
    this.state = state;

    if (state === ItemState.PENDING) {
      // Pending indicator: asterisk suffix + warning color
      this.label = `${label} *`;
      this.iconPath = new vscode.ThemeIcon('variable', new vscode.ThemeColor('list.warningForeground'));
      this.tooltip = 'Pending - changes not yet locked. Run "flox activate" to commit.';
    } else {
      this.iconPath = new vscode.ThemeIcon('variable');
    }
  }
  contextValue = 'variable';
}

export class SettingsItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly value: boolean | undefined,
  ) {
    super(label);
    this.iconPath = new vscode.ThemeIcon('settings-gear');
    this.description = description;

    // Set contextValue based on whether preference is set
    if (value === true) {
      this.contextValue = 'settings-autoactivate-always';
    } else if (value === false) {
      this.contextValue = 'settings-autoactivate-never';
    } else {
      this.contextValue = 'settings-autoactivate-notset';
    }
  }
}

export class ServiceItem extends vscode.TreeItem {
  public readonly state: ItemState;

  constructor(
    public readonly label: string,
    public readonly description: string,
    status: string,
    state: ItemState = ItemState.ACTIVE,
  ) {
    super(label);
    this.state = state;

    if (state === ItemState.PENDING) {
      // Pending indicator: asterisk suffix + warning color
      this.label = `${label} *`;
      this.iconPath = new vscode.ThemeIcon('server-process', new vscode.ThemeColor('list.warningForeground'));
      this.tooltip = 'Pending - changes not yet locked. Run "flox activate" to commit.';
    } else {
      this.iconPath = new vscode.ThemeIcon('server-process');
    }

    if (status.toLowerCase() === "running") {
      this.contextValue = `service-${status.toLowerCase()}`;
    }
  }
  contextValue = 'service';
}

export class InstallView implements View, vscode.TreeDataProvider<PackageItem> {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<PackageItem | undefined | null | void> = new vscode.EventEmitter<PackageItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<PackageItem | undefined | null | void> = this._onDidChangeTreeData.event;

  async refresh() {
    this._onDidChangeTreeData.fire();
  }

  registerProvider(viewName: string): vscode.Disposable {
    return vscode.window.registerTreeDataProvider(viewName, this);
  }

  getTreeItem(pkg: PackageItem): vscode.TreeItem {
    return pkg;
  }

  async getChildren(pkg?: PackageItem): Promise<PackageItem[]> {
    const envExists = this.env?.context.workspaceState.get('flox.envExists', false);
    if (!envExists) {
      return [];
    }

    // Show packages
    if (!pkg && this.env?.packages && this.env?.system) {
      const packages = this.env.packages.get(this.env.system);
      if (packages) {
        const result: PackageItem[] = [];
        for (const [_, pkg] of packages) {
          result.push(new PackageItem(
            pkg.install_id,
            `${pkg.attr_path} ( ${pkg.version} )`,
            pkg.state
          ));
        }
        // Sort: active items first, then pending
        return result.sort((a, b) => {
          if (a.state === b.state) { return 0; }
          return a.state === ItemState.ACTIVE ? -1 : 1;
        });
      }
    }

    return [];
  }
}

export class VarsView implements View, vscode.TreeDataProvider<PackageItem> {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<PackageItem | undefined | null | void> = new vscode.EventEmitter<PackageItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<PackageItem | undefined | null | void> = this._onDidChangeTreeData.event;

  async refresh() {
    this._onDidChangeTreeData.fire();
  }

  registerProvider(viewName: string) {
    return vscode.window.registerTreeDataProvider(viewName, this);
  }

  getTreeItem(variable: VariableItem): vscode.TreeItem {
    return variable;
  }

  async getChildren(variable?: VariableItem): Promise<VariableItem[]> {
    const envExists = this.env?.context.workspaceState.get('flox.envExists', false);
    if (!envExists) {
      return [];
    }

    if (!variable) {
      if (!this.env?.variables || this.env.variables.size === 0) {
        return [];
      }
      const result: VariableItem[] = [];
      for (const [_, v] of this.env.variables) {
        result.push(new VariableItem(v.name, v.value, v.state));
      }
      // Sort: active items first, then pending
      return result.sort((a, b) => {
        if (a.state === b.state) { return 0; }
        return a.state === ItemState.ACTIVE ? -1 : 1;
      });
    }

    return [];
  }
}

export class ServicesView implements View, vscode.TreeDataProvider<PackageItem> {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<PackageItem | undefined | null | void> = new vscode.EventEmitter<PackageItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<PackageItem | undefined | null | void> = this._onDidChangeTreeData.event;

  async refresh() {
    this._onDidChangeTreeData.fire();
  }

  registerProvider(viewName: string) {
    return vscode.window.registerTreeDataProvider(viewName, this);
  }

  getTreeItem(service: ServiceItem): vscode.TreeItem {
    return service;
  }

  async getChildren(service?: ServiceItem): Promise<ServiceItem[]> {
    const envExists = this.env?.context.workspaceState.get('flox.envExists', false);
    if (!envExists) {
      return [];
    }

    if (!service) {
      const serviceNames = this.env?.getMergedServiceNames() || [];
      if (serviceNames.length === 0) {
        return [];
      }

      const result: ServiceItem[] = serviceNames.map((name) => {
        var status = "Not started";
        if (this.env?.servicesStatus && this.env.servicesStatus.get(name)) {
          const serviceStatus = this.env.servicesStatus.get(name);
          status = serviceStatus?.status || "Not started";
        }
        const state = this.env?.getServiceState(name, this.env?.lockExists ?? false) ?? ItemState.ACTIVE;
        return new ServiceItem(name, `( ${status} )`, status, state);
      });

      // Sort: active items first, then pending
      return result.sort((a, b) => {
        if (a.state === b.state) { return 0; }
        return a.state === ItemState.ACTIVE ? -1 : 1;
      });
    }

    return [];
  }
}

export class SettingsView implements View, vscode.TreeDataProvider<SettingsItem> {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<SettingsItem | undefined | null | void> = new vscode.EventEmitter<SettingsItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<SettingsItem | undefined | null | void> = this._onDidChangeTreeData.event;

  async refresh() {
    this._onDidChangeTreeData.fire();
  }

  registerProvider(viewName: string) {
    return vscode.window.registerTreeDataProvider(viewName, this);
  }

  getTreeItem(item: SettingsItem): vscode.TreeItem {
    return item;
  }

  async getChildren(item?: SettingsItem): Promise<SettingsItem[]> {
    const envExists = this.env?.context.workspaceState.get('flox.envExists', false);
    if (!envExists || item) {
      return [];
    }

    // Get current auto-activate preference
    const autoActivate = this.env?.context.workspaceState.get<boolean | undefined>('flox.autoActivate');

    let description: string;
    if (autoActivate === true) {
      description = 'Always';
    } else if (autoActivate === false) {
      description = 'Never';
    } else {
      description = 'Not Set';
    }

    return [
      new SettingsItem('Auto-Activate', description, autoActivate)
    ];
  }
}

export class HelpView implements View, vscode.WebviewViewProvider {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<PackageItem | undefined | null | void> = new vscode.EventEmitter<PackageItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<PackageItem | undefined | null | void> = this._onDidChangeTreeData.event;

  async refresh() {
    this._onDidChangeTreeData.fire();
  }

  registerProvider(viewName: string) {
    return vscode.window.registerWebviewViewProvider(viewName, this);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    webviewView.webview.html = `
      <ul style="
            padding:0 0.5em;
            line-height:1.5em;
            list-style:circle;
          ">
        <li><a href="https://discourse.flox.dev/">Discourse</a></li>
        <li><a href="https://go.flox.dev/slack">Slack</a></li>
        <li><a href="https://flox.dev">Documentation</a></li>
        <li><a href="https://flox.dev/blog">Blog</a></li>
        <li><a href="https://twitter.com/floxdevelopment">Twitter</a></li>
      </ul>
    `;
  }
}
