import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_IMAGE_SETTINGS } from '../../../../features/editor/document/constants';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildImageCompactCommands } from './image';

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
