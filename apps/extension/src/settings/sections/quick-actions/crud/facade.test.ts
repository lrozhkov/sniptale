import { expect, it, vi } from 'vitest';
import { createQuickActionsCrud } from './facade';

it('exposes the CRUD facade contract', () => {
  const crud = createQuickActionsCrud({
    actions: [],
    editForm: null,
    resetEditor: vi.fn(),
    setActions: vi.fn(),
    setEditingId: vi.fn(),
    setEditForm: vi.fn(),
    showConfirmation: vi.fn(),
  });

  expect(crud).toMatchObject({
    handleAdd: expect.any(Function),
    handleCancelEdit: expect.any(Function),
    handleDelete: expect.any(Function),
    handleEdit: expect.any(Function),
    handleSaveEdit: expect.any(Function),
    handleToggleStatus: expect.any(Function),
    updateFormField: expect.any(Function),
  });
});
