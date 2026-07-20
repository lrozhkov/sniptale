import { expect, it } from 'vitest';
import { buildLibraryImagePayload, createFileImagePayload } from './payload';

it('falls back to the stored filename when the library item has no original filename', () => {
  const payload = buildLibraryImagePayload(
    {
      id: 'asset-1',
      filename: 'stored-name.png',
      originalFilename: null,
      sourceTitle: null,
      sourceUrl: null,
    } as never,
    new Blob(['image'], { type: 'image/png' })
  );

  expect(payload.filename).toBe('stored-name.png');
});

it('builds upload payloads from local files', () => {
  const file = new File(['image'], 'local-file.png', { type: 'image/png' });

  expect(createFileImagePayload(file)).toEqual({
    blob: file,
    filename: 'local-file.png',
  });
});
