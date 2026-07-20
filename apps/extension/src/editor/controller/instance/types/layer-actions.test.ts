import { describe, expect, it } from 'vitest';

import type { EditorControllerInstanceLayerActions } from './layer-actions';

type Assert<T extends true> = T;
type HasLayerAuthority = Assert<
  EditorControllerInstanceLayerActions extends {
    toggleLayerLock(id: string): void;
    mergeSelectedLayers(): Promise<void>;
  }
    ? true
    : false
>;

describe('controller instance layer action type role', () => {
  it('keeps layer mutations in the layer role', () => {
    const role: HasLayerAuthority = true;

    expect(role).toBe(true);
  });
});
