/**
 * Unit tests for src/upgrades.ts
 *
 * Package upgrade hints come from `flox upgrade --dry-run` and are shown as CodeLenses
 * above each package in manifest.toml. These tests cover parsing the dry-run output,
 * finding packages in the manifest, and the lenses the provider returns.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  findInstallEntryLines,
  isFloxManifest,
  parseUpgradeDryRun,
  registerUpgradeHints,
  UpgradeCodeLensProvider,
  upgradeLensTitle,
} from '../../upgrades';
import { createMockExtensionContext } from '../mocks/vscode';

const DRY_RUN_OUTPUT = `Dry run: 2 version changes and 1 rebuild in environment 'myproject':
- curl: 8.9.0 -> 8.10.1
- hello: 2.12.1 (rebuild)
- python3: 3.12.7 -> 3.12.8

To apply these changes, run upgrade without the '--dry-run' flag.
`;

const MANIFEST = `version = 1

# packages
[install]
curl.pkg-path = "curl"
curl.version = "^8"
hello = { pkg-path = "hello" }
"python3".pkg-path = "python312"
jq.pkg-path = "jq"

[vars]
curl = "not a package"

[install.nodejs]
pkg-path = "nodejs_22"

[profile]
common = '''
  echo hi
'''
`;

suite('Upgrades Unit Tests', () => {
  suite('parseUpgradeDryRun', () => {
    test('reads version changes and rebuilds', () => {
      const upgrades = parseUpgradeDryRun(DRY_RUN_OUTPUT);
      assert.deepStrictEqual([...upgrades.values()], [
        { installId: 'curl', from: '8.9.0', to: '8.10.1', rebuild: false },
        { installId: 'hello', from: '2.12.1', to: '2.12.1', rebuild: true },
        { installId: 'python3', from: '3.12.7', to: '3.12.8', rebuild: false },
      ]);
    });

    test('returns nothing when there are no upgrades', () => {
      assert.strictEqual(parseUpgradeDryRun("No upgrades available for packages in environment 'myproject'.").size, 0);
      assert.strictEqual(parseUpgradeDryRun(
        "Upgrades are not available for environment 'myproject' on this system, but upgrades are\n" +
        'available for other systems supported by this environment.'
      ).size, 0);
      assert.strictEqual(parseUpgradeDryRun('').size, 0);
    });

    test('handles Windows line endings and indentation', () => {
      const upgrades = parseUpgradeDryRun('Dry run: 1 version change:\r\n  - go: 1.22.0 -> 1.23.1\r\n');
      assert.deepStrictEqual(upgrades.get('go'), { installId: 'go', from: '1.22.0', to: '1.23.1', rebuild: false });
    });
  });

  suite('findInstallEntryLines', () => {
    test('finds each package of [install] once, in every TOML form', () => {
      const lines = findInstallEntryLines(MANIFEST);
      assert.strictEqual(lines.header, 3);
      assert.deepStrictEqual([...lines.entries], [
        ['curl', 4],
        ['hello', 6],
        ['python3', 7],
        ['jq', 8],
        ['nodejs', 13],
      ]);
    });

    test('ignores keys outside [install] and manifests without it', () => {
      const lines = findInstallEntryLines('version = 1\n[vars]\nfoo = "bar"\n');
      assert.strictEqual(lines.header, undefined);
      assert.strictEqual(lines.entries.size, 0);
    });
  });

  test('upgradeLensTitle', () => {
    assert.strictEqual(upgradeLensTitle({ installId: 'curl', from: '8.9.0', to: '8.10.1', rebuild: false }),
      'Upgrade available: 8.9.0 -> 8.10.1');
    assert.strictEqual(upgradeLensTitle({ installId: 'hello', from: '2.12.1', to: '2.12.1', rebuild: true }),
      'Rebuild available: 2.12.1 (newer build)');
  });

  test('isFloxManifest only matches the environment manifest', () => {
    assert.ok(isFloxManifest(vscode.Uri.file('/work/project/.flox/env/manifest.toml')));
    assert.ok(!isFloxManifest(vscode.Uri.file('/work/project/manifest.toml')));
    assert.ok(!isFloxManifest(vscode.Uri.file('/work/project/.flox/env/manifest.lock')));
  });

  suite('UpgradeCodeLensProvider', () => {
    async function manifestDocument(content: string): Promise<vscode.TextDocument> {
      const document = await vscode.workspace.openTextDocument({ language: 'toml', content });
      // Untitled documents have no .flox path, so present the same text under the manifest path
      return new Proxy(document, {
        get(target, prop, receiver) {
          if (prop === 'uri') {
            return vscode.Uri.file('/work/project/.flox/env/manifest.toml');
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }

    test('adds a lens above each upgradable package and an upgrade-all lens', async () => {
      const provider = new UpgradeCodeLensProvider();
      let changes = 0;
      provider.onDidChangeCodeLenses(() => changes++);
      provider.setUpgrades(parseUpgradeDryRun(DRY_RUN_OUTPUT));
      assert.strictEqual(changes, 1);

      const lenses = provider.provideCodeLenses(await manifestDocument(MANIFEST));

      assert.deepStrictEqual(lenses.map((lens) => [lens.range.start.line, lens.command?.title, lens.command?.command, lens.command?.arguments]), [
        [3, 'Upgrade all (3 packages)', 'flox.upgradeAll', undefined],
        [4, 'Upgrade available: 8.9.0 -> 8.10.1', 'flox.upgradePackage', ['curl']],
        [6, 'Rebuild available: 2.12.1 (newer build)', 'flox.upgradePackage', ['hello']],
        [7, 'Upgrade available: 3.12.7 -> 3.12.8', 'flox.upgradePackage', ['python3']],
      ]);
    });

    test('shows nothing without upgrades or outside the Flox manifest', async () => {
      const provider = new UpgradeCodeLensProvider();
      assert.deepStrictEqual(provider.provideCodeLenses(await manifestDocument(MANIFEST)), []);

      provider.setUpgrades(parseUpgradeDryRun(DRY_RUN_OUTPUT));
      const other = await vscode.workspace.openTextDocument({ language: 'toml', content: MANIFEST });
      assert.deepStrictEqual(provider.provideCodeLenses(other), []);
    });
  });

  suite('registerUpgradeHints', () => {
    function setup(overrides: { runFlox?: (argv: string[]) => Promise<{ stdout: string, stderr: string }>, enabled?: boolean, dir?: string } = {}) {
      const calls: string[][] = [];
      const commands = new Map<string, (...args: any[]) => any>();
      const context = createMockExtensionContext();
      const hints = registerUpgradeHints(context, {
        runFlox: async (argv) => {
          calls.push(argv);
          return overrides.runFlox ? overrides.runFlox(argv) : { stdout: '', stderr: DRY_RUN_OUTPUT };
        },
        workspaceDir: () => 'dir' in overrides ? overrides.dir : '/work/project',
        registerCommand: (name, command) => commands.set(name, command),
        log: () => {},
        enabled: () => overrides.enabled ?? true,
      });
      return { hints, calls, commands, context };
    }

    test('checks for upgrades on start with flox upgrade --dry-run', async () => {
      const { hints, calls, commands, context } = setup();
      const upgrades = await hints.refresh();

      assert.deepStrictEqual(calls[0], ['upgrade', '--dry-run', '--dir', '/work/project']);
      assert.deepStrictEqual([...upgrades.keys()], ['curl', 'hello', 'python3']);
      assert.deepStrictEqual([...commands.keys()], ['flox.checkPackageUpgrades', 'flox.upgradePackage', 'flox.upgradeAll']);
      context.subscriptions.forEach((s) => s.dispose());
    });

    test('clears hints when disabled, without an environment, or when flox fails', async () => {
      for (const overrides of [
        { enabled: false },
        { dir: undefined },
        { runFlox: async () => { throw new Error('flox: command not found'); } },
      ]) {
        const { hints, context } = setup(overrides);
        assert.strictEqual((await hints.refresh()).size, 0);
        context.subscriptions.forEach((s) => s.dispose());
      }
    });

    test('runs flox upgrade for one package and refreshes', async () => {
      const { hints, calls, commands, context } = setup();
      await hints.refresh();

      await commands.get('flox.upgradePackage')!('curl');

      assert.deepStrictEqual(calls.filter((argv) => !argv.includes('--dry-run')), [['upgrade', '--dir', '/work/project', 'curl']]);
      assert.deepStrictEqual(calls.at(-1), ['upgrade', '--dry-run', '--dir', '/work/project']);
      context.subscriptions.forEach((s) => s.dispose());
    });
  });
});
