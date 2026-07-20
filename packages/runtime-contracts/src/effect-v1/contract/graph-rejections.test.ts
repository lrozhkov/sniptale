import { expect, it } from 'vitest';

import { collectEffectV1PassIndex, validateEffectV1CommandSemantics } from '../command/validation';
import { createEffectV1TestDocument } from './test-support';
import { createEffectV1Diagnostics, finishEffectV1Validation } from '../model/diagnostics';
import { createEffectV1ReadReferences, type EffectV1GraphReferences } from '../graph/model';
import { validateCommandReferences } from '../graph/references';
import { validateEffectV1Graph } from '../graph/validation';
import { rejectEffectV1ExecutableFields, validateEffectV1Program } from '../validation/program';

it('reports command collection, path, paint, and pass failures', () => {
  const report = createEffectV1Diagnostics();
  const commands = [
    { commands: [], id: 'duplicate', op: 'renderPass' },
    { commands: [{ op: 'clear' }], id: 'duplicate', op: 'renderPass' },
    { op: 'compositePass', passId: 'missing' },
    { bindings: [], op: 'let' },
    { bindings: {}, op: 'let' },
    { items: 'invalid', op: 'forEach' },
    { items: [], op: 'forEach' },
    { fill: null, filter: 'invalid', op: 'path', shadow: 'invalid' },
  ];
  const passes = collectEffectV1PassIndex([null, ...commands]);
  for (const [index, command] of commands.entries()) {
    validateEffectV1CommandSemantics(command, `$.commands[${index}]`, passes, report);
  }

  expect(report.diagnostics.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      'COMMANDS_EMPTY',
      'COMMAND_ITEMS_TYPE',
      'COMMAND_ITEMS_EMPTY',
      'COMMAND_BINDINGS_TYPE',
      'COMMAND_BINDINGS_EMPTY',
      'COMMAND_PATH_SOURCE',
      'RENDER_PASS_DUPLICATE',
      'RENDER_PASS_UNKNOWN',
    ])
  );
});

it('reports unavailable layer, asset, SVG, image, and input references', () => {
  const report = createEffectV1Diagnostics();
  const assets = new Map([
    ['audio', { id: 'audio', kind: 'audio' }],
    ['image', { id: 'image', kind: 'image' }],
  ]);
  const references = createEffectV1ReadReferences({}, new Set(), {
    controlIds: new Set(),
    layerIds: new Set(),
    trackIds: new Set(),
  });
  for (const command of [
    { assetId: 'missing', layerId: 'missing', op: 'image' },
    { op: 'image' },
    { assetId: 'image', input: 'source', op: 'image' },
    { assetId: 'audio', op: 'image' },
    { input: 'source', op: 'image' },
    { assetId: 'image', op: 'svgParts' },
  ]) {
    validateCommandReferences(command, '$.command', assets, new Set(), references, report);
  }
  validateCommandReferences(
    { input: 'missing', op: 'image' },
    '$.command',
    assets,
    new Set(['source']),
    references,
    report
  );

  expect(report.diagnostics.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      'COMMAND_LAYER_UNKNOWN',
      'COMMAND_ASSET_UNKNOWN',
      'IMAGE_SOURCE',
      'IMAGE_ASSET_KIND',
      'IMAGE_INPUT_UNAVAILABLE',
      'SVG_PARTS_ASSET_KIND',
    ])
  );
});

it('reports malformed programs, graphs, and nested executable fields', () => {
  const report = createEffectV1Diagnostics();
  const references: EffectV1GraphReferences = {
    controlIds: new Set(),
    layerIds: new Set(),
    trackIds: new Set(),
  };
  validateEffectV1Program(null, new Map(), new Set(), references, report);
  validateEffectV1Program({ kind: 'legacy' }, new Map(), new Set(), references, report);
  validateEffectV1Program(
    { commands: [], kind: 'graph', version: 2 },
    new Map(),
    new Set(),
    references,
    report
  );
  validateEffectV1Graph({ commands: 'invalid' }, new Map(), new Set(), references, report);
  validateEffectV1Graph(
    { commands: [], definitions: [] },
    new Map(),
    new Set(),
    references,
    report
  );
  rejectEffectV1ExecutableFields([{ nested: { source: 'code' } }], '$', report);

  expect(report.diagnostics.map(({ code }) => code)).toEqual(
    expect.arrayContaining([
      'PROGRAM_TYPE',
      'PROGRAM_KIND',
      'PROGRAM_VERSION',
      'COMMANDS_TYPE',
      'COMMANDS_EMPTY',
      'DEFINITIONS_TYPE',
      'EXECUTABLE_FIELD_FORBIDDEN',
    ])
  );
});

it('summarizes warning-only and error diagnostics without leaking invalid documents', () => {
  const report = createEffectV1Diagnostics();
  report.warning('WARN', '$.field', 'Review field.');
  expect(finishEffectV1Validation(report.diagnostics, createEffectV1TestDocument())).toMatchObject({
    ok: true,
    summary: { errors: 0, warnings: 1 },
  });
  report.error('ERROR', '$.field', 'Invalid field.');
  const result = finishEffectV1Validation(report.diagnostics, createEffectV1TestDocument());
  expect(result).toMatchObject({
    ok: false,
    summary: { errors: 1, warnings: 1 },
  });
  expect(result).not.toHaveProperty('document');
});
