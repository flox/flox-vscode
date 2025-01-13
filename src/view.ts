import * as vscode from 'vscode';
import Env from './env';


export class Package extends vscode.TreeItem {
  constructor(
    public readonly label: string,
  ) {
    super(label);
    this.iconPath = new vscode.ThemeIcon('package');
  }
  contextValue = 'package';
}

export class Variable extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly description: string,
  ) {
    super(label);
    this.iconPath = new vscode.ThemeIcon('variable');
  }
  contextValue = 'variable';
}

export class InstallView implements vscode.TreeDataProvider<Package> {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<Package | undefined | null | void> = new vscode.EventEmitter<Package | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Package | undefined | null | void> = this._onDidChangeTreeData.event;

  async refresh() {
    this._onDidChangeTreeData.fire();
  }

  registerProvider(viewName: string) {
    return vscode.window.registerTreeDataProvider(viewName, this);
  }

  getTreeItem(pkg: Package): vscode.TreeItem {
    return pkg;
  }

  async getChildren(pkg?: Package): Promise<Package[]> {
    const envExists = this.env?.context.workspaceState.get('flox.envExists', false);
    if (!envExists) {
      return [];
    }

    // Show packages
    if (!pkg) {
      if (!this.env?.manifest?.install) {
        return [];
      }
      const packages = Object.keys(this.env.manifest.install)
      return packages.map((x) => new Package(x));
    }

    // TODO: Show package details
    return [];
  }
}

export class VarsView implements vscode.TreeDataProvider<Package> {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<Package | undefined | null | void> = new vscode.EventEmitter<Package | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Package | undefined | null | void> = this._onDidChangeTreeData.event;

  async refresh() {
    this._onDidChangeTreeData.fire();
  }

  registerProvider(viewName: string) {
    return vscode.window.registerTreeDataProvider(viewName, this);
  }

  getTreeItem(variable: Variable): vscode.TreeItem {
    return variable;
  }

  async getChildren(variable?: Variable): Promise<Package[]> {
    const envExists = this.env?.context.workspaceState.get('flox.envExists', false);
    if (!envExists) {
      return [];
    }

    // Show variables
    if (!variable) {
      if (!this.env?.manifest?.vars) {
        return [];
      }
      const vars = Object.keys(this.env.manifest.vars)
      return vars.map((name) => new Variable(name, this.env?.manifest?.vars[name]));
    }

    return [];
  }
}

export class HelpView implements vscode.WebviewViewProvider {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<Package | undefined | null | void> = new vscode.EventEmitter<Package | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<Package | undefined | null | void> = this._onDidChangeTreeData.event;

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


