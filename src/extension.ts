import * as vscode from 'vscode';
import * as flox from './flox';


function message(err: unknown) {
	if (typeof err === 'string') {
    	return err;
  	}
	if (err instanceof Error) {
    	return err.message;
  	}
	console.error('unhandled error', err);
	return;
}

class Flox implements vscode.Disposable {

  	private output = vscode.window.createOutputChannel('flox');
  	private willActivate = new vscode.EventEmitter<void>();
	private didActivate = new vscode.EventEmitter<flox.Vars>();
	private failed = new vscode.EventEmitter<unknown>();
	private watchers = vscode.Disposable.from();

  	constructor(
		private context: vscode.ExtensionContext,
	) {
    	this.willActivate.event(() => this.onWillActivate());
		this.didActivate.event((e) => this.onDidActivate(e));
		this.failed.event((e) => this.onFailed(e));
	}

  	private get environment() {
		return this.context.environmentVariableCollection;
	}

  	dispose() {
    	this.output.dispose();
		this.watchers.dispose();
	}

  	async activate() {
		await this.try(async () => {
			await flox.activate();
			this.willActivate.fire();
		});
	}

	private async onWillActivate() {
		const vars = await flox.vars();
		this.didActivate.fire(vars);
	}

	private async onDidActivate(vars: flox.Vars) {
		this.updateEnvironment(vars);
		//await this.updateCache()
		//this.loaded.fire()
		//if ([...data.keys()].every(isInternal)) return
		//this.didUpdate.fire()
	}

  	private async onFailed(err: unknown) {
    	const msg = message(err);
    	if (msg !== undefined) {
    	  	await vscode.window.showErrorMessage(`flox error: ${msg}`);
   		}
  	}

	private async try<T>(callback: () => Promise<T>) {
		try {
			await callback();
		} catch (err) {
			this.failed.fire(err);
		}
	}

	private updateEnvironment(vars?: flox.Vars) {
		if (vars === undefined) {
			return;
		}
		// Avoid updating the environment & cleaning out watchers if data is empty
		// such as when `direnv.dump()` is called twice without changes
		if (vars.size === 0) {
			return;
		}
		for (const [key, value] of vars) {
			//if (!this.backup.has(key)) {
			//	// keep the oldest value
			//	this.backup.set(key, process.env[key])
			//}

			this.updateTerminalEnv(key, value);
			this.updateProcessEnv(key, value);
		}
		//this.updateWatchers(vars);
	}

	private updateProcessEnv(key: string, value: string | null | undefined) {
		if (value === null || value === undefined) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	private updateTerminalEnv(key: string, value: string | null) {
		if (value === null) { //  && this.backup.get(key) === undefined) {
			this.environment.delete(key);
		} else {
			this.environment.replace(key, value ?? ''); // can't unset, set to empty instead
		}
	}

}

export function activate(context: vscode.ExtensionContext) {

	const instance = new Flox(context);

  	context.subscriptions.push(instance);
  	context.subscriptions.push(
    	vscode.commands.registerCommand('flox.activate', async () => {
			await instance.activate();
		}),
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}