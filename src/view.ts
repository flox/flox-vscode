import * as vscode from 'vscode';
import Env from './env';


class InstalledPackage extends vscode.TreeItem {
  constructor(label: string) {
    super(label);
  }
}

export class InstallView implements vscode.TreeDataProvider<InstalledPackage> {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<InstalledPackage | undefined | null | void> = new vscode.EventEmitter<InstalledPackage | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<InstalledPackage | undefined | null | void> = this._onDidChangeTreeData.event;

  async refresh() {
    this._onDidChangeTreeData.fire();
  }

  registerProvider(viewName: string) {
    return vscode.window.registerTreeDataProvider(viewName, this);
  }

  getTreeItem(pkg: InstalledPackage): vscode.TreeItem {
    return pkg;
  }

  async getChildren(pkg?: InstalledPackage): Promise<InstalledPackage[]> {
    const envExists = this.env?.context.workspaceState.get('flox.envExists', false);
    if (envExists) {
      return [];
    }

    // Show packages
    if (!pkg) {
      if (!this.env?.manifest?.install) {
        return [];
      }
      const pkgs = Object.keys(this.env.manifest.install)
      return pkgs.map((x) => new InstalledPackage(x));
    }

    // TODO: Show package details
    return [];
  }
}

export class HelpView implements vscode.WebviewViewProvider {

  env?: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<InstalledPackage | undefined | null | void> = new vscode.EventEmitter<InstalledPackage | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<InstalledPackage | undefined | null | void> = this._onDidChangeTreeData.event;

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


