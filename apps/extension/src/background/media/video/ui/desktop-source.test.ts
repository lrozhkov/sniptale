import { expect, it, vi } from 'vitest';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';
import { createDesktopMediaSourceChooser } from './desktop-source';

it('selects window sources through the extension-scoped desktopCapture picker', async () => {
  const chooseDesktopMedia = vi.fn().mockResolvedValue({
    status: 'selected',
    selection: { label: 'Native Window', streamId: 'desktop-native' },
  });
  const chooseSource = createDesktopMediaSourceChooser({
    desktopCapture: { chooseDesktopMedia },
  });

  await expect(chooseSource(CaptureMode.SCREEN)).resolves.toEqual({
    status: 'selected',
    selection: {
      label: 'Native Window',
      streamId: 'desktop-native',
    },
  });
  expect(chooseDesktopMedia).toHaveBeenCalledWith({ sources: ['window'] });
});

it('resolves null when desktopCapture selection is cancelled', async () => {
  const chooseSource = createDesktopMediaSourceChooser({
    desktopCapture: { chooseDesktopMedia: vi.fn().mockResolvedValue({ status: 'cancelled' }) },
  });

  await expect(chooseSource(CaptureMode.SCREEN)).resolves.toEqual({ status: 'cancelled' });
});

it('resolves failed when desktopCapture reports a runtime error', async () => {
  const chooseSource = createDesktopMediaSourceChooser({
    desktopCapture: {
      chooseDesktopMedia: vi.fn().mockResolvedValue({ error: 'blocked', status: 'failed' }),
    },
  });

  await expect(chooseSource(CaptureMode.SCREEN)).resolves.toEqual({
    error: 'blocked',
    status: 'failed',
  });
});
