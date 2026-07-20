// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDefaultRichShapeCalloutGeometry,
  createDefaultRichShapeObject,
  type EditorRichShapeDocumentObject,
} from '../../../../features/editor/document/rich-shape';
import { translate } from '../../../../platform/i18n';
import { renderRichShapeControlsSection } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
});

function renderShape(shape: EditorRichShapeDocumentObject) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(
      renderRichShapeControlsSection({
        applyRichShapePatch: vi.fn(),
        arrangeSelection: vi.fn(),
        recentColors: [],
        shape,
        shapeFillPalette: [],
        shapeStrokePalette: [],
        textColorPalette: [],
        toNumber: Number,
        updateColor: vi.fn(),
      })
    );
  });
}

describe('rich shape inspector capability resolution', () => {
  it('keeps text controls off custom shapes while retaining common formatting sections', () => {
    renderShape(
      createDefaultRichShapeObject({
        geometry: {
          type: 'path',
          viewBox: { minX: 0, minY: 0, width: 24, height: 24 },
          paths: [
            {
              commands: [
                ['M', 0, 0],
                ['L', 24, 24],
              ],
            },
          ],
        },
        shapeFamily: 'custom',
        shapeKind: 'custom-badge',
        source: {
          formatVersion: '1',
          importedAt: null,
          itemId: 'custom-badge',
          libraryId: null,
          name: 'Badge shield',
          type: 'custom',
        },
      })
    );

    expect(container?.textContent).toContain(translate('editor.compact.richShapeFill'));
    expect(container?.textContent).toContain(translate('editor.compact.richShapeLine'));
    expect(container?.textContent).toContain(translate('highlighter.editor.shadowLabel'));
    expect(container?.textContent).toContain(translate('editor.compact.richShapeReflection'));
    expect(container?.textContent).not.toContain(translate('editor.compact.richShapeText'));
  });
});

describe('rich shape inspector imported line capabilities', () => {
  it('limits imported line shapes to line formatting', () => {
    renderShape(
      createDefaultRichShapeObject({
        shapeFamily: 'line',
        shapeKind: 'excalidraw-line',
        source: {
          formatVersion: '2',
          importedAt: null,
          itemId: 'library-line',
          libraryId: 'library-1',
          name: 'Flow line',
          type: 'manual-excalidraw-import',
        },
      })
    );

    expect(container?.textContent).toContain(translate('editor.compact.richShapeLine'));
    expect(container?.textContent).not.toContain(translate('editor.compact.richShapeFill'));
    expect(container?.textContent).not.toContain(translate('editor.compact.richShapeText'));
  });
});

describe('rich shape inspector callout capabilities', () => {
  it('renders the dynamic callout tail controls alongside the standard shape sections', () => {
    const frame = { height: 100, left: 0, top: 0, width: 180 };

    renderShape(
      createDefaultRichShapeObject({
        callout: createDefaultRichShapeCalloutGeometry(frame, 'left'),
        frame,
        shapeFamily: 'callout',
        shapeKind: 'dynamic-callout',
      })
    );

    expect(container?.textContent).toContain(translate('editor.compact.richShapeLine'));
    expect(container?.textContent).toContain(translate('editor.compact.richShapeFill'));
    expect(container?.textContent).toContain(translate('editor.compact.richShapeText'));
    expect(container?.textContent).toContain(translate('editor.compact.richShapeTail'));
    expect(container?.textContent).toContain(translate('editor.compact.richShapeTailLeft'));
    expect(container?.textContent).toContain(translate('highlighter.editor.shadowLabel'));
  });
});

describe('rich shape inspector effect sections', () => {
  it('opens compact effect sections and renders their numeric controls', () => {
    renderShape(createDefaultRichShapeObject());

    const labels = [
      translate('highlighter.editor.shadowLabel'),
      translate('editor.compact.richShapeReflection'),
    ];

    act(() => {
      labels.forEach((label) => {
        Array.from(container?.querySelectorAll('button') ?? [])
          .find((button) => button.textContent?.includes(label))
          ?.click();
      });
    });

    expect(container?.textContent).toContain(translate('editor.compact.richShapeDistance'));
    expect(container?.textContent).toContain(translate('editor.compact.richShapeBlur'));
    expect(container?.innerHTML).toContain('shared.ui.compact-inspector.numeric-row');
  });
});
