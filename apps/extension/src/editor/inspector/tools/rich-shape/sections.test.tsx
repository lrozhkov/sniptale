// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import { RichShapeEffectsSection } from './effects';
import { RichShapeFillSection } from './fill';
import { RichShapeLineSection } from './line';
import { RichShapeTextSection } from './text';
import type { RichShapeControlsProps } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: vi.fn(),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderNode(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<>{node}</>);
  });
}

function createProps(overrides: Partial<RichShapeControlsProps> = {}): RichShapeControlsProps {
  return {
    applyRichShapePatch: vi.fn(),
    arrangeSelection: vi.fn(),
    capabilities: ['fill', 'line', 'text', 'effects'],
    recentColors: [],
    roughCapable: true,
    shape: createDefaultRichShapeObject(),
    shapeFillPalette: ['#ffffff'],
    shapeStrokePalette: ['#111827'],
    textColorPalette: ['#111827'],
    toNumber: (value, fallback = 0) => Number(value) || fallback,
    updateColor: (setter, value) => setter(value),
    ...overrides,
  };
}
function input(label: string, index = 0) {
  const element = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)
  )[index];
  if (!element) {
    throw new Error(`Missing input ${label}`);
  }
  return element;
}
function change(label: string, value: string, index = 0) {
  const element = input(label, index);
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
}
function clickByLabel(label: string, index = 0) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(
    (candidate) => candidate.ariaLabel === label || candidate.textContent === label
  )[index];
  if (!button) {
    throw new Error(`Missing button ${label}`);
  }
  button.click();
}
function clickContainingText(text: string) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (candidate) => candidate.textContent?.includes(text)
  );
  if (!button) {
    throw new Error(`Missing button containing ${text}`);
  }
  button.click();
}
function selectOptionAt(label: string, index: number) {
  act(() => clickByLabel(label));
  const option = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]'))[index];
  if (!option) {
    throw new Error(`Missing option ${index} for ${label}`);
  }
  act(() => option.click());
}

function createLineTextEffectsProps() {
  return createProps({
    capabilities: ['fill', 'line', 'text', 'effects', 'connectors'],
    shape: createDefaultRichShapeObject({
      effects: {
        ...createDefaultRichShapeObject().effects,
        reflection: { enabled: false, opacity: 0, distance: 0, size: 0 },
      },
      shapeFamily: 'line',
    }),
  });
}
function renderLineTextEffects(props: RichShapeControlsProps) {
  renderNode(
    <>
      <RichShapeLineSection {...props} />
      <RichShapeTextSection {...props} />
      <RichShapeEffectsSection {...props} />
    </>
  );
}
function editLineTextEffects() {
  act(() => change('editor.compact.strokeWidth', '9'));
  selectOptionAt('editor.compact.richShapeLineCap', 1);
  selectOptionAt('editor.compact.richShapeLineJoin', 2);
  selectOptionAt('editor.compact.richShapeBeginArrowhead', 1);
  selectOptionAt('editor.compact.richShapeEndArrowhead', 4);
  act(() => clickByLabel('editor.compact.textAlignRight'));
  act(() => clickByLabel('editor.compact.verticalAlignBottom'));
  act(() => clickContainingText('editor.compact.enabledShort'));
  act(() => clickContainingText('highlighter.editor.shadowLabel'));
  act(() => change('editor.compact.richShapeSize', '25'));
  act(() => clickContainingText('editor.compact.richShapeReflection'));
  act(() => change('editor.compact.richShapeTransparency', '40', 1));
}

function expectLineTextEffectsPatches(props: RichShapeControlsProps) {
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ style: { line: { width: 9 } } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ style: { line: { cap: 'round' } } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ style: { line: { join: 'bevel' } } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    style: { line: { beginArrowhead: 'triangle' } },
  });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    style: { line: { endArrowhead: 'diamond' } },
  });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { horizontalAlign: 'right' } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { verticalAlign: 'bottom' } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    rough: { enabled: true, preserveVertices: false },
  });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    effects: { shadow: { enabled: true, opacity: 0.25 } },
  });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    effects: { reflection: { enabled: true, opacity: 0.4 } },
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
  vi.unstubAllGlobals();
});

it('covers fill transparency recovery and gradient stop editing', () => {
  const solidProps = createProps({
    shape: createDefaultRichShapeObject({
      style: { ...createDefaultRichShapeObject().style, fillTransparency: 1 },
    }),
  });
  renderNode(<RichShapeFillSection {...solidProps} />);
  act(() => change('editor.compact.richShapeTransparency', '50'));
  expect(solidProps.applyRichShapePatch).toHaveBeenCalledWith({ style: { fillTransparency: 0.5 } });
  cleanup();

  const gradientProps = createProps({
    shape: createDefaultRichShapeObject({
      style: {
        ...createDefaultRichShapeObject().style,
        fill: {
          type: 'gradient',
          gradientType: 'linear',
          angle: 90,
          stops: [
            { color: '#ffffff', offset: 0, transparency: 0 },
            { color: '#000000', offset: 1, transparency: 0 },
          ],
        },
      },
    }),
  });
  renderNode(<RichShapeFillSection {...gradientProps} />);
  act(() => clickByLabel('editor.gradient.addStop'));
  act(() => clickByLabel('editor.gradient.reverseStops'));
  act(() => change('editor.gradient.opacity', '25'));
  act(() => change('editor.gradient.angle', '135'));

  expect(gradientProps.applyRichShapePatch).toHaveBeenCalledWith(
    expect.objectContaining({ style: expect.objectContaining({ fill: expect.any(Object) }) })
  );
});

it('covers line endings, text alignment, and effect values', () => {
  const props = createLineTextEffectsProps();

  renderLineTextEffects(props);
  editLineTextEffects();

  expectLineTextEffectsPatches(props);
});

it('hides rough line controls for non-rough-capable disabled shapes', () => {
  renderNode(<RichShapeLineSection {...createProps({ roughCapable: false })} />);

  expect(document.querySelector('[aria-label="editor.compact.richShapeRoughness"]')).toBeNull();
});

it('covers text fallback alignment, font options, and inset number controls', () => {
  const props = createProps({
    shape: createDefaultRichShapeObject({
      text: {
        ...createDefaultRichShapeObject().text,
        content: 'Body',
        fontFamily: 'mono',
        horizontalAlign: 'justify',
      },
    }),
  });
  renderNode(<RichShapeTextSection {...props} />);

  expect(
    document
      .querySelector<HTMLButtonElement>('[aria-label="editor.compact.textAlignLeft"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');
  selectOptionAt('editor.compact.font', 1);
  act(() => change('editor.compact.fontSize', '24'));
  act(() => change('editor.compact.richShapeInsetTopShort', '12'));

  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { fontFamily: 'serif' } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { fontSize: 24 } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { insets: { top: 12 } } });
});

it('covers enabled shadow and reflection numeric controls', () => {
  const props = createProps({
    shape: createDefaultRichShapeObject({
      effects: {
        ...createDefaultRichShapeObject().effects,
        shadow: {
          angle: 30,
          blur: 4,
          color: '#000000',
          distance: 6,
          enabled: true,
          opacity: 0.5,
        },
        reflection: { enabled: true, opacity: 0.35, distance: 2, size: 0.25 },
      },
    }),
  });
  renderNode(<RichShapeEffectsSection {...props} />);

  act(() => clickContainingText('highlighter.editor.shadowLabel'));
  act(() => clickContainingText('editor.compact.richShapeReflection'));
  act(() => change('editor.compact.richShapeSize', '20', 0));
  act(() => change('editor.compact.richShapeGradientAngle', '45'));
  act(() => change('editor.compact.richShapeBlur', '8'));
  act(() => change('editor.compact.richShapeTransparency', '80', 0));

  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    effects: { shadow: { enabled: true, opacity: 0.2 } },
  });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ effects: { shadow: { angle: 45 } } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({ effects: { shadow: { blur: 8 } } });
  expect(props.applyRichShapePatch).toHaveBeenCalledWith({
    effects: { reflection: { enabled: true, opacity: 0.8 } },
  });
});

it('renders rich shape fill, line, and text sections in compact titleless mode', () => {
  renderNode(
    <>
      <RichShapeFillSection {...createProps()} compact />
      <RichShapeLineSection {...createProps()} compact />
      <RichShapeTextSection {...createProps()} compact />
    </>
  );

  expect(document.body.textContent).toContain('editor.compact.font');
  expect(document.body.textContent).toContain('editor.compact.strokeWidth');
  expect(document.body.textContent).toContain('editor.compact.richShapeTransparency');
});
function cleanup() {
  act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
}
