// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createFrameDataFixture } from '../../../selection/frame-runtime/test-support';
import { captureFrameSessionSnapshot } from './frame-session';
import { DEFAULT_BORDER_PRESET } from '../../../../features/highlighter/style/defaults';
import { createDefaultCalloutSettings } from '../../../selection/callout/model';

describe('captureFrameSessionSnapshot', () => {
  it('deep-clones manual callout placement and free page placement', () => {
    const frame = createFrameDataFixture('free-frame', {
      callout: {
        ...createDefaultCalloutSettings(),
        content: { bodyHtml: 'Comment', titleText: '' },
        placement: {
          anchor: 'top-center',
          manualPlacement: { centerOffsetX: 80, centerOffsetY: -40 },
          side: 'auto',
        },
      },
      pagePlacement: { iframePath: ['iframe#content'], pageX: 120, pageY: 240 },
      stepBadge: {
        enabled: true,
        manualPlacement: { position: 0.72, side: 'bottom' },
        type: 'number',
        value: '3',
      },
    });
    const snapshot = captureFrameSessionSnapshot({
      frames: [frame],
      globalEffectMode: 'border',
      globalStepBadgeSettings: { autoMode: true },
      sessionBorderPreset: DEFAULT_BORDER_PRESET,
      sessionBlurSettings: { amount: 10, blurType: 'gaussian', showBorder: true },
      sessionCalloutStyle: null,
      sessionFocusSettings: { opacity: 0.4, showBorder: false },
      sessionStepBadgeTemplate: null,
      stepBadgeOrder: new Map(),
    });
    const saved = snapshot.frames[0]!;

    expect(snapshot.sessionBorderPreset).not.toBe(DEFAULT_BORDER_PRESET);
    expect(snapshot.sessionBorderPreset.padding).not.toBe(DEFAULT_BORDER_PRESET.padding);
    expect(saved.callout?.placement.manualPlacement).not.toBe(
      frame.callout?.placement.manualPlacement
    );
    expect(saved.pagePlacement).not.toBe(frame.pagePlacement);
    expect(saved.pagePlacement?.iframePath).not.toBe(frame.pagePlacement?.iframePath);
    expect(saved.stepBadge?.manualPlacement).not.toBe(frame.stepBadge?.manualPlacement);
    expect(saved).toMatchObject({
      callout: { placement: { manualPlacement: { centerOffsetX: 80, centerOffsetY: -40 } } },
      pagePlacement: { iframePath: ['iframe#content'], pageX: 120, pageY: 240 },
      stepBadge: { manualPlacement: { position: 0.72, side: 'bottom' } },
    });
  });
});
