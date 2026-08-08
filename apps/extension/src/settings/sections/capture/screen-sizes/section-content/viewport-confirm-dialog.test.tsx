// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const renderDialog = vi.hoisted(() => vi.fn());
vi.mock('@sniptale/ui/product-feedback/confirm-dialog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-feedback/confirm-dialog')>()),
  ProductConfirmDialog: (props: unknown) => {
    renderDialog(props);
    return null;
  },
}));
import { ViewportConfirmDialog } from './viewport-confirm-dialog';

it('forwards delete confirmation state to the product dialog', () => {
  const onConfirm = vi.fn(async () => undefined);
  const onCancel = vi.fn();
  const root = createRoot(document.createElement('div'));
  act(() =>
    root.render(
      <ViewportConfirmDialog
        closeViewportDeleteDialog={onCancel}
        confirmDeleteViewport={onConfirm}
        deleteMessage="Delete preset"
        isLoading
        viewportConfirmOpen
      />
    )
  );
  expect(renderDialog).toHaveBeenCalledWith(
    expect.objectContaining({
      backdropClassName: '!z-[2147483648]',
      isOpen: true,
      isLoading: true,
      message: 'Delete preset',
      onCancel,
      onConfirm,
    })
  );
  act(() => root.unmount());
});
