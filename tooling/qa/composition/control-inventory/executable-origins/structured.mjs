import { parse as parseYaml } from 'yaml';

import {
  extractCommandEntryTargets,
  extractRepositoryTargets,
  makeOrigin,
  slug,
} from './commands.mjs';

function sortedOrigins(origins) {
  return origins.sort((left, right) => left.id.localeCompare(right.id));
}

export function collectPackageScriptOrigins({ authority, source }) {
  const manifest = JSON.parse(source);
  const origins = [];
  for (const [scriptId, command] of Object.entries(manifest.scripts ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    for (const target of extractCommandEntryTargets(command)) {
      origins.push(
        makeOrigin({
          authority,
          command,
          id: `package-script:${authority}#scripts.${scriptId}.target.${target}`,
          kind: 'package-script',
          scriptId,
          target,
        })
      );
    }
  }
  return origins;
}

function workflowStepKey(step, index) {
  if (typeof step.id === 'string' && step.id.trim()) return `id.${slug(step.id)}`;
  if (typeof step.name === 'string' && step.name.trim()) return `name.${slug(step.name)}`;
  return `index.${index}`;
}

export function collectWorkflowOrigins({ authority, source }) {
  const workflow = parseYaml(source);
  const origins = [];
  for (const [jobId, job] of Object.entries(workflow?.jobs ?? {}).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    for (const [index, step] of (job?.steps ?? []).entries()) {
      if (typeof step?.run !== 'string') continue;
      const occurrences = new Map();
      for (const target of extractCommandEntryTargets(step.run)) {
        const occurrence = (occurrences.get(target) ?? 0) + 1;
        occurrences.set(target, occurrence);
        origins.push(
          makeOrigin({
            authority,
            id:
              `workflow:${authority}#job.${jobId}.step.${workflowStepKey(step, index)}.` +
              `target.${target}.occurrence.${occurrence}`,
            jobId,
            kind: 'workflow-command',
            stepKey: workflowStepKey(step, index),
            target,
          })
        );
      }
    }
  }
  return sortedOrigins(origins);
}

function dockerTokens(value) {
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    // Docker also accepts a shell-form instruction, handled below.
  }
  return value.split(/\s+/u).filter(Boolean);
}

export function collectDockerOrigins({ authority, source }) {
  const copies = new Map();
  const origins = [];
  const logicalLines = source.replace(/\\\r?\n\s*/gu, ' ').split(/\r?\n/u);
  for (const line of logicalLines) {
    const instruction = /^\s*(?<kind>[A-Z]+)\s+(?<value>.+?)\s*$/iu.exec(line);
    if (!instruction) continue;
    const kind = instruction.groups.kind.toUpperCase();
    const value = instruction.groups.value;
    if (kind === 'COPY' || kind === 'ADD') {
      const tokens = dockerTokens(value).filter((token) => !token.startsWith('--'));
      if (tokens.length < 2) continue;
      const destination = tokens.at(-1);
      for (const sourcePath of tokens.slice(0, -1)) {
        const targets = extractRepositoryTargets(sourcePath);
        if (targets.length === 1) {
          copies.set(
            destination.endsWith('/')
              ? `${destination}${targets[0].split('/').at(-1)}`
              : destination,
            targets[0]
          );
        }
      }
      continue;
    }
    if (!['RUN', 'ENTRYPOINT', 'CMD'].includes(kind)) continue;
    for (const token of dockerTokens(value)) {
      const target = copies.get(token);
      if (!target) continue;
      const originKind = kind === 'RUN' ? 'docker-copy-run' : 'docker-entrypoint';
      origins.push(
        makeOrigin({
          authority,
          id: `docker:${authority}#${kind.toLowerCase()}.target.${target}`,
          kind: originKind,
          target,
        })
      );
    }
  }
  return sortedOrigins(origins);
}

export function collectHookOrigins({ authority, source }) {
  return [
    ...new Set(
      extractCommandEntryTargets(
        source
          .split(/\r?\n/u)
          .filter((line) => !/^\s*#/u.test(line))
          .join('\n')
      )
    ),
  ].map((target) =>
    makeOrigin({
      authority,
      id: `hook:${authority}#target.${target}`,
      kind: 'husky-command',
      target,
    })
  );
}

export function collectDocumentedCommandOrigins({ authority, source }) {
  const origins = [];
  const commandSpans = [
    ...source.matchAll(/```(?:bash|sh|shell|console)?\s*\n(?<body>[\s\S]*?)```/giu),
    ...source.matchAll(/(?<!`)`(?<body>[^`\r\n]+)`(?!`)/gu),
  ];
  const counts = new Map();
  for (const block of commandSpans) {
    for (const target of extractCommandEntryTargets(block.groups.body)) {
      const count = (counts.get(target) ?? 0) + 1;
      counts.set(target, count);
      const suffix =
        authority === 'docs/tooling/wsl-setup.md' && target === 'tooling/ci/runtime-parity.mjs'
          ? count === 1
            ? 'runtime-parity-preinstall'
            : 'runtime-parity-diagnostic'
          : `operator-command.${target}`;
      origins.push(
        makeOrigin({
          authority,
          id: `docs-command:${authority}#${suffix}`,
          kind: 'documented-operator-command',
          target,
        })
      );
    }
  }
  return sortedOrigins([...new Map(origins.map((origin) => [origin.id, origin])).values()]);
}

export function collectCatalogOrigins({ authority, controls }) {
  const origins = [];
  for (const control of [...controls].sort((a, b) =>
    `${a.lane}:${a.id}`.localeCompare(`${b.lane}:${b.id}`)
  )) {
    const target = extractRepositoryTargets(control.source ?? '')[0];
    if (!target || control.execution === false || control.execution === 'none') continue;
    origins.push(
      makeOrigin({
        authority,
        controlId: control.id,
        execution: control.execution ?? 'direct',
        id: `catalog:${authority}#lane.${control.lane}.id.${control.id}.source.${target}`,
        kind: 'qa-catalog-execution',
        lane: control.lane,
        target,
      })
    );
  }
  return origins;
}
