import { expect, it, vi } from 'vitest';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildBrowserFrameBaseCommands } from './browser-frame-base-sections';

it('builds browser-frame base commands and routes async updates', async () => {
  const insertOrUpdateBrowserFrame = vi.fn();
  const params = {
    ...createInspectorCommandParams(),
    browserFrame: { ...createInspectorCommandParams().browserFrame, enabled: true },
    insertOrUpdateBrowserFrame,
  };
  const commands = buildBrowserFrameBaseCommands(params as never);
  const canvasControl = (commands[0]!.content as any).props.children;
  const contentControl = (commands[1]!.content as any).props.children;

  expect(commands.map((command) => command.id)).toEqual([
    'browser-frame-canvas-mode',
    'browser-frame-content-mode',
  ]);
  expect(canvasControl.type.name).toBe('SelectField');
  expect(contentControl.type.name).toBe('SelectField');

  canvasControl.props.onChange('keep-size');
  contentControl.props.onChange('fit-content');

  await Promise.resolve();
  await Promise.resolve();

  expect(insertOrUpdateBrowserFrame).not.toHaveBeenCalled();
  expect(params.syncBrowserFrame).toHaveBeenCalledWith({ canvasMode: 'keep-size' });
  expect(params.syncBrowserFrame).toHaveBeenCalledWith({ contentMode: 'fit-content' });
});

it('renders alternate canvas and content labels for the non-resize branch', () => {
  const fixture = createInspectorCommandParams();
  const params = { ...fixture, browserFrame: { ...fixture.browserFrame, enabled: true } };
  const defaultCommands = buildBrowserFrameBaseCommands(params as never);
  const adjustedParams = {
    ...params,
    browserFrame: {
      ...params.browserFrame,
      canvasMode: 'keep-size',
      contentMode: 'fit-content',
    },
  };

  const commands = buildBrowserFrameBaseCommands(adjustedParams as never);

  expect(commands[0]?.value).not.toBe(defaultCommands[0]?.value);
  expect(commands[1]?.value).not.toBe(defaultCommands[1]?.value);
});
