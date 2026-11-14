import { isDeepStrictEqual } from 'node:util';

const HASH = /^[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const validHash = (value) => typeof value === 'string' && HASH.test(value);
const validId = (value) => typeof value === 'string' && ID.test(value);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const positive = (value) => Number.isSafeInteger(value) && value > 0;

function refuse(classification, message) {
  const error = new Error(message);
  error.classification = classification;
  throw error;
}

function requireValue(condition, classification, message) {
  if (!condition) refuse(classification, message);
}

function relativePng(value) {
  return (
    typeof value === 'string' &&
    /^[a-zA-Z0-9_./-]+\.png$/.test(value) &&
    !value.startsWith('/') &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}

function rectangle(value, width, height) {
  return (
    record(value) &&
    [value.x, value.y, value.width, value.height].every(finite) &&
    value.x >= 0 &&
    value.y >= 0 &&
    value.width > 0 &&
    value.height > 0 &&
    value.x + value.width <= width &&
    value.y + value.height <= height
  );
}

function validateCase(entry) {
  const valid = (condition, message) => requireValue(condition, 'generation-error', message);
  valid(record(entry) && validId(entry.id), 'Invalid corpus case identity.');
  valid(positive(entry.width) && positive(entry.height), 'Invalid corpus dimensions.');
  valid(entry.width * entry.height <= 16_777_216, 'Corpus image exceeds the pixel budget.');
  valid(['tuning', 'holdout'].includes(entry.split), 'Invalid corpus split.');
  valid(
    Array.isArray(entry.tags) && entry.tags.every((tag) => typeof tag === 'string'),
    'Invalid case tags.'
  );
  valid(rectangle(entry.region, entry.width, entry.height), 'Invalid corpus region.');
  valid(
    Object.values(entry.region).every(Number.isSafeInteger),
    'Region coordinates must be integers.'
  );
  for (const [path, hash] of [
    ['path', 'sourceHash'],
    ['referencePath', 'referenceHash'],
    ['inkMaskPath', 'inkMaskHash'],
    ['protectedMaskPath', 'protectedMaskHash'],
  ]) {
    valid(relativePng(entry[path]) && validHash(entry[hash]), 'Invalid corpus resource reference.');
  }
  valid(Array.isArray(entry.fragments), 'Missing corpus fragments.');
  const ids = new Set();
  for (const fragment of entry.fragments) {
    valid(
      record(fragment) && typeof fragment.id === 'string' && fragment.id.length > 0,
      'Invalid fragment identity.'
    );
    valid(!ids.has(fragment.id), 'Duplicate fragment identity.');
    ids.add(fragment.id);
    valid(typeof fragment.text === 'string' && fragment.text.length > 0, 'Missing fragment text.');
    valid(
      Array.isArray(fragment.rects) && fragment.rects.length > 0,
      'Missing fragment coordinates.'
    );
    valid(
      fragment.rects.every((rect) => rectangle(rect, entry.width, entry.height)),
      'Invalid fragment coordinates.'
    );
    valid(
      Array.isArray(fragment.tags) && fragment.tags.every((tag) => typeof tag === 'string'),
      'Invalid fragment tags.'
    );
  }
}

/** Parse the local corpus boundary before any image or oracle resource is loaded. */
export function validateManifest(value) {
  const valid = (condition, message) => requireValue(condition, 'generation-error', message);
  valid(record(value) && value.schemaVersion === 1, 'Unsupported corpus schema.');
  valid(validHash(value.fingerprint), 'Invalid corpus fingerprint.');
  valid(
    ['smoke', 'full'].includes(value.profile) && Number.isSafeInteger(value.seed),
    'Invalid corpus recipe selection.'
  );
  valid(
    typeof value.generatorVersion === 'string' && typeof value.recipeVersion === 'string',
    'Missing generator versions.'
  );
  valid(
    record(value.renderEnvironment) && record(value.splitDefinition),
    'Missing corpus environment.'
  );
  valid(Array.isArray(value.fonts) && value.fonts.length > 0, 'Missing corpus fonts.');
  for (const font of value.fonts) {
    valid(record(font) && validHash(font.sha256), 'Invalid font resource identity.');
  }
  valid(
    Array.isArray(value.cases) && value.cases.length > 0 && value.cases.length <= 100,
    'Empty or excessive corpus.'
  );
  const ids = new Set();
  for (const entry of value.cases) {
    validateCase(entry);
    valid(!ids.has(entry.id), 'Duplicate corpus case.');
    ids.add(entry.id);
  }
  return value;
}

/** Accept only complete measurements as comparison baselines; quality need not already pass. */
export function validateBaselineSummary(value) {
  const valid = (condition, message) => requireValue(condition, 'incompatible-baseline', message);
  valid(record(value) && value.schemaVersion === 1, 'Unsupported baseline schema.');
  valid(
    ['baseline', 'pass', 'failed'].includes(value.status) && value.complete === true,
    'Baseline is incomplete.'
  );
  valid(
    record(value.corpus) && validHash(value.corpus.fingerprint),
    'Invalid baseline corpus identity.'
  );
  valid(
    record(value.selection) &&
      Array.isArray(value.selection.caseIds) &&
      value.selection.caseIds.length > 0,
    'Empty baseline selection.'
  );
  valid(
    value.selection.caseIds.every((id) => validId(id)),
    'Invalid baseline case identity.'
  );
  valid(
    new Set(value.selection.caseIds).size === value.selection.caseIds.length,
    'Duplicate baseline selection.'
  );
  valid([null, 'tuning', 'holdout'].includes(value.selection.split), 'Invalid baseline split.');
  valid(
    record(value.settings) && record(value.thresholds),
    'Missing baseline settings or calibration.'
  );
  valid(Object.values(value.thresholds).every(finite), 'Invalid baseline calibration.');
  valid(
    typeof value.oracleVersion === 'string' && value.oracleVersion.length > 0,
    'Missing oracle version.'
  );
  valid(validHash(value.engineHash), 'Missing engine identity.');
  valid(
    Array.isArray(value.cases) && value.cases.length === value.selection.caseIds.length,
    'Incomplete baseline cases.'
  );
  const ids = new Set();
  for (const entry of value.cases) {
    valid(
      record(entry) && value.selection.caseIds.includes(entry.caseId) && !ids.has(entry.caseId),
      'Invalid baseline case results.'
    );
    ids.add(entry.caseId);
    valid(
      validHash(entry.sourceHash) && record(entry.metrics),
      'Missing baseline source or metrics.'
    );
    valid(Object.values(entry.metrics).every(finite), 'Invalid baseline metrics.');
    valid(Array.isArray(entry.fragments), 'Missing baseline fragment results.');
    const fragmentIds = new Set();
    for (const fragment of entry.fragments) {
      valid(
        record(fragment) && typeof fragment.id === 'string' && !fragmentIds.has(fragment.id),
        'Invalid baseline fragment result.'
      );
      fragmentIds.add(fragment.id);
      valid(
        finite(fragment.remainingFraction) &&
          fragment.remainingFraction >= 0 &&
          fragment.remainingFraction <= 1,
        'Invalid text residue metric.'
      );
    }
  }
  return value;
}

function comparableFields(summary) {
  return {
    fingerprint: summary.corpus.fingerprint,
    caseIds: summary.selection.caseIds,
    split: summary.selection.split,
    settings: summary.settings,
    oracleVersion: summary.oracleVersion,
    thresholds: summary.thresholds,
  };
}

/** Compare identical input cohorts without letting aggregate recall hide local damage. */
export function compareRunSummaries(baseline, candidate) {
  validateBaselineSummary(baseline);
  validateBaselineSummary(candidate);
  requireValue(
    isDeepStrictEqual(comparableFields(baseline), comparableFields(candidate)),
    'incompatible-baseline',
    'Corpus, selected cases, settings, or oracle calibration differ.'
  );
  const tolerance = candidate.thresholds.regressionTolerance ?? 0;
  requireValue(
    tolerance >= 0 && tolerance <= 1,
    'incompatible-baseline',
    'Invalid regression tolerance.'
  );
  const regressions = [],
    improvements = [];
  let unchangedCases = 0;
  for (const next of candidate.cases) {
    const before = baseline.cases.find((entry) => entry.caseId === next.caseId);
    requireValue(
      before.sourceHash === next.sourceHash,
      'incompatible-baseline',
      'Case source bytes differ.'
    );
    requireValue(
      isDeepStrictEqual(
        before.fragments.map((f) => f.id),
        next.fragments.map((f) => f.id)
      ),
      'incompatible-baseline',
      'Fragment cohort differs.'
    );
    let changed = false;
    requireValue(
      isDeepStrictEqual(Object.keys(before.metrics).sort(), Object.keys(next.metrics).sort()),
      'incompatible-baseline',
      'Metric schema differs.'
    );
    for (const [metric, value] of Object.entries(next.metrics)) {
      const previous = before.metrics[metric];
      requireValue(finite(previous), 'incompatible-baseline', 'Metric schema differs.');
      if (!/Fraction$/.test(metric)) continue;
      const allowed = /protected|outside/i.test(metric) ? 0 : tolerance;
      if (value > previous + allowed) {
        regressions.push({ caseId: next.caseId, metric, before: previous, after: value });
        changed = true;
      } else if (value < previous - tolerance) {
        improvements.push({ caseId: next.caseId, metric, before: previous, after: value });
        changed = true;
      }
    }
    for (let index = 0; index < next.fragments.length; index++) {
      const a = before.fragments[index],
        b = next.fragments[index];
      const newFullMiss = b.status === 'full-miss' && a.status !== 'full-miss';
      if (newFullMiss || b.remainingFraction > a.remainingFraction + tolerance) {
        regressions.push({
          caseId: next.caseId,
          fragmentId: b.id,
          metric: 'remainingFraction',
          before: a.remainingFraction,
          after: b.remainingFraction,
        });
        changed = true;
      } else if (b.remainingFraction < a.remainingFraction - tolerance) {
        improvements.push({
          caseId: next.caseId,
          fragmentId: b.id,
          metric: 'remainingFraction',
          before: a.remainingFraction,
          after: b.remainingFraction,
        });
        changed = true;
      }
    }
    if (!changed) unchangedCases++;
  }
  return {
    compatible: true,
    regressions,
    improvements,
    unchangedCases,
    status: regressions.length ? 'failed' : 'pass',
  };
}
