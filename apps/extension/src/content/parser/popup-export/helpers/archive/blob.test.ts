import { expect, it, vi } from 'vitest';

import { blobToBase64 } from './blob';

function installImmediateFileReader(base64 = 'ZmFrZS16aXA='): void {
  class ImmediateFileReader {
    result = `data:application/zip;base64,${base64}`;
    onerror: ((reason?: unknown) => void) | null = null;
    onloadend: (() => void) | null = null;

    readAsDataURL(): void {
      this.onloadend?.();
    }
  }

  vi.stubGlobal('FileReader', ImmediateFileReader);
}

function installResultOnlyFileReader(result: string | ArrayBuffer): void {
  class ResultOnlyFileReader {
    result = result;
    onerror: ((reason?: unknown) => void) | null = null;
    onloadend: (() => void) | null = null;

    readAsDataURL(): void {
      this.onloadend?.();
    }
  }

  vi.stubGlobal('FileReader', ResultOnlyFileReader);
}

function installErroringFileReader(error: unknown): void {
  class ErroringFileReader {
    result = '';
    onerror: ((reason?: unknown) => void) | null = null;
    onloadend: (() => void) | null = null;

    readAsDataURL(): void {
      this.onerror?.(error);
    }
  }

  vi.stubGlobal('FileReader', ErroringFileReader);
}

it('converts archive blobs to base64 payloads', async () => {
  installImmediateFileReader('cG9wdXAtZXhwb3J0');

  await expect(blobToBase64(new Blob(['zip'], { type: 'application/zip' }))).resolves.toBe(
    'cG9wdXAtZXhwb3J0'
  );
});

it('returns an empty string when the data url is missing or non-string', async () => {
  installResultOnlyFileReader('plain-text-without-comma');

  await expect(blobToBase64(new Blob(['zip'], { type: 'application/zip' }))).resolves.toBe('');

  installResultOnlyFileReader(new ArrayBuffer(8));

  await expect(blobToBase64(new Blob(['zip'], { type: 'application/zip' }))).resolves.toBe('');
});

it('rejects when FileReader reports an error', async () => {
  installErroringFileReader(new Error('reader failed'));

  await expect(blobToBase64(new Blob(['zip'], { type: 'application/zip' }))).rejects.toThrow(
    'reader failed'
  );
});
