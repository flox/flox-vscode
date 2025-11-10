import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
import { parseServicesStatus } from '../serviceStatus';
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
});
