// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { parseCustomShapeImport } from './importer';
import { parseCustomShapeJson } from './json';

it('normalizes a valid SVG path import into a custom shape definition', () => {
  const result = parseCustomShapeImport({
    fileName: 'badge.svg',
    mimeType: 'image/svg+xml',
    text: '<svg viewBox="0 0 24 24"><title>Badge</title><path d="M 1 1 L 23 1 L 23 23 Z"/></svg>',
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.definition).toEqual(
    expect.objectContaining({
      id: expect.stringMatching(/^custom-badge-/),
      label: 'Badge',
      category: 'custom',
      tags: ['custom', 'svg'],
      geometry: expect.objectContaining({ type: 'path' }),
    })
  );
  expect(result.definitions).toEqual([result.definition]);
});

it('rejects malicious SVG content before geometry normalization', () => {
  const result = parseCustomShapeImport({
    fileName: 'bad.svg',
    mimeType: 'image/svg+xml',
    text: '<svg viewBox="0 0 10 10"><script>alert(1)</script><path onclick="evil()" d="M0 0L1 1"/></svg>',
  });

  expect(result.ok).toBe(false);
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'unsafe-svg', severity: 'error' })])
  );
});

it('rejects SVG doctypes and external resource attributes', () => {
  expect(
    parseCustomShapeImport({
      fileName: 'doctype.svg',
      mimeType: 'image/svg+xml',
      text: '<!DOCTYPE svg><svg viewBox="0 0 10 10"><path d="M0 0L1 1"/></svg>',
    })
  ).toEqual(
    expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'unsafe-svg' })],
    })
  );
  expect(
    parseCustomShapeImport({
      fileName: 'href.svg',
      mimeType: 'image/svg+xml',
      text: '<svg viewBox="0 0 10 10"><path href="https://example.test/x" d="M0 0L1 1"/></svg>',
    })
  ).toEqual(expect.objectContaining({ ok: false }));
});

it('rejects invalid JSON shape definitions', () => {
  const result = parseCustomShapeImport({
    fileName: 'shape.json',
    mimeType: 'application/json',
    text: '{"label": "Broken", "geometry":',
  });

  expect(result.ok).toBe(false);
  expect(result.diagnostics[0]).toEqual(
    expect.objectContaining({ code: 'invalid-json', severity: 'error' })
  );
});

it('normalizes valid JSON shape definitions and unknown extensions without fetching resources', () => {
  const text = JSON.stringify({
    label: 'JSON badge',
    viewBox: { minX: 0, minY: 0, width: 12, height: 12 },
    paths: [
      {
        commands: [
          ['M', 0, 0],
          ['L', 12, 12],
        ],
      },
    ],
    tags: ['json'],
  });

  const result = parseCustomShapeImport({
    fileName: 'badge.shape',
    mimeType: '',
    text,
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.definition).toEqual(
    expect.objectContaining({
      label: 'JSON badge',
      tags: ['json'],
      geometry: expect.objectContaining({ type: 'path' }),
    })
  );
  expect(result.definitions).toEqual([result.definition]);
});

it('accepts strict JSON custom shape definitions with explicit ids', () => {
  const result = parseCustomShapeImport({
    fileName: 'strict.json',
    mimeType: 'application/json',
    text: JSON.stringify({
      id: 'custom-strict',
      label: 'Strict',
      category: 'custom',
      tags: ['strict'],
      capabilities: ['fill'],
      geometry: {
        type: 'polyline',
        viewBox: { minX: 0, minY: 0, width: 10, height: 10 },
        points: [
          [0, 0],
          [10, 10],
        ],
        closed: false,
      },
    }),
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.definition.id).toBe('custom-strict');
  expect(result.definition.geometry.type).toBe('polyline');
});

it('normalizes loose JSON definitions with defaults and explicit geometry objects', () => {
  const result = parseCustomShapeJson({
    fileName: '',
    text: JSON.stringify({
      geometry: {
        type: 'path',
        viewBox: { minX: 0, minY: 0, width: 8, height: 8 },
        paths: [
          {
            commands: [
              ['M', 0, 0],
              ['L', 8, 8],
            ],
          },
        ],
      },
    }),
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.definition).toEqual(
    expect.objectContaining({
      id: expect.stringMatching(/^custom-custom-shape-/),
      label: '',
      category: 'custom',
      tags: ['custom'],
    })
  );
});

it('rejects loose JSON values without usable geometry', () => {
  const nonObject = parseCustomShapeJson({ fileName: 'number.json', text: '4' });
  expect(nonObject).toEqual(expect.objectContaining({ ok: false }));
  expect(nonObject.diagnostics[0]).not.toHaveProperty('detail');
  expect(
    parseCustomShapeJson({
      fileName: 'missing-paths.json',
      text: JSON.stringify({ label: 'Missing paths', viewBox: { minX: 0 } }),
    })
  ).toEqual(expect.objectContaining({ ok: false }));
});

it('returns diagnostics for unsupported SVG geometry and skipped parts', () => {
  expect(
    parseCustomShapeImport({
      fileName: 'empty.svg',
      mimeType: 'image/svg+xml',
      text: '<svg viewBox="0 0 10 10"><path /></svg>',
    })
  ).toEqual(
    expect.objectContaining({
      ok: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'skipped-element', severity: 'warning' }),
        expect.objectContaining({ code: 'unsupported-geometry', severity: 'error' }),
      ]),
    })
  );
});

it('accepts safe SVG primitive elements', () => {
  const result = parseCustomShapeImport({
    fileName: 'primitives.svg',
    mimeType: 'image/svg+xml',
    text: [
      '<svg width="20" height="20">',
      '<rect x="1" y="2" width="3" height="4"/>',
      '<circle cx="10" cy="10" r="5"/>',
      '<line x1="0" y1="0" x2="20" y2="20"/>',
      '<polyline points="0,0 10,10 20,0"/>',
      '</svg>',
    ].join(''),
  });

  expect(result.ok).toBe(true);
  if (!result.ok) {
    return;
  }
  expect(result.definition.geometry).toEqual(
    expect.objectContaining({
      type: 'path',
      paths: expect.arrayContaining([expect.objectContaining({ commands: expect.any(Array) })]),
    })
  );
});

it('routes unknown extension SVG and Excalidraw payloads through content sniffing', () => {
  const svg = parseCustomShapeImport({
    fileName: 'shape.import',
    mimeType: '',
    text: '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>',
  });
  const excalidraw = parseCustomShapeImport({
    fileName: 'shape.import',
    mimeType: '',
    text: JSON.stringify({
      type: 'excalidraw',
      elements: [{ id: 'rect-1', type: 'rectangle', width: 10, height: 10 }],
    }),
  });

  expect(svg).toEqual(expect.objectContaining({ ok: true }));
  expect(excalidraw).toEqual(
    expect.objectContaining({
      ok: true,
      definition: expect.objectContaining({
        source: expect.objectContaining({ type: 'manual-excalidraw-import' }),
      }),
    })
  );
});

it('reports imported, skipped, unsupported, and source metadata for Excalidraw libraries', () => {
  const result = parseCustomShapeImport({
    fileName: 'workflow.excalidrawlib',
    mimeType: 'application/json',
    text: JSON.stringify({
      type: 'excalidrawlib',
      name: 'Workflow',
      libraryItems: [
        {
          name: 'Decision',
          elements: [
            { id: 'rect-1', type: 'rectangle', width: 10, height: 10 },
            { id: 'frame-1', type: 'frame', width: 10, height: 10 },
          ],
        },
      ],
    }),
  });

  expect(result).toEqual(
    expect.objectContaining({
      ok: true,
      sourceName: 'Workflow',
      definitions: [expect.objectContaining({ label: 'Decision' })],
      diagnostics: [expect.objectContaining({ code: 'unsupported-element', severity: 'warning' })],
    })
  );
});
