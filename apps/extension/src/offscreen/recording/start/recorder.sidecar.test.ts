import { expect, it } from 'vitest';
import { buildSidecarFilename } from '../finalizer';

it('builds a stable container-aware sidecar filename before staging opens', () => {
  expect(buildSidecarFilename('webcam', 'video/webm')).toMatch(/^Sniptale-.*-webcam\.webm$/);
  expect(buildSidecarFilename('webcam', 'video/mp4')).toMatch(/^Sniptale-.*-webcam\.mp4$/);
});
