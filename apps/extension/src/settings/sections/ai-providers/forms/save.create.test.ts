import type { SetStateAction } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

const { addAIProviderMock, toastSuccessMock } = vi.hoisted(() => ({
  addAIProviderMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock('../runtime/settings-mutations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../runtime/settings-mutations')>()),
  addAIProvider: addAIProviderMock,
}));

vi.mock('@sniptale/platform/observability/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/platform/observability/logger')>()),
  createLogger: () => ({
    child: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@sniptale/ui/product-feedback/toast-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/toast-service')>()),
  toast: {
    success: toastSuccessMock,
  },
}));

function createStateSetterMock<T>() {
  return vi.fn<(value: SetStateAction<T>) => void>();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', { randomUUID: () => 'generated-id' });
  addAIProviderMock.mockResolvedValue(undefined);
});

it('treats provider create saves without an optional provider object as a normal create flow', async () => {
  const { saveProviderForm } = await import('./save');
  const onSave = vi.fn();
  const setErrors = createStateSetterMock<Record<string, string>>();

  await saveProviderForm({
    formData: {
      apiKey: 'secret',
      baseUrl: 'https://api.example.com',
      connectionType: 'openai-compatible',
      name: 'Provider',
    },
    isEditing: false,
    onSave,
    setErrors,
    setIsSaving: createStateSetterMock<boolean>(),
  });

  expect(addAIProviderMock).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(setErrors).not.toHaveBeenCalled();
  expect(toastSuccessMock).toHaveBeenCalledTimes(1);
});
