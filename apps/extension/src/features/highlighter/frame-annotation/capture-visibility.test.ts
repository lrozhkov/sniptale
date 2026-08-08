import { describe, expect, it } from 'vitest';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../style/defaults';
import {
  isFrameHiddenDuringCapture,
  setBorderHiddenDuringCapture,
  setFrameHiddenDuringCapture,
} from './capture-visibility';

describe('frame annotation capture visibility', () => {
  it('migrates missing capture defaults to visible and updates an isolated applied snapshot', () => {
    const settings = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);
    const legacy = { ...settings };
    delete legacy.effects;
    const updated = setBorderHiddenDuringCapture(legacy, true);

    expect(updated.effects?.capture).toEqual({ hideFrame: true });
    expect(settings.effects?.capture).toEqual({ hideFrame: false });
  });

  it('changes only capture decoration visibility and preserves frame geometry', () => {
    const frame = { id: 'frame-1', x: 10, y: 20, width: 120, height: 60 };
    const updated = setFrameHiddenDuringCapture(frame, true);

    expect(updated).toMatchObject(frame);
    expect(isFrameHiddenDuringCapture(updated)).toBe(true);
  });
});
