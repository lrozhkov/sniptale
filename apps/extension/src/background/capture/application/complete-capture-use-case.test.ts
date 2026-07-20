import { describe, expect, it, vi } from 'vitest';

import {
  completeCaptureForCropUseCase,
  downloadCapturedImageUseCase,
} from './complete-capture-use-case';
import type { CompleteCapturePorts, DownloadCapturePorts } from './ports';
import type { Settings } from '../../../contracts/settings';

function createSettings(): Settings {
  return { imageFormat: 'jpeg' } as Settings;
}

describe('complete capture use case', () => {
  it('returns crop data and marks capture jobs completed', async () => {
    const ports: CompleteCapturePorts = {
      transitionCaptureJob: vi.fn(async () => undefined),
    };

    await expect(
      completeCaptureForCropUseCase(
        {
          capture: () => Promise.resolve({ dataUrl: 'data:image/png;base64,crop', jobId: 'job-1' }),
        },
        ports
      )
    ).resolves.toEqual({ dataUrl: 'data:image/png;base64,crop' });

    expect(ports.transitionCaptureJob).toHaveBeenCalledWith('job-1', 'completed');
  });

  it('downloads completed captures through injected ports', async () => {
    const ports: DownloadCapturePorts = {
      downloadImageInServiceWorker: vi.fn(async () => undefined),
      generateFilename: vi.fn(() => 'full.jpeg'),
      loadSettings: vi.fn(async () => createSettings()),
    };

    await downloadCapturedImageUseCase(
      {
        captureJobId: 'job-2',
        dataUrl: 'data:image/jpeg;base64,full',
        mode: 'full',
      },
      ports
    );

    expect(ports.generateFilename).toHaveBeenCalledWith('full', 'jpeg');
    expect(ports.downloadImageInServiceWorker).toHaveBeenCalledWith(
      'data:image/jpeg;base64,full',
      'full.jpeg',
      'job-2'
    );
  });
});
