import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import corpus from '../fixtures/presentation/parity.json';
import lock from '../fixtures/presentation/source-lock.json';
import {
  validateEffectV1Document,
  normalizeEffectV1ToTemplate,
  applyEffectV1ControlPresetValues,
  validateEffectV1ControlPresetValues,
  resolveEffectV1ControlGroup,
  EFFECT_V1_CONTROL_GROUPS,
} from '../index';

it.each(corpus.cases)('matches the frozen SDK metadata case $id', (entry) => {
  const options =
    'validationOptions' in entry && entry.validationOptions?.presentationPolicy === 'retained'
      ? { presentationPolicy: 'retained' as const }
      : undefined;
  const result = validateEffectV1Document(entry.document, options);
  expect(result.ok).toBe(entry.actual.accepted);
  expect(result.diagnostics.map(({ severity, code, path }) => ({ severity, code, path }))).toEqual(
    entry.actual.diagnostics
  );
});

it('retains units, options, icons and nested groups in normalized and retained documents', () => {
  const fixture = corpus.cases.find((entry) => entry.id === 'nested-metadata');
  if (!fixture) throw new Error('Missing nested metadata fixture');
  const result = validateEffectV1Document(fixture.document);
  if (!result.ok || !result.document) throw new Error('Expected valid metadata document');
  const normalized = normalizeEffectV1ToTemplate(result.document);
  expect(normalized.controls).toEqual(result.document.controls);
  expect(normalized).toHaveProperty('controlGroups', result.document.controlGroups);
  expect(normalized.effectV1).toEqual(result.document);
  expect(validateEffectV1Document(JSON.parse(JSON.stringify(result.document)))).toMatchObject({
    ok: true,
    document: result.document,
  });
  expect(applyEffectV1ControlPresetValues(result.document, {}, { amount: 30 })).toEqual({
    amount: 30,
  });
});

it('locks the producer schema and complete positive/negative metadata corpus', () => {
  for (const [path, expected] of [
    ['../fixtures/presentation/parity.json', lock.paritySha256],
    ['../fixtures/sniptale-effect-v1.schema.json', lock.schemaSha256],
  ] as const) {
    const bytes = readFileSync(new URL(path, import.meta.url));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(expected);
  }
});

it.each(EFFECT_V1_CONTROL_GROUPS)(
  'preserves preset protection through nested %s groups',
  (root) => {
    const entry = corpus.cases.find((item) => item.id === 'nested-metadata');
    if (!entry) throw new Error('Missing nested metadata fixture');
    const result = validateEffectV1Document(entry.document);
    if (!result.ok || !result.document) throw new Error('Expected valid metadata document');
    const document = structuredClone(result.document);
    const amount = document.controls.find((control) => control.id === 'amount');
    if (!amount) throw new Error('Missing amount control');
    document.controlGroups = [
      { id: 'nested', parentId: root, label: { en: 'Nested' } },
      { id: 'detail', parentId: 'nested', label: { en: 'Detail' } },
    ];
    amount.group = 'detail';
    expect(validateEffectV1Document(document).ok).toBe(true);
    expect(resolveEffectV1ControlGroup(amount.group, document.controlGroups)).toBe(root);
    const overrides = validateEffectV1ControlPresetValues(document, { amount: 30 });
    const visual = ['appearance', 'typography', 'processing', 'animation'].includes(root);
    expect(overrides.ok).toBe(visual);
    expect(overrides.diagnostics.map((item) => item.code)).toEqual(
      visual ? [] : ['CONTROL_PRESET_PROTECTED']
    );
  }
);

it('refuses ambiguous, cyclic and missing custom group chains', () => {
  for (const groups of [
    [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ],
    [
      { id: 'a', parentId: 'content' },
      { id: 'a', parentId: 'appearance' },
    ],
    [{ id: 'a', parentId: 'missing' }],
  ])
    expect(resolveEffectV1ControlGroup('a', groups)).toBeNull();
});

it('retained presentation warnings cannot admit executable payloads', () => {
  const entry = corpus.cases.find((item) => item.id === 'group-icon-used-root');
  if (!entry) throw new Error('Missing conflicting icon fixture');
  const document = structuredClone(entry.document);
  const before = JSON.stringify(document);
  const result = validateEffectV1Document(
    { ...document, source: 'evil()' },
    { presentationPolicy: 'retained' }
  );
  expect(result.ok).toBe(false);
  expect(result.document).toBeUndefined();
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'EXECUTABLE_FIELD_FORBIDDEN', severity: 'error' })
  );
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'CONTROL_GROUP_ICON_DUPLICATE', severity: 'warning' })
  );
  expect(JSON.stringify(document)).toBe(before);
});
