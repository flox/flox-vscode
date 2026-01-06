/**
 * VSCode API Mock Utilities
 *
 * This file provides mock implementations of VSCode APIs for unit testing.
 * Using mocks allows tests to run without a full VSCode instance, making them
 * faster and more reliable.
 *
 * Mock Classes:
 * - MockMemento: Implements vscode.Memento (workspaceState, globalState)
 * - MockEnvironmentVariableCollection: Implements terminal env var collection
 * - MockFileSystemWatcher: Implements file system watcher with event triggers
 *
 * Factory Functions:
 * - createMockExtensionContext(): Creates a full ExtensionContext mock
 * - createMockUri(): Helper to create vscode.Uri
 * - createMockCallTracker(): Tracks calls to mocked functions
 *
 * Usage:
 * ```typescript
 * import { createMockExtensionContext } from '../mocks/vscode';
 *
 * const mockContext = createMockExtensionContext();
 * const env = new Env(mockContext, workspaceUri);
 * ```
 *
 * Why mock VSCode APIs?
 * - Unit tests should run fast without launching VSCode
 * - Mocks allow testing error conditions that are hard to reproduce
 * - Isolated tests are more reliable and easier to debug
 */

import * as vscode from 'vscode';

/**
 * MockMemento - Implements vscode.Memento interface
 *
 * Used for mocking workspaceState and globalState in ExtensionContext.
 * Stores values in a Map for the duration of the test.
 *
 * Key methods:
 * - get(key, defaultValue): Retrieve stored value
 * - update(key, value): Store a value
 * - clear(): Reset all stored values (helper for test cleanup)
 */
export class MockMemento implements vscode.Memento {
  private storage: Map<string, any> = new Map();

  keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.storage.has(key)) {
      return this.storage.get(key);
    }
    return defaultValue;
  }

  async update(key: string, value: any): Promise<void> {
    this.storage.set(key, value);
  }

  setKeysForSync(_keys: readonly string[]): void {
    // No-op for mock
  }

  clear(): void {
    this.storage.clear();
  }
}

/**
 * MockEnvironmentVariableCollection - Implements vscode.EnvironmentVariableCollection
 *
 * Used for mocking context.environmentVariableCollection which controls
 * environment variables applied to VSCode integrated terminals.
 *
 * The extension uses this to apply Flox environment variables to terminals
 * after `flox activate` runs.
 *
 * Key methods:
 * - replace(variable, value): Set a variable to a specific value
 * - append/prepend(variable, value): Modify existing variables
 * - clear(): Remove all environment modifications
 */
export class MockEnvironmentVariableCollection implements vscode.EnvironmentVariableCollection {
  private variables: Map<string, vscode.EnvironmentVariableMutator> = new Map();
  persistent = true;
  description: string | vscode.MarkdownString | undefined;

  get size(): number {
    return this.variables.size;
  }

  getScoped(_scope: vscode.EnvironmentVariableScope): vscode.EnvironmentVariableCollection {
    return this;
  }

  replace(variable: string, value: string): void {
    this.variables.set(variable, {
      type: vscode.EnvironmentVariableMutatorType.Replace,
      value,
      options: {},
    });
  }

  append(variable: string, value: string): void {
    this.variables.set(variable, {
      type: vscode.EnvironmentVariableMutatorType.Append,
      value,
      options: {},
    });
  }

  prepend(variable: string, value: string): void {
    this.variables.set(variable, {
      type: vscode.EnvironmentVariableMutatorType.Prepend,
      value,
      options: {},
    });
  }

  get(variable: string): vscode.EnvironmentVariableMutator | undefined {
    return this.variables.get(variable);
  }

  forEach(
    callback: (variable: string, mutator: vscode.EnvironmentVariableMutator, collection: vscode.EnvironmentVariableCollection) => any,
    thisArg?: any
  ): void {
    this.variables.forEach((mutator, variable) => {
      callback.call(thisArg, variable, mutator, this);
    });
  }

  delete(variable: string): void {
    this.variables.delete(variable);
  }

  clear(): void {
    this.variables.clear();
  }

  [Symbol.iterator](): Iterator<[variable: string, mutator: vscode.EnvironmentVariableMutator]> {
    return this.variables[Symbol.iterator]();
  }
}

/**
 * MockFileSystemWatcher - Implements vscode.FileSystemWatcher
 *
 * Used for testing file watcher behavior without real filesystem events.
 * The extension watches manifest.toml and manifest.lock for changes.
 *
 * In tests, you can manually trigger events:
 * - fireCreate(uri): Simulate file creation
 * - fireChange(uri): Simulate file modification
 * - fireDelete(uri): Simulate file deletion
 */
export class MockFileSystemWatcher implements vscode.FileSystemWatcher {
  private _onDidCreate = new vscode.EventEmitter<vscode.Uri>();
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  private _onDidDelete = new vscode.EventEmitter<vscode.Uri>();

  readonly onDidCreate = this._onDidCreate.event;
  readonly onDidChange = this._onDidChange.event;
  readonly onDidDelete = this._onDidDelete.event;

  ignoreCreateEvents = false;
  ignoreChangeEvents = false;
  ignoreDeleteEvents = false;

  // Helper methods to trigger events in tests
  fireCreate(uri: vscode.Uri): void {
    this._onDidCreate.fire(uri);
  }

  fireChange(uri: vscode.Uri): void {
    this._onDidChange.fire(uri);
  }

  fireDelete(uri: vscode.Uri): void {
    this._onDidDelete.fire(uri);
  }

  dispose(): void {
    this._onDidCreate.dispose();
    this._onDidChange.dispose();
    this._onDidDelete.dispose();
  }
}

/**
 * createMockExtensionContext - Factory for mock ExtensionContext
 *
 * Creates a complete mock of vscode.ExtensionContext that can be passed
 * to the Env class constructor. All required properties are populated
 * with mock implementations.
 *
 * @param extensionPath - Base path for the mock extension (default: '/mock/extension')
 * @returns A complete ExtensionContext mock
 *
 * Example:
 * ```typescript
 * const ctx = createMockExtensionContext();
 * const env = new Env(ctx, workspaceUri);
 *
 * // Check workspace state was updated
 * await ctx.workspaceState.update('myKey', 'myValue');
 * assert.strictEqual(ctx.workspaceState.get('myKey'), 'myValue');
 * ```
 */
export function createMockExtensionContext(extensionPath: string = '/mock/extension'): vscode.ExtensionContext {
  const workspaceState = new MockMemento();
  const globalState = new MockMemento();
  const secrets: vscode.SecretStorage = {
    get: async () => undefined,
    store: async () => {},
    delete: async () => {},
    keys: async () => [],
    onDidChange: new vscode.EventEmitter<vscode.SecretStorageChangeEvent>().event,
  };

  return {
    subscriptions: [],
    workspaceState,
    globalState,
    secrets,
    extensionUri: vscode.Uri.file(extensionPath),
    extensionPath,
    environmentVariableCollection: new MockEnvironmentVariableCollection(),
    storagePath: '/mock/storage',
    storageUri: vscode.Uri.file('/mock/storage'),
    globalStoragePath: '/mock/globalStorage',
    globalStorageUri: vscode.Uri.file('/mock/globalStorage'),
    logPath: '/mock/log',
    logUri: vscode.Uri.file('/mock/log'),
    extensionMode: vscode.ExtensionMode.Test,
    extension: {
      id: 'flox.flox',
      extensionUri: vscode.Uri.file(extensionPath),
      extensionPath,
      isActive: true,
      packageJSON: {},
      exports: undefined,
      activate: async () => {},
      extensionKind: vscode.ExtensionKind.Workspace,
    },
    asAbsolutePath: (relativePath: string) => `${extensionPath}/${relativePath}`,
    languageModelAccessInformation: {
      onDidChange: new vscode.EventEmitter<void>().event,
      canSendRequest: () => undefined,
    },
  };
}

// Helper to create mock Uri
export function createMockUri(path: string): vscode.Uri {
  return vscode.Uri.file(path);
}

// Mock Env class dependencies for isolated testing
export interface MockEnvDeps {
  execResult?: { stdout?: string; stderr?: string };
  execError?: Error;
  fileExistsResult?: boolean;
  loadFileResult?: any;
}

// Track calls to mocked functions
export interface MockCallTracker {
  displayMsgCalls: string[];
  displayErrorCalls: string[];
  execCalls: Array<{ command: string; argv: string[] }>;
  commandRegistrations: string[];
}

export function createMockCallTracker(): MockCallTracker {
  return {
    displayMsgCalls: [],
    displayErrorCalls: [],
    execCalls: [],
    commandRegistrations: [],
  };
}
