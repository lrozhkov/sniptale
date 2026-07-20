import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';

import { runCommand } from '../shared-process.mjs';
import {
  readRetiredControlsPolicy,
  RETIRED_CONTROLS_GUARD_ROOT,
  RETIRED_CONTROLS_POLICY,
} from './policy.mjs';

const ACTIVE_TEXT_FILE = /\.(?:[cm]?[jt]sx?|html?|json|ql|qll|qls|sh|toml|ya?ml)$/u;
const POLICY_ARRAY_KEYS = [
  'retiredPaths',
  'retiredPrefixes',
  'requiredPaths',
  'forbiddenReferences',
];

function gitOutput(root, args) {
  const result = runCommand(process.platform === 'win32' ? 'git.exe' : 'git', args, {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  }
  return result.stdout;
}

function pathExistsWithoutFollowing(root, path) {
  try {
    lstatSync(resolve(root, path));
    return true;
  } catch {
    return false;
  }
}

function currentFiles(root) {
  const files = new Map();
  for (const record of gitOutput(root, ['ls-files', '--cached', '--stage', '-z']).split('\0')) {
    if (!record) continue;
    const match = /^(\d+) [a-f0-9]+ \d+\t([\s\S]+)$/u.exec(record);
    if (match) {
      files.set(match[2], {
        path: match[2],
        mode: match[1],
        executable: match[1] === '100755',
      });
    }
  }
  for (const path of gitOutput(root, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter(Boolean)) {
    if (!files.has(path)) files.set(path, { path, mode: null, executable: false });
  }
  return [...files.values()]
    .filter(({ path }) => pathExistsWithoutFollowing(root, path))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function isSortedUniqueStrings(values) {
  return (
    Array.isArray(values) &&
    values.every((value) => typeof value === 'string' && value.length > 0) &&
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) < 0)
  );
}

function policyErrors(policy) {
  const errors = [];
  if (policy?.schemaVersion !== 1) errors.push('retired controls policy schemaVersion must be 1');
  for (const key of POLICY_ARRAY_KEYS) {
    if (!isSortedUniqueStrings(policy?.[key])) {
      errors.push(`retired controls policy ${key} must be a sorted unique string array`);
    }
  }
  return errors;
}

function isGuardOwnedFixture(path) {
  return (
    path === RETIRED_CONTROLS_POLICY ||
    path === 'tooling/configs/qa/control-dispositions.data.json' ||
    path.startsWith(RETIRED_CONTROLS_GUARD_ROOT)
  );
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function isExpectedReadRace(error) {
  return ['ELOOP', 'ENOENT', 'ENOTDIR'].includes(error?.code);
}

export function readVerifiedRegularFile(
  absolutePath,
  { afterOpen = () => {}, noFollowFlag = constants.O_NOFOLLOW } = {}
) {
  let descriptor = null;
  try {
    descriptor = openSync(absolutePath, constants.O_RDONLY | (noFollowFlag ?? 0));
    const opened = fstatSync(descriptor);
    afterOpen(absolutePath);
    const current = lstatSync(absolutePath);
    if (
      !opened.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      !sameFileIdentity(opened, current)
    ) {
      return null;
    }
    return readFileSync(descriptor, 'utf8');
  } catch (error) {
    if (isExpectedReadRace(error)) return null;
    throw error;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function readableExecutableText(root, file) {
  if (file.mode !== null && !['100644', '100755'].includes(file.mode)) return null;
  if (!ACTIVE_TEXT_FILE.test(file.path) && !file.executable && extname(file.path) !== '') {
    return null;
  }
  const text = readVerifiedRegularFile(resolve(root, file.path));
  if (text === null || text.includes('\0')) return null;
  return ACTIVE_TEXT_FILE.test(file.path) || file.executable || text.startsWith('#!') ? text : null;
}

function currentTreeErrors(root, files, policy) {
  const errors = [];
  const paths = files.map(({ path }) => path);
  const retiredPaths = new Set(policy.retiredPaths);
  for (const path of paths) {
    if (
      retiredPaths.has(path) ||
      policy.retiredPrefixes.some((prefix) => path.startsWith(prefix))
    ) {
      errors.push(`retired control was reintroduced: ${path}`);
    }
  }
  for (const path of policy.requiredPaths) {
    if (!paths.includes(path)) errors.push(`required permanent control is missing: ${path}`);
  }
  for (const file of files) {
    if (isGuardOwnedFixture(file.path)) continue;
    const text = readableExecutableText(root, file);
    if (text === null) continue;
    for (const reference of policy.forbiddenReferences) {
      if (text.includes(reference)) {
        errors.push(`active control references retired authority: ${file.path} -> ${reference}`);
      }
    }
  }
  return errors;
}

export function retiredControlErrors(root = process.cwd()) {
  let policy;
  try {
    policy = readRetiredControlsPolicy(root);
  } catch {
    return [`missing or invalid retired controls policy: ${RETIRED_CONTROLS_POLICY}`];
  }
  const errors = policyErrors(policy);
  if (errors.length > 0) return errors.sort();
  return currentTreeErrors(root, currentFiles(root), policy).sort();
}

export function runRetiredControlCheck({ root = process.cwd() } = {}) {
  return { violations: retiredControlErrors(root) };
}
