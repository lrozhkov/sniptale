import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { markdownLinkLiterals, resolvedMarkdownTarget } from './docs-markdown-links.mjs';
import {
  git,
  grepLines,
  parsedGrepLine,
  readBlobs,
  treeEntries,
} from './docs-move-manifest.git.mjs';

const TEXT_PATH = /(?:\.md|\.json|\.ya?ml|\.[cm]?[jt]sx?|\.css|\.html|\.txt|\.cjs)$/u;
function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex');
}

function markdownTargets(path, text) {
  return markdownLinkLiterals(text).flatMap((literal) => {
    const target = resolvedMarkdownTarget(path, literal);
    return target ? [{ kind: 'markdown-link', literal, target }] : [];
  });
}

function literalTargets(path, text, sources) {
  return [...sources].flatMap((source) => {
    const records = [];
    let offset = text.indexOf(source);
    while (offset >= 0) {
      const line = text.slice(0, offset).split(/\r?\n/u).length;
      records.push({ kind: 'path-literal', line, literal: source, target: source });
      offset = text.indexOf(source, offset + source.length);
    }
    return records;
  });
}

function discoverConsumers(root, tree, moves) {
  const sources = new Set(moves.map((move) => move.source));
  const escapedSources = [...sources].map((source) =>
    source.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  );
  const literalRecords = grepLines(root, tree, escapedSources.join('|'))
    .map(parsedGrepLine)
    .filter(Boolean)
    .flatMap(({ path, line, text }) =>
      TEXT_PATH.test(path)
        ? literalTargets(path, text, sources).map((record) => ({ ...record, line, path }))
        : []
    );
  const linkRecords = grepLines(root, tree, '\\]\\([^)]+', ['*.md'])
    .map(parsedGrepLine)
    .filter(Boolean)
    .flatMap(({ path, line, text }) =>
      markdownTargets(path, text)
        .filter((record) => sources.has(record.target))
        .map((record) => ({ ...record, line, path }))
    );
  const records = [...literalRecords, ...linkRecords];
  return records.filter(
    (record, index) =>
      records.findIndex(
        (candidate) =>
          candidate.kind === record.kind &&
          candidate.path === record.path &&
          candidate.line === record.line &&
          candidate.literal === record.literal
      ) === index
  );
}

function validateMapping(root, entries, mapping) {
  if (mapping?.schemaVersion !== 1 || !Array.isArray(mapping.moves)) {
    throw new Error('invalid docs move mapping');
  }
  const sources = mapping.moves.map((move) => move.source);
  const targets = mapping.moves.map((move) => move.target);
  if (new Set(sources).size !== sources.length || new Set(targets).size !== targets.length) {
    throw new Error('docs move mapping is not one-to-one');
  }
  const basePaths = new Set(entries.keys());
  const sourceSet = new Set(sources);
  for (const move of mapping.moves) {
    if (!basePaths.has(move.source)) throw new Error(`move source is missing: ${move.source}`);
    if (basePaths.has(move.target) && !sourceSet.has(move.target)) {
      throw new Error(`move target collides with the base tree: ${move.target}`);
    }
    if (
      existsSync(resolve(root, move.source)) &&
      existsSync(resolve(root, move.target)) &&
      !sourceSet.has(move.target)
    ) {
      throw new Error(`move target collides with the worktree: ${move.target}`);
    }
  }
}

export function generateDocsMoveManifest({ root = process.cwd(), tree, mapping }) {
  const baseTree = git(root, ['rev-parse', `${tree}^{tree}`]).trim();
  const entries = treeEntries(root, tree);
  validateMapping(root, entries, mapping);
  const blobs = readBlobs(
    root,
    mapping.moves.map((move) => entries.get(move.source))
  );
  const moves = mapping.moves.map((move) => {
    const entry = entries.get(move.source);
    const contents = blobs.get(entry.blob);
    return { ...move, ...entry, sha256: sha256(contents) };
  });
  return {
    schemaVersion: 1,
    baseCommit: git(root, ['rev-parse', tree]).trim(),
    baseTree,
    allowedHistoricalConsumers: mapping.allowedHistoricalConsumers ?? [],
    allowedIntentionalConsumers: mapping.allowedIntentionalConsumers ?? [],
    moves,
    preMoveConsumers: discoverConsumers(root, tree, moves),
    rollback: moves.map(({ source, target }) => ({ source: target, target: source })),
  };
}

function moveStateErrors(root, manifest) {
  const errors = [];
  const sources = manifest.moves.map((move) => move.source);
  const targetPaths = manifest.moves.map((move) => move.target);
  if (
    new Set(sources).size !== sources.length ||
    new Set(targetPaths).size !== targetPaths.length
  ) {
    errors.push('docs move manifest is not one-to-one');
  }
  const expectedRollback = manifest.moves.map(({ source, target }) => ({
    source: target,
    target: source,
  }));
  if (JSON.stringify(manifest.rollback) !== JSON.stringify(expectedRollback)) {
    errors.push('docs move rollback is incomplete or stale');
  }
  for (const move of manifest.moves) {
    if (existsSync(resolve(root, move.source))) errors.push(`move source remains: ${move.source}`);
    const target = resolve(root, move.target);
    if (!existsSync(target)) {
      errors.push(`move target is missing: ${move.target}`);
      continue;
    }
    const contents = readFileSync(target);
    if (sha256(contents) !== move.sha256 && move.mechanical !== false) {
      errors.push(`mechanical move content changed: ${move.target}`);
    }
    const mode = (lstatSync(target).mode & 0o777).toString(8).padStart(3, '0');
    if (mode !== move.mode.slice(-3) && move.mechanical !== false) {
      errors.push(`mechanical move mode changed: ${move.target}`);
    }
  }
  return errors;
}

function intentionalConsumer(manifest, consumer) {
  return manifest.allowedIntentionalConsumers?.some(
    (allowed) =>
      allowed.path === consumer.path &&
      allowed.literal === consumer.literal &&
      typeof allowed.reason === 'string' &&
      allowed.reason.length > 0
  );
}

function staleConsumerErrors(root, manifest) {
  const errors = [];
  const targets = new Set(manifest.moves.map((move) => move.target));
  for (const consumer of manifest.preMoveConsumers) {
    if (manifest.allowedHistoricalConsumers?.includes(consumer.path)) continue;
    if (intentionalConsumer(manifest, consumer)) continue;
    if (targets.has(consumer.path) || !existsSync(resolve(root, consumer.path))) continue;
    const text = readFileSync(resolve(root, consumer.path), 'utf8');
    const staleLink =
      consumer.kind === 'markdown-link'
        ? markdownTargets(consumer.path, text).some((record) => record.target === consumer.target)
        : text.includes(consumer.literal);
    if (staleLink) errors.push(`stale pre-move consumer: ${consumer.path} -> ${consumer.literal}`);
  }
  return errors;
}

export function validateDocsMoveManifest(root, manifest) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.moves)) {
    return ['invalid docs move manifest'];
  }
  return [...moveStateErrors(root, manifest), ...staleConsumerErrors(root, manifest)].sort();
}

export function writeDocsMoveManifest(path, manifest) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
