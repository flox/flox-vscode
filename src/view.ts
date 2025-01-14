import * as vscode from 'vscode';
import Env from './env';
import { View } from './config';


export class PackageItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
  ) {
    super(label);
    this.iconPath = new vscode.ThemeIcon('package');
  }
  contextValue = 'package';
}

export class VariableItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
  ) {
    super(label);
    this.iconPath = new vscode.ThemeIcon('variable');
  }
  contextValue = 'variable';
}

export class ServiceItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
    status: string,
  ) {
    super(label);
    this.iconPath = new vscode.ThemeIcon('server-process');
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
        var result = [];
        for (const [_, pkg] of packages) {
          result.push(new PackageItem(pkg.install_id, `( ${pkg.version} )`));
        }
        return result;
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

  async getChildren(variable?: VariableItem): Promise<PackageItem[]> {
    const envExists = this.env?.context.workspaceState.get('flox.envExists', false);
    if (!envExists) {
      return [];
    }

    if (!variable) {
      if (!this.env?.manifest?.manifest?.vars) {
        return [];
      }
      const vars = Object.keys(this.env.manifest.manifest.vars);
      return vars.map((name) => new VariableItem(name, this.env?.manifest?.manifest?.vars[name]));
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

  async getChildren(service?: ServiceItem): Promise<PackageItem[]> {
    const envExists = this.env?.context.workspaceState.get('flox.envExists', false);
    if (!envExists) {
      return [];
    }

    if (!service) {
      if (!this.env?.manifest?.manifest?.services) {
        return [];
      }
      const services = Object.keys(this.env.manifest.manifest.services);

      return services.map((name) => {
        var status = "Not started";
        if (this.env?.servicesStatus && this.env.servicesStatus.get(name)) {
          const serviceStatus = this.env.servicesStatus.get(name);
          status = serviceStatus?.status || "Not started";
        }
        return new ServiceItem(name, `( ${status} )`, status);
      });
    }

    return [];
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
