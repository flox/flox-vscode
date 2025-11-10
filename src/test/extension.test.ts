import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { parseServicesStatus } from '../serviceStatus';
import { isWorkspaceActive } from '../envActive';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Sample test', () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });

  suite('Service status parsing', () => {
    test('parses pretty-printed JSON arrays emitted by flox', () => {
      const stdout = `[
  {
    "name": "myservice",
    "status": "Stopped",
    "pid": null,
    "exit_code": null
  }
]`;
      const services = parseServicesStatus(stdout);
      assert.strictEqual(services.size, 1);
      const service = services.get('myservice');
      assert.ok(service);
      assert.strictEqual(service?.status, 'Stopped');
      assert.strictEqual(service?.pid, null);
    });

    test('parses NDJSON payloads and ignores noisy lines', () => {
      const stdout = `{"name":"svc1","status":"Running","pid":123,"exit_code":0}

noise
{"name":"svc2","status":"Stopped","pid":null,"exit_code":null}
`;
      const services = parseServicesStatus(stdout);
      assert.strictEqual(services.size, 2);
      assert.strictEqual(services.get('svc1')?.status, 'Running');
      assert.strictEqual(services.get('svc2')?.pid, null);
    });
  });

  suite('Workspace activation detection', () => {
    const workspacePath = '/workspace/project';
    const floxDir = '/workspace/project/.flox';

    test('uses _FLOX_ACTIVE_ENVIRONMENTS when available', () => {
      const env = {
        _FLOX_ACTIVE_ENVIRONMENTS: JSON.stringify([{ path: floxDir }]),
      } as NodeJS.ProcessEnv;
      assert.strictEqual(isWorkspaceActive(workspacePath, floxDir, env), true);
    });

    test('falls back to FLOX_ENV_PROJECT when active list missing', () => {
      const env = {
        FLOX_ENV_PROJECT: workspacePath,
      } as NodeJS.ProcessEnv;
      assert.strictEqual(isWorkspaceActive(workspacePath, floxDir, env), true);
    });

    test('detects activation via FLOX_ENV directory', () => {
      const env = {
        FLOX_ENV: `${floxDir}/run/x86_64-linux`,
      } as NodeJS.ProcessEnv;
      assert.strictEqual(isWorkspaceActive(workspacePath, floxDir, env), true);
    });

    test('returns false when no indicators match workspace', () => {
      const env = {
        _FLOX_ACTIVE_ENVIRONMENTS: JSON.stringify([{ path: '/other/.flox' }]),
      } as NodeJS.ProcessEnv;
      assert.strictEqual(isWorkspaceActive(workspacePath, floxDir, env), false);
    });
  });
});
