import { expect, it } from 'vitest';

import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildBrowserFrameDetailCommands } from './browser-frame-details';

it('builds browser-frame detail commands and routes preset, title, and url updates', async () => {
  const params = createInspectorCommandParams();
  const commands = buildBrowserFrameDetailCommands(params as never);
  const titleInput = (commands[1]?.content as any).props.children;
  const urlInput = (commands[2]?.content as any).props.children;

  expect(commands.map((command) => command.id)).toEqual([
    'browser-frame-preset',
    'browser-frame-title',
    'browser-frame-url',
  ]);
  expect(commands[0]?.value).toBe('Chrome / Windows 11 light');
  expect(commands[1]?.value).toEqual(expect.any(String));
  expect(commands[2]?.value).toEqual(expect.any(String));
  expect((commands[1]?.content as any).props.hideLabel).toBe(true);
  expect(titleInput.props.label).toBe(commands[1]?.title);
  expect(urlInput.props.label).toBe(commands[2]?.title);

  titleInput.props.onChange({
    currentTarget: { value: 'New title' },
  });
  urlInput.props.onChange({
    currentTarget: { value: 'https://example.test' },
  });

  await Promise.resolve();
  await Promise.resolve();

  expect(params.syncBrowserFrame).toHaveBeenCalledWith({ title: 'New title' });
  expect(params.syncBrowserFrame).toHaveBeenCalledWith({ url: 'https://example.test' });
});
