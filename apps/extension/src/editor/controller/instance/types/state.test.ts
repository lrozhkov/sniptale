import { describe, expect, it } from 'vitest';

import type {
  EditorControllerDocumentState,
  EditorControllerInstanceState,
  EditorControllerInteractionState,
  EditorControllerMountedElementsState,
  EditorControllerMutationState,
  EditorControllerViewportStateOwner,
} from './state';

type Assert<T extends true> = T;
type StateKeepsRoles = Assert<
  EditorControllerInstanceState extends EditorControllerMountedElementsState &
    EditorControllerDocumentState &
    EditorControllerInteractionState &
    EditorControllerViewportStateOwner &
    EditorControllerMutationState
    ? true
    : false
>;

describe('controller instance state type roles', () => {
  it('keeps aggregate state composed from narrower state roles', () => {
    const role: StateKeepsRoles = true;

    expect(role).toBe(true);
  });
});
