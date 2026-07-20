import { expect, it } from 'vitest';

import { POPUP_LOADING_CARD_CLASS_NAME } from './constants';

it('keeps the popup loading card class contract stable', () => {
  expect(POPUP_LOADING_CARD_CLASS_NAME).toBe(
    [
      'flex min-h-0 flex-1 flex-col rounded-[16px] border',
      'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_92%,transparent)]',
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,var(--sniptale-color-surface-canvas)_4%)]',
      'p-3',
    ].join(' ')
  );
});
