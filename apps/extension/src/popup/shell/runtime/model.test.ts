import { describe, expect, it } from 'vitest';

import { isRecordingActive, resolveSelectedPreset, shouldShowFooter } from './model';

describe('popup view model', () => {
  it('resolves the selected preset or null', () => {
    const presets = [
      { id: 'desktop', label: 'Desktop' },
      { id: 'mobile', label: 'Mobile' },
    ] as never;

    expect(resolveSelectedPreset(presets, 'mobile')).toEqual({ id: 'mobile', label: 'Mobile' });
    expect(resolveSelectedPreset(presets, 'missing')).toBeNull();
  });

  it('detects active recording state and footer visibility', () => {
    expect(isRecordingActive({ status: 'IDLE' } as never)).toBe(false);
    expect(isRecordingActive({ status: 'RECORDING' } as never)).toBe(true);
    expect(shouldShowFooter('home' as never, { status: 'IDLE' } as never)).toBe(true);
    expect(shouldShowFooter('home' as never, { status: 'PAUSED' } as never)).toBe(false);
    expect(shouldShowFooter('settings' as never, { status: 'IDLE' } as never)).toBe(false);
  });
});
