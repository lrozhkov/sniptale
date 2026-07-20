// @vitest-environment jsdom

import { expect, it } from 'vitest';

import { parseCustomShapeImport } from './importer';

function expectResourceBudgetFailure(text: string): void {
  const result = parseCustomShapeImport({
    fileName: 'shape.json',
    mimeType: 'application/json',
    text,
  });

  expect(result).toEqual(
    expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'resource-budget', severity: 'error' })],
    })
  );
}

it('rejects oversized custom shape text before JSON or SVG parsing', () => {
  expectResourceBudgetFailure(' '.repeat(2 * 1024 * 1024 + 1));
});

it('rejects custom shape definitions with excessive path commands', () => {
  expectResourceBudgetFailure(
    JSON.stringify({
      label: 'Huge path',
      geometry: {
        type: 'path',
        viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
        paths: [
          {
            commands: Array.from({ length: 5_001 }, () => ['L', 1, 1]),
          },
        ],
      },
    })
  );
});

it('rejects custom shape definitions with excessive metadata or coordinates', () => {
  expectResourceBudgetFailure(
    JSON.stringify({
      label: 'x'.repeat(201),
      viewBox: { minX: 0, minY: 0, width: 10, height: 10 },
      paths: [{ commands: [['M', 0, 0]] }],
    })
  );
  expectResourceBudgetFailure(
    JSON.stringify({
      label: 'Out of bounds',
      viewBox: { minX: 0, minY: 0, width: 40_000, height: 10 },
      paths: [{ commands: [['M', 0, 0]] }],
    })
  );
  expectResourceBudgetFailure(
    JSON.stringify({
      label: 'Out of bounds command',
      viewBox: { minX: 0, minY: 0, width: 100, height: 100 },
      paths: [{ commands: [['M', 200_000, 0]] }],
    })
  );
});

it('rejects custom shape imports with too many generated definitions', () => {
  const libraryItems = Array.from({ length: 101 }, (_unused, index) => ({
    name: `Item ${index}`,
    elements: [{ id: `rect-${index}`, type: 'rectangle', width: 10, height: 10 }],
  }));

  const result = parseCustomShapeImport({
    fileName: 'library.excalidrawlib',
    mimeType: 'application/json',
    text: JSON.stringify({ type: 'excalidrawlib', libraryItems }),
  });

  expect(result).toEqual(
    expect.objectContaining({
      ok: false,
      diagnostics: [expect.objectContaining({ code: 'resource-budget', severity: 'error' })],
    })
  );
});
