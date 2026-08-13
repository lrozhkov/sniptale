import { describe, expect, it } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createSystemViewportPresetCatalog } from './catalog';
import { resolveVideoViewportPresetId } from './video-recording-policy';

describe('video window-size preset policy', () => {
  it('keeps an existing window preset for tab and cropped-tab recording', () => {
    const presets = createSystemViewportPresetCatalog();
    const id = presets[0]!.id;
    expect(resolveVideoViewportPresetId(CaptureMode.TAB, presets, id)).toBe(id);
    expect(resolveVideoViewportPresetId(CaptureMode.TAB_CROP, presets, id)).toBe(id);
    expect(resolveVideoViewportPresetId(CaptureMode.TAB, presets, 'missing')).toBeNull();
  });
});
