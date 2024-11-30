import cp from 'child_process';
import os from 'os';
import { promisify } from 'util';
import vscode from 'vscode';
import zlib from 'zlib';
import dotenv from 'dotenv';
import { delimiter } from 'path';
import { dot } from 'node:test/reporters';

const execFile = promisify(cp.execFile);

export type Vars = Map<string, string | null>

export class CommandNotFoundError extends Error {
	constructor(public readonly path: string) {
		super(`${path}: command not found`);
	}
}

function isCommandNotFound(e: unknown, path: string): boolean {
	if (!(e instanceof Error)) {
        return false;
    }
	if (!('path' in e) || !('code' in e)) {
        return false;
    }
	return e.path === path && e.code === 'ENOENT';
}

export type Stdio = {
	stdout: string
	stderr: string
}

export function cwd(): string {
	return vscode.workspace.workspaceFolders?.[0].uri.fsPath ?? os.homedir();
}

async function flox(
	args: string[],
	env?: NodeJS.ProcessEnv,
	cwdOverride?: string,
): Promise<Stdio> {
	const options: cp.ExecOptionsWithStringEncoding = {
		encoding: 'utf8',
		cwd: cwdOverride ?? cwd(),
		env: {
			...process.env,
			['TERM']: 'dumb',
			...env,
		},
	};
	//TODO: const command = config.path.executable.get();
    const command = "flox";
	try {
		return await execFile(command, args, options);
	} catch (e) {
		if (isCommandNotFound(e, command)) {
			throw new CommandNotFoundError(command);
		}
		throw e;
	}
}

export async function version(): Promise<void> {
	await flox(['--version']);
}

export async function activate(): Promise<void> {
	await flox(['activate']);
}

const dotenvParse = promisify(dotenv.parse);

export async function vars(): Promise<Vars> {
	const delimiter = "PARSE ENV AFTER HERE ...";
	const stdio = await flox(['activate', '--', 'bash', '-c', `echo "${delimiter}" && env`]);
	const stdout = stdio.stdout.split(delimiter)[1];

	let envs = new Map();
	for (const [key, value] of Object.entries(dotenv.parse(stdout))) {
		envs.set(key, value);
	}
	return envs;
}