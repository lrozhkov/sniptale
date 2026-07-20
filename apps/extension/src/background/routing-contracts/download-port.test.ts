import { expect, it, vi } from 'vitest';
import { configureDownloadPort, executeDownloadBlob } from './download-port';

it('fails closed before runtime wiring installs the download owner', async () => {
  await expect(executeDownloadBlob(new Blob(['video']), 'clip.webm')).rejects.toThrow(
    'Background download port is not configured'
  );
});

it('delegates blob downloads to the installed owner', async () => {
  const execute = vi.fn().mockResolvedValue(17);
  configureDownloadPort({ executeDownloadBlob: execute });
  const blob = new Blob(['video'], { type: 'video/webm' });

  await expect(executeDownloadBlob(blob, 'clip.webm', 'preset-1')).resolves.toBe(17);

  expect(execute).toHaveBeenCalledWith(blob, 'clip.webm', 'preset-1');
});
