import { describe, expect, it } from 'vitest';
import { getHumanReadableAction } from './action-text';

function createActionEvent(id: string) {
  return {
    id,
    kind: 'action',
    message: 'click button',
    recordingId: 'recording-1',
    tsMs: 1,
    data: {
      actionType: 'click',
      target: { tagName: 'button', text: `Button ${id}` },
    },
  } as const;
}

describe('getHumanReadableAction', () => {
  it('keeps the diagnostics action cache bounded while still formatting new entries', () => {
    for (let index = 0; index < 205; index += 1) {
      const event = createActionEvent(`event-${index}`);
      expect(getHumanReadableAction(event, () => '12:00')?.displayText).toContain(
        `Button event-${index}`
      );
    }

    expect(getHumanReadableAction(createActionEvent('event-204'), () => '12:00')).toEqual(
      expect.objectContaining({
        displayText: expect.stringContaining('Button event-204'),
      })
    );
  });
});
