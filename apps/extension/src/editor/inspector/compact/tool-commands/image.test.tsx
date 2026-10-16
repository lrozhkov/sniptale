// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../../features/editor/document/constants';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildImageCompactCommands } from './image';
import { buildShadowCompactCommand } from './shadow';
import { translate } from '../../../../platform/i18n';

type FieldControlElement = React.ReactElement<{
  onChange?: (value: never) => void;
  onCommitValue?: (value: number) => void;
  onPreviewValue?: (value: number) => void;
}>;

function getFieldControl(command: ReturnType<typeof buildImageCompactCommands>[number]) {
  return (command.content as React.ReactElement<{ children: FieldControlElement }>).props.children;
}

it('builds image layer controls and routes slider previews through image settings', () => {
  const params = {
    ...createInspectorCommandParams(),
    applyImagePatch: vi.fn(),
    previewImagePatch: vi.fn(),
    commitPendingSelectionSettings: vi.fn(),
  };
  const commands = buildImageCompactCommands(params as never);

  expect(commands.map((command) => command.id)).toEqual([
    'image-opacity',
    'image-radius',
    'image-shadow',
    'image-stroke-width',
    'image-stroke-style',
    'image-stroke-color',
    'image-stroke-opacity',
  ]);
  expect(renderToStaticMarkup(<>{commands[0]!.trigger}</>)).toContain('span');
  expect(renderToStaticMarkup(<>{commands[1]!.trigger}</>)).toContain('span');
  expect(renderToStaticMarkup(<>{commands[4]!.content}</>)).toContain(
    'shared.ui.compact-inspector.select-field'
  );

  getFieldControl(commands[0]!).props.onPreviewValue?.(55);
  getFieldControl(commands[1]!).props.onPreviewValue?.(18);
  getFieldControl(commands[3]!).props.onPreviewValue?.(6);
  getFieldControl(commands[6]!).props.onPreviewValue?.(45);
  getFieldControl(commands[4]!).props.onChange?.('dot' as never);
  getFieldControl(commands[0]!).props.onCommitValue?.(55);

  expect(params.previewImagePatch).toHaveBeenCalledWith({ opacity: 0.55 });
  expect(params.previewImagePatch).toHaveBeenCalledWith({ radius: 18 });
  expect(params.previewImagePatch).toHaveBeenCalledWith({ strokeWidth: 6 });
  expect(params.previewImagePatch).toHaveBeenCalledWith({ strokeOpacity: 0.45 });
  expect(params.applyImagePatch).toHaveBeenCalledWith({ strokeStyle: 'dot' });
  expect(params.commitPendingSelectionSettings).toHaveBeenCalledOnce();
});

it('keeps image commands callable for legacy params without image patch handlers', () => {
  const params = createInspectorCommandParams();
  Reflect.deleteProperty(params, 'applyImagePatch');
  Reflect.deleteProperty(params, 'previewImagePatch');
  params.inspectorToolSettings.image = {
    ...params.inspectorToolSettings.image,
    shadow: 0,
    strokeStyle: 'long-dash',
  };
  Reflect.deleteProperty(params.inspectorToolSettings.image, 'shadowColor');
  const commands = buildImageCompactCommands(params as never);

  expect(() => {
    getFieldControl(commands[0]!).props.onPreviewValue?.(25);
    getFieldControl(commands[4]!).props.onChange?.('dash' as never);
  }).not.toThrow();
});

it('falls back to the default image shadow color instead of border color', () => {
  const params = createInspectorCommandParams();
  params.inspectorToolSettings.image = {
    ...params.inspectorToolSettings.image,
    shadow: 40,
    strokeColor: '#ff0000',
  };
  Reflect.deleteProperty(params.inspectorToolSettings.image, 'shadowColor');

  const commands = buildImageCompactCommands(params as never);
  const shadowTrigger = renderToStaticMarkup(<>{commands[2]!.trigger}</>);

  expect(shadowTrigger).toContain(
    `--editor-tabler-color-icon-color:${DEFAULT_EDITOR_IMAGE_SETTINGS.shadowColor}`
  );
  expect(shadowTrigger).not.toContain('--editor-tabler-color-icon-color:#ff0000');
});

it('edits shadow strength, direction, distance, blur and color through their native fields', () => {
  const previewPatch = vi.fn();
  const applyPatch = vi.fn();
  const commit = vi.fn();
  const updateColor = vi.fn((setter: (color: string) => void, color: string) => setter(color));
  const command = buildShadowCompactCommand({
    id: 'image-shadow',
    fallbackColor: '#475569',
    palette: ['#475569', '#123456'],
    params: {
      recentColors: [],
      commitPendingSelectionSettings: commit,
      updateColor,
      previewColor: (setter, color) => setter(color),
    },
    previewPatch,
    applyPatch,
    settings: { shadow: 35 },
  });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const setValue = (input: HTMLInputElement, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  try {
    act(() => root.render(command.content));
    for (const [key, patch, value] of [
      ['editor.compact.shadowSize', 'shadow', 42],
      ['editor.compact.shadowAngle', 'shadowAngle', 180],
      ['editor.compact.shadowDistance', 'shadowDistance', 9],
      ['editor.compact.shadowBlur', 'shadowBlur', 18],
    ] as const) {
      const input = [...host.querySelectorAll('input')].find(
        (node) => node.getAttribute('aria-label') === translate(key)
      )!;
      expect(input).toBeDefined();
      act(() => input.focus());
      act(() => setValue(input, String(value)));
      expect(previewPatch).not.toHaveBeenCalledWith({ [patch]: value });
      act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
      expect(previewPatch).toHaveBeenCalledWith({ [patch]: value });
    }
    expect(commit).toHaveBeenCalledTimes(4);
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    act(() => setValue(range, '50'));
    expect(previewPatch).toHaveBeenCalledWith({ shadow: 50 });
    expect(commit).toHaveBeenCalledTimes(4);
    act(() =>
      range.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }))
    );
    expect(commit).toHaveBeenCalledTimes(5);
    act(() =>
      host
        .querySelector<HTMLButtonElement>('[data-ui="shared.ui.color-selector.value-trigger"]')!
        .click()
    );
    const color = [...host.querySelectorAll('input')].find(
      (node) => node.getAttribute('aria-label') === translate('editor.compact.shadowColor')
    )!;
    act(() => setValue(color, '#123456'));
    act(() => color.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(updateColor).toHaveBeenCalled();
    expect(applyPatch).toHaveBeenCalledWith({ shadowColor: '#123456' });
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});

it('retains explicit shadow settings and a caller-provided trigger', () => {
  const command = buildShadowCompactCommand({
    id: 'shadow',
    icon: 'size',
    trigger: <span>Custom shadow</span>,
    fallbackColor: '#fff',
    palette: [],
    params: {
      recentColors: [],
      commitPendingSelectionSettings: vi.fn(),
      updateColor: vi.fn(),
      previewColor: vi.fn(),
    },
    applyPatch: vi.fn(),
    previewPatch: vi.fn(),
    settings: {
      shadow: 10,
      shadowAngle: 45,
      shadowDistance: 6,
      shadowBlur: 8,
      shadowColor: '#123456',
    },
  });
  expect(command.icon).toBe('size');
  expect(renderToStaticMarkup(<>{command.trigger}</>)).toContain('Custom shadow');
  const content = renderToStaticMarkup(<>{command.content}</>);
  for (const value of ['45', '6', '8']) expect(content).toContain(`value="${value}"`);
  expect(content).toContain('#123456');
});
