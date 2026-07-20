// @vitest-environment jsdom

import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultRichShapeObject } from '../../../../features/editor/document/rich-shape';
import {
  cleanupDom,
  createControllerMock,
  renderWithController,
} from '../../../../../../../tooling/test/harness/editor/ownership/helpers';
import {
  createInspectorCommandParams,
  createToolsPanelProps,
} from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { EditorInspectorToolsPanel } from '../panel';

vi.mock('../../../../platform/i18n', async () => {
  const actual = await vi.importActual<typeof import('../../../../platform/i18n')>(
    '../../../../platform/i18n'
  );
  return { ...actual, translate: (key: string) => key, useAppLocale: vi.fn() };
});

function renderGradientState() {
  const richShapeSelection = createDefaultRichShapeObject({
    effects: {
      ...createDefaultRichShapeObject().effects,
      reflection: { enabled: true, distance: 8, opacity: 0.45, size: 0.5 },
      shadow: { ...createDefaultRichShapeObject().effects.shadow, enabled: true, opacity: 0.35 },
    },
    shapeKind: 'rectangle',
    source: {
      formatVersion: '1',
      importedAt: null,
      itemId: 'rectangle',
      libraryId: null,
      name: 'Rectangle',
      type: 'built-in',
    },
    style: {
      ...createDefaultRichShapeObject().style,
      fill: {
        type: 'gradient',
        gradientType: 'linear',
        angle: 15,
        stops: [
          { color: '#ffffff', offset: 0, transparency: 0 },
          { color: '#111111', offset: 1, transparency: 0.2 },
        ],
      },
    },
    text: { ...createDefaultRichShapeObject().text, fontFamily: 'mono' },
  });
  const props = createToolsPanelProps({
    highlightedTool: 'rectangle',
    richShapeSelection,
    selection: {
      ...createInspectorCommandParams().selection,
      selectedObjectType: 'rich-shape',
    },
  });
  renderWithController(<EditorInspectorToolsPanel {...(props as any)} />, createControllerMock());
  return props;
}

function clickButtonWithText(text: string, index = 0) {
  Array.from(document.querySelectorAll('button'))
    .filter((button) => button.textContent === text)
    [index]?.click();
}

function clickSection(text: string) {
  Array.from(document.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'))
    .find((button) => button.textContent?.includes(text))
    ?.click();
}

function changeInput(label: string, value: string, index = 0) {
  const input = Array.from(
    document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
      `input[aria-label="${label}"], textarea[aria-label="${label}"]`
    )
  )[index];
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(input, value);
  input?.dispatchEvent(new Event('input', { bubbles: true }));
  input?.dispatchEvent(new Event('change', { bubbles: true }));
  input?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
}

describe('rich shape inspector selection state', () => {
  it('renders existing gradient and enabled effect state from selection sync', async () => {
    const props = renderGradientState();

    await act(async () => {
      changeInput('editor.gradient.angle', '60');
      clickButtonWithText('editor.compact.textAlignCenter');
      clickButtonWithText('editor.compact.verticalAlignBottom');
      changeInput('editor.compact.richShapeInsetLeftShort', '18');
    });
    await act(async () => {
      clickSection('highlighter.editor.shadowLabel');
    });
    await act(async () => {
      changeInput('editor.compact.richShapeSize', '0');
    });

    expect(props.applyRichShapePatch).toHaveBeenCalledWith(
      expect.objectContaining({
        style: expect.objectContaining({
          fill: expect.objectContaining({ angle: 60, type: 'gradient' }),
        }),
      })
    );
    expect(props.applyRichShapePatch).toHaveBeenCalledWith({
      effects: { shadow: { enabled: false, opacity: 0 } },
    });
    expect(props.applyRichShapePatch).toHaveBeenCalledWith({ text: { insets: { left: 18 } } });
    cleanupDom();
  });
});
