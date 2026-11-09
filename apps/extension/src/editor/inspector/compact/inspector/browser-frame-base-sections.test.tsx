import type React from 'react';
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
  const control = commands[0]!.content as React.ReactElement<{
    syncBrowserFrame: typeof params.syncBrowserFrame;
  }>;

  expect(commands.map((command) => command.id)).toEqual(['browser-frame-composition']);
  expect(control.props.syncBrowserFrame).toBe(params.syncBrowserFrame);
  control.props.syncBrowserFrame({ canvasMode: 'keep-size', contentMode: 'fit-content' });

  await Promise.resolve();
  await Promise.resolve();

  expect(insertOrUpdateBrowserFrame).not.toHaveBeenCalled();
  expect(params.syncBrowserFrame).toHaveBeenCalledWith({
    canvasMode: 'keep-size',
    contentMode: 'fit-content',
  });
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
});
