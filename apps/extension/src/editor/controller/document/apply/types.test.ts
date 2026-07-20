import { describe, expect, it } from 'vitest';

import type { AppliedDocumentCanvasLoadCallbacks, LoadPreparedDocumentOptions } from './types';

type Assert<T extends true> = T;
type LoadOptionsKeepCanvasAndPrepared = Assert<
  LoadPreparedDocumentOptions extends {
    canvas: unknown;
    prepared: unknown;
    zoomLevel: number;
  }
    ? true
    : false
>;
type CallbacksKeepRequiredHooks = Assert<
  AppliedDocumentCanvasLoadCallbacks extends {
    prepareObject: (...args: never[]) => void;
    rebuildFrameDecorations: () => Promise<void>;
  }
    ? true
    : false
>;

describe('document apply type owner', () => {
  it('keeps prepared load options and callbacks separated', () => {
    const loadRole: LoadOptionsKeepCanvasAndPrepared = true;
    const callbackRole: CallbacksKeepRequiredHooks = true;

    expect(loadRole && callbackRole).toBe(true);
  });
});
