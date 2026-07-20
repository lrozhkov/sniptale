import { describe, expect, it, vi } from 'vitest';

import type { PreviewStageImportHandlers } from '../../contracts/insertion';
import { dispatchVideoEditorMediaImport } from './media-import';

function createHandlers(): PreviewStageImportHandlers {
  return { audio: vi.fn(), image: vi.fn(), video: vi.fn() };
}

describe('dispatchVideoEditorMediaImport', () => {
  it('dispatches a supported file through the matching adapter', () => {
    const handlers = createHandlers();
    const file = new File([], 'image.png', { type: 'image/png' });

    expect(dispatchVideoEditorMediaImport(handlers, file, vi.fn())).toEqual({
      status: 'dispatched',
      kind: 'image',
    });
    expect(handlers.image).toHaveBeenCalledWith(file);
  });

  it('returns a typed failure and surfaces unsupported feedback', () => {
    const handlers = createHandlers();
    const onUnsupported = vi.fn();

    expect(
      dispatchVideoEditorMediaImport(
        handlers,
        new File([], 'notes.txt', { type: 'text/plain' }),
        onUnsupported
      )
    ).toEqual({ status: 'unsupported', reason: 'unsupported-media-type' });
    expect(onUnsupported).toHaveBeenCalledOnce();
    expect(handlers.image).not.toHaveBeenCalled();
    expect(handlers.video).not.toHaveBeenCalled();
    expect(handlers.audio).not.toHaveBeenCalled();
  });
});
