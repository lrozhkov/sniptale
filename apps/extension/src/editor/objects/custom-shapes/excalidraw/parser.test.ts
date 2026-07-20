import { expect, it } from 'vitest';
import { parseCustomShapeImport } from '../importer';
import { parseExcalidrawCustomShapeImport } from './parser';

function element(overrides: Record<string, unknown>) {
  return {
    id: 'element',
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 120,
    height: 80,
    strokeColor: '#111827',
    backgroundColor: '#ffffff',
    ...overrides,
  };
}

function parsePayload(fileName: string, payload: unknown) {
  return parseCustomShapeImport({
    fileName,
    mimeType: 'application/json',
    text: JSON.stringify(payload),
  });
}

function createWorkflowLibraryPayload() {
  return {
    type: 'excalidrawlib',
    version: 2,
    id: 'library-1',
    libraryItems: [
      {
        id: 'item-rect',
        name: 'Approval step',
        category: 'flow',
        tags: ['approval'],
        elements: [
          element({ id: 'rect-1', roughness: 2, seed: 7 }),
          element({ id: 'text-1', type: 'text', text: 'Approve', containerId: 'rect-1' }),
          element({ id: 'image-1', type: 'image' }),
        ],
      },
      {
        id: 'item-group',
        name: 'Grouped decision',
        elements: [
          element({ id: 'diamond-1', type: 'diamond', groupIds: ['group-1'] }),
          element({ id: 'ellipse-1', type: 'ellipse', x: 140, groupIds: ['group-1'] }),
        ],
      },
    ],
  };
}

function expectWorkflowLibraryResult(result: ReturnType<typeof parsePayload>) {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.definitions).toHaveLength(2);
  expect(result.diagnostics).toEqual([
    expect.objectContaining({ code: 'unsupported-element', severity: 'warning' }),
  ]);
  expect(result.definitions[0]).toEqual(
    expect.objectContaining({
      label: 'Approval step',
      category: 'flow',
      tags: expect.arrayContaining(['excalidraw', 'manual-import', 'approval']),
      source: expect.objectContaining({
        type: 'manual-excalidraw-import',
        libraryId: 'library-1',
        itemId: 'item-rect',
      }),
      importMetadata: expect.objectContaining({ textContent: 'Approve' }),
    })
  );
  expect(result.definitions[1]?.importMetadata?.groupIds).toEqual(['group-1']);
}

it('parses representative .excalidrawlib files with multiple items and diagnostics', () => {
  const result = parsePayload('workflow.excalidrawlib', createWorkflowLibraryPayload());

  expectWorkflowLibraryResult(result);
});

it('uses a stable fallback label when library item names are absent', () => {
  const result = parsePayload('unnamed.excalidrawlib', {
    type: 'excalidrawlib',
    libraryItems: [
      {
        id: 'item-unnamed',
        elements: [element({ id: 'rect-unnamed', type: 'rectangle' })],
      },
    ],
  });

  expect(result).toEqual(
    expect.objectContaining({
      ok: true,
      definition: expect.objectContaining({ label: 'Library item 1' }),
    })
  );
});

it('infers legacy library-array labels from text without turning text into geometry boxes', () => {
  const result = parsePayload('legacy.excalidrawlib', {
    type: 'excalidrawlib',
    library: [
      [
        element({ id: 'diamond-legacy', type: 'diamond', x: 20, y: 30, width: 120, height: 80 }),
        element({
          id: 'label-legacy',
          type: 'text',
          text: 'Condition',
          x: 52,
          y: 56,
          width: 80,
          height: 24,
        }),
        element({
          id: 'arrow-legacy',
          type: 'arrow',
          x: 20,
          y: 70,
          width: 30,
          height: 0,
          points: [
            [0, 0],
            [-30, 0],
          ],
        }),
      ],
    ],
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.definition.label).toBe('Condition 1');
  expect(result.definition.geometry).toEqual(
    expect.objectContaining({
      type: 'path',
      viewBox: expect.objectContaining({ width: 150, height: 80 }),
    })
  );
  expect(
    result.definition.geometry.type === 'path' ? result.definition.geometry.paths : []
  ).toHaveLength(2);
  expect(result.definition.importMetadata?.elementTypes).toEqual(['diamond', 'arrow']);
  expect(result.definition.importMetadata?.textContent).toBe('Condition');
  expect(result.definition.richShapeDefaults?.text?.content).toBe('Condition');
});

it('maps representative Excalidraw export elements into shape definitions', () => {
  const result = parsePayload('scene.json', {
    type: 'excalidraw',
    version: 2,
    elements: [
      element({ id: 'rect-1', type: 'rectangle' }),
      element({ id: 'ellipse-1', type: 'ellipse' }),
      element({ id: 'diamond-1', type: 'diamond', groupIds: ['group-a'] }),
      element({
        id: 'arrow-1',
        type: 'arrow',
        points: [
          [0, 0],
          [80, 20],
        ],
        endArrowhead: 'arrow',
      }),
      element({
        id: 'line-1',
        type: 'line',
        points: [
          [0, 0],
          [30, 40],
        ],
      }),
      element({ id: 'text-1', type: 'text', text: 'Standalone', fontSize: 24 }),
    ],
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(
    result.definitions.map((definition) => definition.importMetadata?.elementTypes[0])
  ).toEqual(['rectangle', 'ellipse', 'diamond', 'arrow', 'line', 'text']);
  expect(result.definitions[3]?.richShapeDefaults?.style?.line.endArrowhead).toBe('triangle');
  expect(result.definitions[4]?.geometry.type).toBe('polyline');
  expect(result.definitions[5]?.richShapeDefaults?.text?.content).toBe('Standalone');
  expect(result.definitions[2]?.importMetadata?.groupIds).toEqual(['group-a']);
});

it('rejects malformed Excalidraw roots before using payload content', () => {
  const notObject = parseCustomShapeImport({
    fileName: 'broken.excalidrawlib',
    mimeType: 'application/json',
    text: '[]',
  });
  const badLibrary = parsePayload('bad.excalidrawlib', {
    type: 'excalidrawlib',
    libraryItems: {},
  });

  expect(notObject).toEqual(
    expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'invalid-excalidraw' })],
    })
  );
  expect(badLibrary).toEqual(
    expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'invalid-excalidraw' })],
    })
  );
  expect(parsePayload('empty.excalidrawlib', { type: 'not-excalidraw' })).toEqual(
    expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'invalid-excalidraw' })],
    })
  );
});

it('leaves non-Excalidraw JSON candidates for the regular JSON parser', () => {
  expect(
    parseExcalidrawCustomShapeImport({
      fileName: 'shape.json',
      text: '{"label":',
      required: false,
    })
  ).toEqual({ handled: false });
  expect(
    parseExcalidrawCustomShapeImport({
      fileName: 'shape.json',
      text: JSON.stringify({ label: 'Custom JSON' }),
      required: false,
    })
  ).toEqual({ handled: false });
  expect(
    parseExcalidrawCustomShapeImport({
      fileName: 'shape.excalidrawlib',
      text: '{"type":',
      required: true,
    })
  ).toEqual(
    expect.objectContaining({
      handled: true,
      result: expect.objectContaining({ ok: false }),
    })
  );
});

it('skips unsupported Excalidraw elements without blocking supported items', () => {
  const result = parsePayload('mixed.json', {
    type: 'excalidraw',
    elements: [element({ id: 'rect-1' }), element({ id: 'freedraw-1', type: 'freedraw' })],
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.definitions).toHaveLength(1);
  expect(result.diagnostics).toEqual([
    expect.objectContaining({ code: 'unsupported-element', detail: 'freedraw-1' }),
  ]);
});

it('returns unsupported diagnostics when an Excalidraw payload has no mappable elements', () => {
  const result = parsePayload('unsupported.excalidrawlib', {
    type: 'excalidrawlib',
    name: 'Unsupported library',
    libraryItems: [{ elements: [element({ id: '', type: 'image' })] }],
  });

  expect(result).toEqual(
    expect.objectContaining({
      ok: false,
      sourceName: 'Unsupported library',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported-element' }),
        expect.objectContaining({ code: 'unsupported-geometry' }),
      ]),
    })
  );
});
