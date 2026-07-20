import { expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildBrowserFrameBaseCommands } from './browser-frame-base-sections';

it('builds browser-frame base commands and routes async updates', async () => {
  const insertOrUpdateBrowserFrame = vi.fn();
  const params = {
    ...createInspectorCommandParams(),
    insertOrUpdateBrowserFrame,
  };
  const commands = buildBrowserFrameBaseCommands(params as never);
  const canvasControl = (commands[1]?.content as any).props.children;
  const contentControl = (commands[2]?.content as any).props.children;

  expect(commands.map((command) => command.id)).toEqual([
    'browser-frame-action',
    'browser-frame-canvas-mode',
    'browser-frame-content-mode',
  ]);
  expect(canvasControl.type.name).toBe('SelectField');
  expect(contentControl.type.name).toBe('SelectField');

  commands[0]?.onClick?.();
  canvasControl.props.onChange('keep-size');
  contentControl.props.onChange('fit-content');

  await Promise.resolve();
  await Promise.resolve();

  expect(insertOrUpdateBrowserFrame).toHaveBeenCalledOnce();
  expect(params.syncBrowserFrame).toHaveBeenCalledWith({ canvasMode: 'keep-size' });
  expect(params.syncBrowserFrame).toHaveBeenCalledWith({ contentMode: 'fit-content' });
});

it('renders alternate canvas and content labels for the non-resize branch', () => {
  const defaultCommands = buildBrowserFrameBaseCommands(createInspectorCommandParams() as never);
  const params = createInspectorCommandParams();
  const adjustedParams = {
    ...params,
    browserFrame: {
      ...params.browserFrame,
      canvasMode: 'keep-size',
      contentMode: 'fit-content',
    },
  };

  const commands = buildBrowserFrameBaseCommands(adjustedParams as never);

  expect(commands[1]?.value).not.toBe(defaultCommands[1]?.value);
  expect(commands[2]?.value).not.toBe(defaultCommands[2]?.value);
});
