import * as vscode from 'vscode';
import Env from './env';


export class InstallView implements vscode.TreeDataProvider<FloxItem> {

  private env: Env;

  private _onDidChangeTreeData: vscode.EventEmitter<FloxItem | undefined | null | void> = new vscode.EventEmitter<FloxItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FloxItem | undefined | null | void> = this._onDidChangeTreeData.event;

  constructor(env: Env) {
    this.env = env;
  }

  getTreeItem(element: FloxItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FloxItem): Thenable<FloxItem[]> {
    if (!element) {
      // Root items
      return Promise.resolve([
        new FloxItem('Item 1'),
        new FloxItem('Item 2')
      ]);
    }
    return Promise.resolve([]);
  }
}

class FloxItem extends vscode.TreeItem {
  constructor(label: string) {
    super(label);
  }
}

