import { describe, expect, it } from 'vitest';

import type { EditorControllerInstanceObjectCapabilities } from './object-capabilities';

type Assert<T extends true> = T;
type HasObjectCapabilities = Assert<
  EditorControllerInstanceObjectCapabilities extends {
    ensureReachableObjects(): boolean;
    syncRuntimeState(): void;
  }
    ? true
    : false
>;

describe('controller instance object capability type role', () => {
  it('keeps object and runtime helpers in the capability role', () => {
    const role: HasObjectCapabilities = true;

    expect(role).toBe(true);
  });
});
