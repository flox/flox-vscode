import * as vscode from 'vscode';

export enum System {
  AARCH64_LINUX = "aarch64-linux",
  AARCH64_DARWIN = "aarch64-darwin",
  X86_64_LINUX = "x86_64-linux",
  X86_64_DARWIN = "x86_64-darwin",
}

export enum ItemState {
  ACTIVE = 'active',
  PENDING = 'pending',
}

export type Package = {
  install_id: string,
  system: System,
  version: string,
  group: string,
  license: string,
  description: string,
  attr_path: string,
  state: ItemState,
}

export type Packages = Map<System, Map<string, Package>>

export type Service = {
  name: string,
  status: string,
  pid: number,
  state?: ItemState,
}
export type Services = Map<string, Service>

export type Variable = {
  name: string,
  value: string,
  state: ItemState,
}

export interface View {
  registerProvider(viewName: string): vscode.Disposable;
  refresh(): Promise<void>;
}

