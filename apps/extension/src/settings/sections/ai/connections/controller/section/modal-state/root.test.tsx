import { expect, it } from 'vitest';

import { useAiProvidersModalState } from '.';
import { useAiProvidersModalState as useAiProvidersModalStateImpl } from '.';

it('keeps the modal-state facade thin', () => {
  expect(useAiProvidersModalState).toBe(useAiProvidersModalStateImpl);
});
