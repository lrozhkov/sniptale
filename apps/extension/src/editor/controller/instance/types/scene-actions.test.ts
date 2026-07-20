import { describe, expect, it } from 'vitest';

import type { EditorControllerInstanceSceneActions } from './scene-actions';

type Assert<T extends true> = T;
type HasSceneAuthority = Assert<
  EditorControllerInstanceSceneActions extends {
    resizeCanvas(width: number, height: number): void;
    zoomToFit(): void;
  }
    ? true
    : false
>;

describe('controller instance scene action type role', () => {
  it('keeps scene sizing and viewport commands in the scene role', () => {
    const role: HasSceneAuthority = true;

    expect(role).toBe(true);
  });
});
