import { expect, it } from 'vitest';
import { VideoEditorPlacementModeKind } from './placement';
import { resolvePlacementModeAfterSelectionChange } from '../project/selection/placement';

it('ends point placement when the same captured event is selected in another clip', () => {
  const mode = {
    kind: VideoEditorPlacementModeKind.ACTION_POINT,
    eventId: 'captured',
    clipId: 'first',
  };
  expect(
    resolvePlacementModeAfterSelectionChange(
      {
        kind: 'action-occurrence',
        eventId: 'captured',
        clipId: 'repeat',
      },
      mode
    )
  ).toBeNull();
  expect(
    resolvePlacementModeAfterSelectionChange(
      {
        kind: 'action-occurrence',
        eventId: 'captured',
        clipId: 'first',
      },
      mode
    )
  ).toBe(mode);
});
