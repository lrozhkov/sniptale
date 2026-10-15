import type { ReactElement } from 'react';
import { expect, it } from 'vitest';
import { buildBrowserFrameDetailCommands } from './browser-frame-details';
import { EditorWindowHeaderSettings } from '../../environment/browser-frame';
import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';

it('uses the same layer-aware window-header controls in compact mode', () => {
  const params = createInspectorCommandParams();
  const commands = buildBrowserFrameDetailCommands(params as never);
  const content = commands[0]!.content as ReactElement;
  expect(content.type).toBe(EditorWindowHeaderSettings);
  expect(content.props).toMatchObject({
    browserFrame: params.browserFrame,
    syncBrowserFrame: params.syncBrowserFrame,
  });
});
