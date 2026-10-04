import { expect, it } from 'vitest';
import { createGalleryState, createMediaItem } from '../../library/actions/test-support';
import { isGalleryListInteractionEnabled } from './list-interaction';

it('admits list commands only while no workflow or preview owns input', () => {
  const state = createGalleryState();
  expect(isGalleryListInteractionEnabled(state)).toBe(true);
  for (const flag of ['isBusy', 'isLoading'] as const) {
    expect(
      isGalleryListInteractionEnabled({ ...state, storage: { ...state.storage, [flag]: true } })
    ).toBe(false);
  }
  expect(
    isGalleryListInteractionEnabled({
      ...state,
      preview: { ...state.preview, session: { ...state.preview.session, item: createMediaItem() } },
    })
  ).toBe(false);
  const dialog = {
    title: 'Confirm',
    message: 'Continue?',
    cancelText: 'Cancel',
    confirmText: 'Confirm',
    onConfirm: async () => undefined,
  };
  expect(
    isGalleryListInteractionEnabled({
      ...state,
      storage: { ...state.storage, confirmDialog: dialog },
    })
  ).toBe(false);
});
