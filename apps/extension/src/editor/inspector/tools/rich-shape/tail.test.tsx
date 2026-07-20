// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createDefaultRichShapeCalloutGeometry,
  createDefaultRichShapeObject,
} from '../../../../features/editor/document/rich-shape';
import { RichShapeTailSection } from './tail';
import type { RichShapeControlsProps } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(): RichShapeControlsProps {
  const frame = { height: 100, left: 0, top: 0, width: 180 };
  return {
    applyRichShapePatch: vi.fn(),
    arrangeSelection: vi.fn(),
    capabilities: ['line', 'fill', 'text'],
    recentColors: [],
    roughCapable: true,
    shape: createDefaultRichShapeObject({
      callout: createDefaultRichShapeCalloutGeometry(frame, 'left'),
      frame,
      shapeFamily: 'callout',
      shapeKind: 'dynamic-callout',
    }),
    shapeFillPalette: [],
    shapeStrokePalette: [],
    textColorPalette: [],
    toNumber: Number,
    updateColor: (setter, color) => setter(color),
  };
}

function renderTailSection(props: RichShapeControlsProps) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(<RichShapeTailSection {...props} compact />));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

it('routes callout tail side and reset actions through compact controls', () => {
  const props = createProps();
  renderTailSection(props);

  expect(
    container?.querySelector('[data-ui="shared.ui.compact-inspector.toggle-grid"]')
  ).not.toBeNull();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('button[aria-label="editor.compact.richShapeTailRight"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('button[aria-label="editor.compact.richShapeTailReset"]')
      ?.click();
  });

  expect(props.applyRichShapePatch).toHaveBeenCalledTimes(2);
});

it('renders nothing for shapes without dynamic callout tails', () => {
  const props = createProps();
  props.shape = createDefaultRichShapeObject();
  renderTailSection(props);

  expect(container?.textContent).toBe('');
});
