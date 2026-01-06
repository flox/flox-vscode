/**
 * Unit tests for src/view.ts
 *
 * This file tests the TreeView providers that power the Flox sidebar in VSCode.
 * The sidebar displays:
 * - Installed packages (InstallView)
 * - Environment variables (VarsView)
 * - Services and their status (ServicesView)
 *
 * Testing approach:
 * - TreeItem classes: Test that constructor properly sets label, description, icon, and contextValue
 * - TreeDataProvider: Test getChildren() returns correct items based on env state
 * - Event emission: Test that refresh() fires onDidChangeTreeData to update UI
 *
 * Why test this?
 * - These views are the primary UI for the extension
 * - Incorrect contextValue breaks context menu items (e.g., uninstall button)
 * - getChildren() must return correct data structure for VSCode to render
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import { PackageItem, VariableItem, ServiceItem, InstallView, VarsView, ServicesView } from '../../view';
import { System, Package, ItemState } from '../../config';
import { createMockExtensionContext } from '../mocks/vscode';

suite('View Unit Tests', () => {
  /**
   * PackageItem Tests
   *
   * PackageItem represents a single installed package in the sidebar.
   * It extends vscode.TreeItem and displays:
   * - label: The package's install_id (e.g., "nodejs")
   * - description: Package path and version (e.g., "nodejs (20.0.0)")
   * - icon: Package icon from VSCode theme
   * - contextValue: "package" - enables context menu actions like uninstall
   */
  suite('PackageItem', () => {
    test('should set label correctly', () => {
      const item = new PackageItem('nodejs', 'nodejs-20.0.0');
      assert.strictEqual(item.label, 'nodejs');
    });

    test('should set description correctly', () => {
      // Description typically shows attr_path and version
      const item = new PackageItem('nodejs', 'nodejs-20.0.0 (20.0.0)');
      assert.strictEqual(item.description, 'nodejs-20.0.0 (20.0.0)');
    });

    test('should have package icon', () => {
      // VSCode ThemeIcon 'package' shows a box icon
      const item = new PackageItem('nodejs', 'description');
      assert.ok(item.iconPath instanceof vscode.ThemeIcon);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'package');
    });

    test('should have contextValue of "package"', () => {
      // contextValue is used in package.json to enable/disable menu items
      // "when": "viewItem == package" enables the uninstall button
      const item = new PackageItem('nodejs', 'description');
      assert.strictEqual(item.contextValue, 'package');
    });

    test('should add asterisk suffix for pending items', () => {
      const item = new PackageItem('nodejs', 'description', ItemState.PENDING);
      assert.strictEqual(item.label, 'nodejs *');
    });

    test('should have warning color for pending items', () => {
      const item = new PackageItem('nodejs', 'description', ItemState.PENDING);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.ok(icon.color instanceof vscode.ThemeColor);
    });

    test('should have tooltip for pending items', () => {
      const item = new PackageItem('nodejs', 'description', ItemState.PENDING);
      assert.ok(item.tooltip);
      assert.ok((item.tooltip as string).toLowerCase().includes('pending'));
    });

    test('should not modify active items', () => {
      const item = new PackageItem('nodejs', 'description', ItemState.ACTIVE);
      assert.strictEqual(item.label, 'nodejs');
    });
  });

  /**
   * VariableItem Tests
   *
   * VariableItem represents an environment variable from manifest.toml [vars] section.
   * Shows the variable name as label and its value as description.
   */
  suite('VariableItem', () => {
    test('should set label correctly', () => {
      const item = new VariableItem('MY_VAR', 'my_value');
      assert.strictEqual(item.label, 'MY_VAR');
    });

    test('should set description correctly', () => {
      // Description shows the variable's value
      const item = new VariableItem('MY_VAR', 'my_value');
      assert.strictEqual(item.description, 'my_value');
    });

    test('should have variable icon', () => {
      const item = new VariableItem('MY_VAR', 'my_value');
      assert.ok(item.iconPath instanceof vscode.ThemeIcon);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'variable');
    });

    test('should have contextValue of "variable"', () => {
      const item = new VariableItem('MY_VAR', 'my_value');
      assert.strictEqual(item.contextValue, 'variable');
    });

    test('should add asterisk suffix for pending variables', () => {
      const item = new VariableItem('MY_VAR', 'my_value', ItemState.PENDING);
      assert.strictEqual(item.label, 'MY_VAR *');
    });

    test('should have warning color for pending variables', () => {
      const item = new VariableItem('MY_VAR', 'my_value', ItemState.PENDING);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.ok(icon.color instanceof vscode.ThemeColor);
    });

    test('should not modify active variables', () => {
      const item = new VariableItem('MY_VAR', 'my_value', ItemState.ACTIVE);
      assert.strictEqual(item.label, 'MY_VAR');
    });
  });

  /**
   * ServiceItem Tests
   *
   * ServiceItem represents a service defined in manifest.toml [services] section.
   * The contextValue changes based on status to enable/disable start/stop buttons:
   * - "service-running": Service is running, show stop/restart buttons
   * - "service": Service is not running, show start button
   */
  suite('ServiceItem', () => {
    test('should set label correctly', () => {
      const item = new ServiceItem('myservice', '( Running )', 'Running');
      assert.strictEqual(item.label, 'myservice');
    });

    test('should set description correctly', () => {
      // Description shows status in parentheses
      const item = new ServiceItem('myservice', '( Running )', 'Running');
      assert.strictEqual(item.description, '( Running )');
    });

    test('should have server-process icon', () => {
      const item = new ServiceItem('myservice', '( Running )', 'Running');
      assert.ok(item.iconPath instanceof vscode.ThemeIcon);
      assert.strictEqual((item.iconPath as vscode.ThemeIcon).id, 'server-process');
    });

    test('should have contextValue "service-running" when status is Running', () => {
      // This enables the stop and restart buttons in the context menu
      // See package.json: "when": "viewItem == service-running"
      const item = new ServiceItem('myservice', '( Running )', 'Running');
      assert.strictEqual(item.contextValue, 'service-running');
    });

    test('should have contextValue "service" when status is not Running', () => {
      // This enables the start button only
      const item = new ServiceItem('myservice', '( Stopped )', 'Stopped');
      assert.strictEqual(item.contextValue, 'service');
    });

    test('should handle lowercase "running" status', () => {
      // Status comparison is case-insensitive
      const item = new ServiceItem('myservice', '( running )', 'running');
      assert.strictEqual(item.contextValue, 'service-running');
    });

    test('should handle "Not started" status', () => {
      // Default status when service hasn't been started yet
      const item = new ServiceItem('myservice', '( Not started )', 'Not started');
      assert.strictEqual(item.contextValue, 'service');
    });

    test('should add asterisk suffix for pending services', () => {
      const item = new ServiceItem('myservice', '( Not started )', 'Not started', ItemState.PENDING);
      assert.strictEqual(item.label, 'myservice *');
    });

    test('should have warning color for pending services', () => {
      const item = new ServiceItem('myservice', '( Not started )', 'Not started', ItemState.PENDING);
      const icon = item.iconPath as vscode.ThemeIcon;
      assert.ok(icon.color instanceof vscode.ThemeColor);
    });

    test('should not modify active services', () => {
      const item = new ServiceItem('myservice', '( Running )', 'Running', ItemState.ACTIVE);
      assert.strictEqual(item.label, 'myservice');
    });
  });

  /**
   * InstallView Tests
   *
   * InstallView is a TreeDataProvider that displays installed packages.
   * It reads from env.packages which is a Map<System, Map<install_id, Package>>.
   *
   * Testing approach:
   * - Mock the env object with different states
   * - Verify getChildren() returns correct PackageItems
   */
  suite('InstallView', () => {
    let installView: InstallView;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
      installView = new InstallView();
      mockContext = createMockExtensionContext();
    });

    test('should return empty array when env does not exist', async () => {
      // When flox.envExists is false, no packages should be shown
      installView.env = {
        context: mockContext,
        packages: undefined,
        system: undefined,
      } as any;

      const children = await installView.getChildren();
      assert.deepStrictEqual(children, []);
    });

    test('should return packages when env exists and has packages', async () => {
      // Set up workspace state to indicate env exists
      await mockContext.workspaceState.update('flox.envExists', true);

      // Create mock packages map - structure matches what reload() creates
      const packagesMap: Map<string, Package> = new Map([
        ['nodejs', {
          install_id: 'nodejs',
          system: System.AARCH64_DARWIN,
          version: '20.0.0',
          group: 'default',
          license: 'MIT',
          description: 'Node.js runtime',
          attr_path: 'nodejs',
          state: ItemState.ACTIVE,
        }],
        ['python3', {
          install_id: 'python3',
          system: System.AARCH64_DARWIN,
          version: '3.11.0',
          group: 'default',
          license: 'PSF',
          description: 'Python interpreter',
          attr_path: 'python3',
          state: ItemState.ACTIVE,
        }],
      ]);

      // Packages are stored by system
      const allPackages: Map<System, Map<string, Package>> = new Map([
        [System.AARCH64_DARWIN, packagesMap],
      ]);

      installView.env = {
        context: mockContext,
        packages: allPackages,
        system: System.AARCH64_DARWIN,
      } as any;

      const children = await installView.getChildren();
      assert.strictEqual(children.length, 2);
      assert.ok(children.some(c => c.label === 'nodejs'));
      assert.ok(children.some(c => c.label === 'python3'));
    });

    test('getTreeItem should return the same item', () => {
      // TreeDataProvider interface requires getTreeItem to return the TreeItem
      const item = new PackageItem('test', 'description');
      const result = installView.getTreeItem(item);
      assert.strictEqual(result, item);
    });

    test('refresh should fire onDidChangeTreeData event', async () => {
      // VSCode uses this event to know when to re-render the tree
      let eventFired = false;
      installView.onDidChangeTreeData(() => {
        eventFired = true;
      });

      await installView.refresh();
      assert.strictEqual(eventFired, true);
    });
  });

  /**
   * VarsView Tests
   *
   * VarsView displays environment variables from manifest.toml [vars] section.
   * Variables are stored in env.manifest.manifest.vars object.
   */
  suite('VarsView', () => {
    let varsView: VarsView;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
      varsView = new VarsView();
      mockContext = createMockExtensionContext();
    });

    test('should return empty array when env does not exist', async () => {
      varsView.env = {
        context: mockContext,
        manifest: undefined,
      } as any;

      const children = await varsView.getChildren();
      assert.deepStrictEqual(children, []);
    });

    test('should return empty array when no vars in manifest', async () => {
      await mockContext.workspaceState.update('flox.envExists', true);

      varsView.env = {
        context: mockContext,
        manifest: { manifest: {} },
      } as any;

      const children = await varsView.getChildren();
      assert.deepStrictEqual(children, []);
    });

    test('should return variables when manifest has vars', async () => {
      await mockContext.workspaceState.update('flox.envExists', true);

      // VarsView now uses env.variables Map instead of manifest.manifest.vars
      const variablesMap = new Map([
        ['MY_VAR', { name: 'MY_VAR', value: 'value1', state: ItemState.ACTIVE }],
        ['OTHER_VAR', { name: 'OTHER_VAR', value: 'value2', state: ItemState.ACTIVE }],
      ]);

      varsView.env = {
        context: mockContext,
        variables: variablesMap,
      } as any;

      const children = await varsView.getChildren();
      assert.strictEqual(children.length, 2);
      assert.ok(children.some(c => c.label === 'MY_VAR'));
      assert.ok(children.some(c => c.label === 'OTHER_VAR'));
    });

    test('refresh should fire onDidChangeTreeData event', async () => {
      let eventFired = false;
      varsView.onDidChangeTreeData(() => {
        eventFired = true;
      });

      await varsView.refresh();
      assert.strictEqual(eventFired, true);
    });
  });

  /**
   * ServicesView Tests
   *
   * ServicesView displays services from manifest.toml [services] section.
   * It combines service definitions from manifest with runtime status from
   * env.servicesStatus (populated by `flox services status`).
   */
  suite('ServicesView', () => {
    let servicesView: ServicesView;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
      servicesView = new ServicesView();
      mockContext = createMockExtensionContext();
    });

    test('should return empty array when env does not exist', async () => {
      servicesView.env = {
        context: mockContext,
        manifest: undefined,
        servicesStatus: undefined,
      } as any;

      const children = await servicesView.getChildren();
      assert.deepStrictEqual(children, []);
    });

    test('should return services when manifest has services', async () => {
      await mockContext.workspaceState.update('flox.envExists', true);

      // servicesStatus is a Map<serviceName, ServiceStatus>
      const servicesStatus = new Map([
        ['webserver', { name: 'webserver', status: 'Running', pid: 1234 }],
      ]);

      // Services are defined in manifest.manifest.services object
      // Mock the new methods required by ServicesView
      servicesView.env = {
        context: mockContext,
        manifest: {
          manifest: {
            services: {
              'webserver': { command: 'nginx' },
              'database': { command: 'postgres' },
            },
          },
        },
        servicesStatus,
        lockExists: true,
        getMergedServiceNames: () => ['webserver', 'database'],
        getServiceState: () => ItemState.ACTIVE,
      } as any;

      const children = await servicesView.getChildren();
      assert.strictEqual(children.length, 2);
      assert.ok(children.some(c => c.label === 'webserver'));
      assert.ok(children.some(c => c.label === 'database'));
    });

    test('should show correct status for running service', async () => {
      await mockContext.workspaceState.update('flox.envExists', true);

      const servicesStatus = new Map([
        ['webserver', { name: 'webserver', status: 'Running', pid: 1234 }],
      ]);

      servicesView.env = {
        context: mockContext,
        manifest: {
          manifest: {
            services: {
              'webserver': { command: 'nginx' },
            },
          },
        },
        servicesStatus,
        lockExists: true,
        getMergedServiceNames: () => ['webserver'],
        getServiceState: () => ItemState.ACTIVE,
      } as any;

      const children = await servicesView.getChildren();
      assert.strictEqual(children.length, 1);
      const service = children[0] as ServiceItem;
      assert.strictEqual(service.label, 'webserver');
      assert.strictEqual(service.description, '( Running )');
    });

    test('should show "Not started" for services without status', async () => {
      // Services that haven't been started won't have an entry in servicesStatus
      await mockContext.workspaceState.update('flox.envExists', true);

      servicesView.env = {
        context: mockContext,
        manifest: {
          manifest: {
            services: {
              'webserver': { command: 'nginx' },
            },
          },
        },
        servicesStatus: new Map(), // Empty - no services started
        lockExists: true,
        getMergedServiceNames: () => ['webserver'],
        getServiceState: () => ItemState.ACTIVE,
      } as any;

      const children = await servicesView.getChildren();
      assert.strictEqual(children.length, 1);
      const service = children[0] as ServiceItem;
      assert.strictEqual(service.description, '( Not started )');
    });

    test('refresh should fire onDidChangeTreeData event', async () => {
      let eventFired = false;
      servicesView.onDidChangeTreeData(() => {
        eventFired = true;
      });

      await servicesView.refresh();
      assert.strictEqual(eventFired, true);
    });
  });
});
