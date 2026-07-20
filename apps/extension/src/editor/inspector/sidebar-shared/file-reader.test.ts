// @vitest-environment jsdom

import { expect, it, vi } from 'vitest';

import { readFileAsDataUrl, readFileAsText } from './file-reader';

class SuccessFileReader {
  error: DOMException | null = null;
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  result: string | null = null;

  readAsDataURL() {
    this.result = 'data:text/plain;base64,Zm9v';
    this.onload?.();
  }

  readAsText() {
    this.result = 'text-payload';
    this.onload?.();
  }
}

class EmptyFileReader extends SuccessFileReader {
  override readAsDataURL() {
    this.result = null;
    this.onload?.();
  }

  override readAsText() {
    this.result = null;
    this.onload?.();
  }
}

class ErrorFileReader {
  error = new DOMException('failed');
  onerror: (() => void) | null = null;
  onload: (() => void) | null = null;
  result: string | null = null;

  readAsDataURL() {
    this.onerror?.();
  }

  readAsText() {
    this.onerror?.();
  }
}

it('reads text and data-url payloads from successful file-reader events', async () => {
  vi.stubGlobal('FileReader', SuccessFileReader);
  await expect(readFileAsDataUrl(new File(['foo'], 'demo.txt'))).resolves.toBe(
    'data:text/plain;base64,Zm9v'
  );
  await expect(readFileAsText(new File(['foo'], 'demo.txt'))).resolves.toBe('text-payload');
  vi.unstubAllGlobals();
});

it('falls back to empty strings when file-reader load events carry null results', async () => {
  vi.stubGlobal('FileReader', EmptyFileReader);
  await expect(readFileAsDataUrl(new File(['foo'], 'demo.txt'))).resolves.toBe('');
  await expect(readFileAsText(new File(['foo'], 'demo.txt'))).resolves.toBe('');
  vi.unstubAllGlobals();
});

it('surfaces file-reader errors for both text and data-url reads', async () => {
  vi.stubGlobal('FileReader', ErrorFileReader);
  await expect(readFileAsDataUrl(new File(['foo'], 'demo.txt'))).rejects.toBeInstanceOf(
    DOMException
  );
  await expect(readFileAsText(new File(['foo'], 'demo.txt'))).rejects.toBeInstanceOf(DOMException);
  vi.unstubAllGlobals();
});
