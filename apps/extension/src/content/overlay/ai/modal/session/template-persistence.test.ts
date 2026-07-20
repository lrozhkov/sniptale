import { describe, expect, it, vi } from 'vitest';

const { loggerErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
}));

vi.mock('@sniptale/platform/observability/logger', () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}));

import { createTemplateDeleteHandler, createTemplateSaveHandler } from './template-persistence';

describe('createTemplateDeleteHandler', () => {
  it('removes the template and logs failures before rethrowing them', async () => {
    const removeTemplate = vi.fn().mockResolvedValue(undefined);

    await createTemplateDeleteHandler(removeTemplate)({ id: 'template-1' });

    expect(removeTemplate).toHaveBeenCalledWith('template-1');

    removeTemplate.mockRejectedValueOnce(new Error('delete failed'));

    await expect(createTemplateDeleteHandler(removeTemplate)({ id: 'template-2' })).rejects.toThrow(
      'delete failed'
    );

    expect(loggerErrorMock).toHaveBeenCalledWith('Error deleting template', expect.any(Error));
  });
});

describe('createTemplateSaveHandler', () => {
  it('updates existing templates and adds new ones when no edit target exists', async () => {
    const addTemplate = vi.fn().mockResolvedValue(undefined);
    const updateTemplate = vi.fn().mockResolvedValue(undefined);

    await createTemplateSaveHandler({
      addTemplate,
      editingTemplate: { content: 'Old', id: 'template-1', name: 'Old name' },
      updateTemplate,
    })('New name', 'New content');

    expect(updateTemplate).toHaveBeenCalledWith('template-1', {
      content: 'New content',
      name: 'New name',
    });

    await createTemplateSaveHandler({
      addTemplate,
      editingTemplate: undefined,
      updateTemplate,
    })('Fresh name', 'Fresh content');

    expect(addTemplate).toHaveBeenCalledWith('Fresh name', 'Fresh content');
  });
});
