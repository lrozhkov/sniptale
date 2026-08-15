import { describe, expect, it } from 'vitest';
import { createDefaultFrameCallout } from '../defaults';
import type { FrameAnnotationVisualState } from '../model';
import {
  appendFrameCallout,
  canAppendFrameCallout,
  getFrameCallout,
  getFrameCallouts,
  MAX_FRAME_CALLOUTS,
  removeFrameCallout,
  setFrameCallout,
} from './collection';

function frame(): FrameAnnotationVisualState {
  return {
    id: 'frame-1',
    x: 10,
    y: 20,
    width: 200,
    height: 100,
    callout: createDefaultFrameCallout(),
  };
}

describe('frame callout collection', () => {
  it('appends independent empty callouts on unoccupied anchors and caps the collection at five', () => {
    let current = frame();
    expect(canAppendFrameCallout(current)).toBe(true);
    for (let index = 1; index < MAX_FRAME_CALLOUTS; index += 1) {
      const appended = appendFrameCallout(current, createDefaultFrameCallout());
      expect(appended?.calloutIndex).toBe(index);
      current = appended!.frame;
    }

    const callouts = getFrameCallouts(current);
    expect(callouts).toHaveLength(MAX_FRAME_CALLOUTS);
    expect(new Set(callouts.map((callout) => callout.placement.anchor)).size).toBe(
      MAX_FRAME_CALLOUTS
    );
    expect(callouts.slice(1).every((callout) => callout.content.bodyHtml === '')).toBe(true);
    expect(new Set(callouts.slice(1).map((callout) => callout.instanceId)).size).toBe(4);
    expect(callouts[1]?.placement).toMatchObject({ anchor: 'bottom-center', side: 'auto' });
    expect(appendFrameCallout(current, createDefaultFrameCallout())).toBeNull();
    expect(canAppendFrameCallout(current)).toBe(false);
  });

  it('updates and removes only the addressed additional callout', () => {
    const first = appendFrameCallout(frame(), createDefaultFrameCallout())!;
    const second = appendFrameCallout(first.frame, createDefaultFrameCallout())!;
    const updated = setFrameCallout(second.frame, 1, {
      ...getFrameCallout(second.frame, 1)!,
      content: { bodyHtml: '<p>First extra</p>', titleText: '' },
    });

    expect(getFrameCallout(updated, 1)?.content.bodyHtml).toBe('<p>First extra</p>');
    expect(getFrameCallout(updated, 2)?.content.bodyHtml).toBe('');
    const removed = removeFrameCallout(updated, 1);
    expect(removed.callout?.enabled).toBe(true);
    expect(removed.additionalCallouts).toHaveLength(1);
    expect(removed.additionalCallouts?.[0]?.instanceId).toBe(
      getFrameCallout(second.frame, 2)?.instanceId
    );
  });

  it('preserves the primary slot when an extra callout is added before the primary is enabled', () => {
    const withoutPrimary = frame();
    delete withoutPrimary.callout;

    const appended = appendFrameCallout(withoutPrimary, createDefaultFrameCallout())!;

    expect(appended.calloutIndex).toBe(1);
    expect(appended.frame.callout?.enabled).toBe(false);
    expect(getFrameCallout(appended.frame, 1)?.enabled).toBe(true);
  });
});
