import path from 'node:path';

const REPOSITORY_TARGET =
  /(?:^|[\s/"'`([=:])(?<target>tooling\/[A-Za-z0-9_./-]+\.(?:[cm]?[jt]s|tsx|py|sh))(?=$|[\s"'`),;:\]])/gu;
const COMMAND_INTERPRETER = /(?:^|[\s;&|()])(?:node|tsx|bash|sh|python3?)\s+/gu;
const COMMAND_REPOSITORY_TARGET =
  /(?<target>(?:\.\.\/)*(?:trusted-control\/)?tooling\/[A-Za-z0-9_./-]+\.(?:[cm]?[jt]s|tsx|py|sh))/u;

export function normalizeRepositoryTarget(target) {
  const withoutWorkspacePrefix = target
    .replaceAll('\\', '/')
    .replace(/^(?:\.\.\/)+/u, '')
    .replace(/^trusted-control\//u, '')
    .replace(/^\.\//u, '');
  const normalized = path.posix.normalize(withoutWorkspacePrefix);
  return normalized.startsWith('tooling/') &&
    !normalized.includes('../') &&
    /\.(?:[cm]?[jt]s|tsx|py|sh)$/u.test(normalized)
    ? normalized
    : null;
}

export function extractCommandEntryTargets(command) {
  const source = String(command);
  const targets = [];
  for (const interpreter of source.matchAll(COMMAND_INTERPRETER)) {
    const commandTail = source
      .slice(interpreter.index + interpreter[0].length)
      .split(/[\n;&|]/u, 1)[0];
    const match = COMMAND_REPOSITORY_TARGET.exec(commandTail);
    const target = match ? normalizeRepositoryTarget(match.groups.target) : null;
    if (target) targets.push(target);
  }
  return targets;
}

export function extractRepositoryTargets(command) {
  const source = String(command).trim();
  const targets = [];
  for (const match of source.matchAll(REPOSITORY_TARGET)) {
    const target = normalizeRepositoryTarget(match.groups.target);
    if (target) targets.push(target);
  }
  return [...new Set(targets)].sort();
}

export function slug(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
}

export function makeOrigin({ authority, id, kind, target, ...evidence }) {
  return { authority, id, kind, target, ...evidence };
}

export function assertResolvedTargets(origins, { exists }) {
  const unresolved = origins
    .filter(({ target }) => !exists(target))
    .map(({ authority, id, target }) => `${id} (${authority} -> ${target})`)
    .sort();
  if (unresolved.length > 0) {
    throw new Error(`Unresolved repository executable targets:\n${unresolved.join('\n')}`);
  }
  return origins;
}
