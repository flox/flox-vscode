import path from 'path';

type ActiveEnvironmentEntry = {
  path?: string;
};

const isWindows = process.platform === 'win32';

function normalizePath(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  let normalized = path.normalize(value);

  // Trim trailing separators except when the path is the root itself.
  while (normalized.length > 1 && normalized.endsWith(path.sep)) {
    normalized = normalized.slice(0, -path.sep.length);
  }

  if (isWindows) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

function pathsEqual(a?: string, b?: string): boolean {
  const normalizedA = normalizePath(a);
  const normalizedB = normalizePath(b);
  if (!normalizedA || !normalizedB) {
    return false;
  }
  return normalizedA === normalizedB;
}

function pathWithin(child: string | undefined, parent: string): boolean {
  const normalizedChild = normalizePath(child);
  if (!normalizedChild) {
    return false;
  }

  if (normalizedChild === parent) {
    return true;
  }

  const parentWithSep = parent.endsWith(path.sep) ? parent : `${parent}${path.sep}`;
  return normalizedChild.startsWith(parentWithSep);
}

export function isWorkspaceActive(
  workspacePath: string | undefined,
  floxDirPath: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const normalizedWorkspace = normalizePath(workspacePath);
  const normalizedFloxDir = normalizePath(floxDirPath);

  if (!normalizedWorkspace || !normalizedFloxDir) {
    return false;
  }

  const activeEnvs = env["_FLOX_ACTIVE_ENVIRONMENTS"];
  if (activeEnvs) {
    try {
      const parsed = JSON.parse(activeEnvs) as ActiveEnvironmentEntry[];
      if (Array.isArray(parsed) && parsed.some(entry => pathsEqual(entry?.path, normalizedFloxDir))) {
        return true;
      }
    } catch (error) {
      console.error("Parsing _FLOX_ACTIVE_ENVIRONMENTS variable error:", error);
    }
  }

  if (pathsEqual(env["FLOX_ENV_PROJECT"], normalizedWorkspace)) {
    return true;
  }

  if (pathWithin(env["FLOX_ENV"], normalizedFloxDir)) {
    return true;
  }

  return false;
}
