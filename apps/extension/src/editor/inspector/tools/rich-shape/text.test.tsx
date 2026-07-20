// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import { RichShapeTextSection } from './text';
import type { RichShapeControlsProps } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<RichShapeControlsProps> = {}): RichShapeControlsProps {
  return {
    applyRichShapePatch: vi.fn(),
    arrangeSelection: vi.fn(),
    capabilities: ['text'],
    recentColors: [],
    roughCapable: true,
    shape: createDefaultRichShapeObject(),
    shapeFillPalette: [],
    shapeStrokePalette: [],
    textColorPalette: [],
    toNumber: Number,
    updateColor: (setter, color) => setter(color),
    ...overrides,
  };
}

function renderTextSection(props: RichShapeControlsProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<RichShapeTextSection {...props} compact />));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

it('routes rich-shape text alignment and style grids through compact toggle controls', () => {
  const props = createProps();
  renderTextSection(props);

  expect(
    container?.querySelectorAll('[data-ui="shared.ui.compact-inspector.toggle-grid"]')
  ).toHaveLength(3);

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('button[aria-label="editor.compact.textAlignRight"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('button[aria-label="editor.compact.bold"]')
      ?.click();
  });

  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { horizontalAlign: 'right' } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { fontWeight: 'bold' } });
});

it('routes active rich-shape text style toggles back to inactive values', () => {
  const baseShape = createDefaultRichShapeObject();
  const props = createProps({
    shape: createDefaultRichShapeObject({
      text: {
        ...baseShape.text,
        fontStyle: 'italic',
        fontWeight: 'bold',
        strike: true,
        underline: true,
      },
    }),
  });
  renderTextSection(props);

  act(() => {
    [
      'editor.compact.bold',
      'editor.compact.italic',
      'editor.compact.underline',
      'editor.compact.strikethrough',
    ].forEach((label) => {
      container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
    });
  });

  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { fontWeight: 'normal' } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { fontStyle: 'normal' } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { underline: false } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { strike: false } });
});
