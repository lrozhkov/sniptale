import path from 'node:path';

export const EXPECTED_SANDBOX_CSP = [
  'sandbox allow-scripts;',
  "default-src 'none';",
  "script-src 'self';",
  "style-src 'self';",
  "connect-src 'none';",
  'worker-src blob:;',
  "child-src 'none';",
  "object-src 'none';",
].join(' ');
export const EXPECTED_SANDBOX_PAGES = ['apps/extension/src/effect-runtime-sandbox/index.html'];

export function collectSandboxScriptPaths(filesByPath, sandboxPages) {
  const scriptPaths = new Set();
  for (const page of sandboxPages) {
    const pageFile = filesByPath.get(page);
    if (!pageFile) {
      continue;
    }
    for (const scriptPath of readLocalScriptSrcs(pageFile.contents.toString('utf8'), page)) {
      if (!filesByPath.has(scriptPath)) {
        throw new Error(`Release artifact sandbox page references missing script: ${scriptPath}`);
      }
      scriptPaths.add(scriptPath);
    }
  }
  return scriptPaths;
}

export function collectScriptWorkerPaths(filesByPath, scriptPaths) {
  const workerPaths = new Set();
  const pending = [...scriptPaths];
  for (const scriptPath of pending) {
    const scriptFile = filesByPath.get(scriptPath);
    if (!scriptFile) {
      continue;
    }
    for (const workerPath of readLocalWorkerSrcs(
      scriptFile.contents.toString('utf8'),
      scriptPath
    )) {
      if (!filesByPath.has(workerPath)) {
        throw new Error(`Release artifact script references missing worker: ${workerPath}`);
      }
      if (!workerPaths.has(workerPath)) {
        workerPaths.add(workerPath);
        pending.push(workerPath);
      }
    }
  }
  return workerPaths;
}

export function assertSandboxScriptsDoNotReferenceLocalWorkers(filesByPath, sandboxScriptPaths) {
  for (const scriptPath of sandboxScriptPaths) {
    const scriptFile = filesByPath.get(scriptPath);
    if (!scriptFile) {
      continue;
    }
    const workerPaths = readLocalWorkerSrcs(scriptFile.contents.toString('utf8'), scriptPath);
    for (const workerPath of workerPaths) {
      throw new Error(
        `Release artifact sandbox script references external worker asset: ${workerPath}`
      );
    }
  }
}

export function collectExtensionPageScriptPaths(filesByPath, sandboxPages) {
  const sandboxPageSet = new Set(sandboxPages);
  const scriptPaths = new Set();
  for (const [relativePath, file] of filesByPath) {
    if (sandboxPageSet.has(relativePath) || !/\.html?$/u.test(relativePath)) {
      continue;
    }
    for (const scriptPath of readLocalScriptSrcs(file.contents.toString('utf8'), relativePath)) {
      if (filesByPath.has(scriptPath)) {
        scriptPaths.add(scriptPath);
      }
    }
  }
  return scriptPaths;
}

export function assertSandboxScriptsAreExclusive(sandboxScriptPaths, extensionScriptPaths) {
  const shared = [...sandboxScriptPaths].filter((scriptPath) =>
    extensionScriptPaths.has(scriptPath)
  );
  if (shared.length > 0) {
    throw new Error(
      `Release artifact sandbox-owned script is also loaded by extension page: ${shared.join(', ')}`
    );
  }
}

function readLocalScriptSrcs(html, pagePath) {
  const scriptPaths = [];
  const scriptPattern = /<script\b[^>]*\bsrc=(["'])(.*?)\1[^>]*>/giu;
  for (const match of html.matchAll(scriptPattern)) {
    const normalized = resolveLocalArtifactPath(match[2] ?? '', pagePath);
    if (normalized) {
      scriptPaths.push(normalized);
    }
  }
  return scriptPaths;
}

function readLocalWorkerSrcs(script, scriptPath) {
  const workerPaths = [];
  const workerPattern =
    /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*(["'])(.*?)\1\s*,\s*import\.meta\.url\s*\)/giu;
  for (const match of script.matchAll(workerPattern)) {
    const normalized = resolveLocalArtifactPath(match[2] ?? '', scriptPath);
    if (normalized) {
      workerPaths.push(normalized);
    }
  }
  return workerPaths;
}

function resolveLocalArtifactPath(reference, ownerPath) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(reference)) {
    return null;
  }
  const normalized = reference.startsWith('/')
    ? reference.slice(1)
    : path.posix.normalize(path.posix.join(path.posix.dirname(ownerPath), reference));
  return normalized !== '..' && !normalized.startsWith('../') ? normalized : null;
}
