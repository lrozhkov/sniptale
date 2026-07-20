import { describe, expect, it } from 'vitest';

import type { EditorControllerInstanceLifecycleActions } from './lifecycle-actions';

type Assert<T extends true> = T;
type HasLifecycleAuthority = Assert<
  EditorControllerInstanceLifecycleActions extends {
    mount(
      canvasElement: HTMLCanvasElement,
      viewportElement: HTMLElement,
      stageElement: HTMLElement
    ): void;
    dispose(): void;
  }
    ? true
    : false
>;

describe('controller instance lifecycle action type role', () => {
  it('keeps mount and dispose in the lifecycle role', () => {
    const role: HasLifecycleAuthority = true;

    expect(role).toBe(true);
  });
});
