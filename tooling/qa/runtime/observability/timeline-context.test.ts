import { expect, it } from 'vitest';

import {
  runTimelineActivity,
  runTimelineActivitySync,
  withObservabilityTimeline,
} from './timeline-context.mjs';

function recorder() {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    session: {
      recordActivityTransition(event: Record<string, unknown>) {
        events.push(event);
      },
    },
  };
}

it('projects canonical array and process outcomes into terminal activity states', async () => {
  const { events, session } = recorder();
  await withObservabilityTimeline(session, async () => {
    await runTimelineActivity(
      { activityId: 'audit-profile.release', kind: 'audit-profile' },
      () => [{ status: 'ok' }, { status: 'failed' }]
    );
    runTimelineActivitySync({ activityId: 'release-archive', kind: 'release-archive' }, () => ({
      status: 1,
    }));
  });

  expect(events).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ activityId: 'audit-profile.release', state: 'failed' }),
      expect.objectContaining({ activityId: 'release-archive', state: 'failed' }),
    ])
  );
});
