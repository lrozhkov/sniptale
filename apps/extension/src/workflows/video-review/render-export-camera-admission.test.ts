import { expect, it } from 'vitest';
import { createCameraFollowSettings } from '../../features/video/project/camera/cursor-policy';
import { createQuickEditZoomRegion } from '../../features/video/review/advanced/zoom';
import { state, argsFixture } from './render-export.test-support';
import { writeReviewFrames } from './render-export';

it.each([false, true])(
  'rejects a direct follow export before decoder/writer effects when source geometry is known=%s',
  async (known) => {
    const args = argsFixture();
    args.advanced.zoom.enabled = true;
    args.advanced.ui.tracks.zoom = true;
    args.advanced.cameraFollowDefaults = createCameraFollowSettings('calm');
    args.advanced.cursorFocusPath = {
      version: 1,
      mode: 'follow',
      smoothing: 0,
      sensitivity: 0.5,
      gapPolicy: 'hold',
      segments: [],
    };
    args.advanced.zoom.regions = [
      {
        ...createQuickEditZoomRegion({ id: 'conflict', at: 0, duration: 2, endMax: 2 }),
        followCursor: true,
        transform: { scale: 4, centerX: 0.5, centerY: 0.5 },
        enter: { type: 'ease-in-out', duration: 0.01 },
        exit: { type: 'none', duration: 0 },
      },
    ];
    const before = structuredClone(args.advanced);
    const drawn = state.drawn.length,
      encoded = state.encoded.length;
    await expect(
      writeReviewFrames({
        ...args,
        index: { ...args.index, ...(known ? { width: 320, height: 180 } : {}) },
      })
    ).rejects.toMatchObject({
      reasons: ['camera-follow'],
      cameraConflicts: [
        expect.objectContaining({ regionId: 'conflict', reason: known ? 'dynamics' : 'unproven' }),
      ],
    });
    expect(state.drawn).toHaveLength(drawn);
    expect(state.encoded).toHaveLength(encoded);
    expect(args.writer.writeAt).not.toHaveBeenCalled();
    expect(args.readProjectAsset).not.toHaveBeenCalled();
    expect(args.advanced).toEqual(before);
  }
);
