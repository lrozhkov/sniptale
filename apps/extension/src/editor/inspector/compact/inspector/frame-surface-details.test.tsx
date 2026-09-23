import { expect, it } from 'vitest';

import { createInspectorCommandParams } from '../../../../../../../tooling/test/harness/editor/ownership/fixtures';
import { buildFrameSurfaceCommands } from './frame-surface-details';

it('renders frame surface commands with explicit background and padding summaries', () => {
  const lastFillModeRef = { current: 'gradient' as const };
  const params = { ...createInspectorCommandParams(), lastFillModeRef };
  const commands = buildFrameSurfaceCommands(params as never);

  expect(commands.map((command) => command.id)).toEqual([
    'frame-background-fill',
    'frame-padding',
    'frame-apply',
  ]);
  expect(commands[0]?.value).toBe(params.backgroundSummary);
  expect(commands[1]?.value).toBe(params.framePaddingSummary);
  const backgroundControls = ((commands[0]!.content as any).props.children as any).props.children;
  expect(backgroundControls[0].type.name).toBe('EditorInspectorFrameBackgroundModeControl');
  expect(backgroundControls[0].props.lastFillModeRef).toBe(lastFillModeRef);
  backgroundControls[0].props.setBackgroundMode('image');
  expect(params.setFrameDraft).toHaveBeenCalledTimes(1);
});
