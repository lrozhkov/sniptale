import { expect, it } from 'vitest';

import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildFrameSurfaceCommands } from './frame-surface-details';

it('renders frame surface commands with explicit background and padding summaries', () => {
  const params = createInspectorCommandParams();
  const commands = buildFrameSurfaceCommands(params as never);

  expect(commands.map((command) => command.id)).toEqual([
    'frame-background-fill',
    'frame-padding',
    'frame-apply',
  ]);
  expect(commands[0]?.value).toBe(params.backgroundSummary);
  expect(commands[1]?.value).toBe(params.framePaddingSummary);
});
