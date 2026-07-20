import { expect, it, vi } from 'vitest';

import { respondWithPopupPreview } from './preview';

const buildPopupExportPreviewMock = vi.hoisted(() => vi.fn(() => ({ preview: true })));

vi.mock('../helpers', async () => {
  const actual = await vi.importActual<typeof import('../helpers')>('../helpers/index');
  return {
    ...actual,
    buildPopupExportPreview: buildPopupExportPreviewMock,
  };
});

it('returns preview data when popup export parsing succeeds', async () => {
  const parseTree = vi.fn().mockResolvedValue({
    context: 'ctx',
    structure: [],
    title: 'Popup',
  });
  const sendResponse = vi.fn();

  await respondWithPopupPreview({ parseTree, sendResponse });

  expect(parseTree).toHaveBeenCalledWith('popup-export-preview');
  expect(buildPopupExportPreviewMock).toHaveBeenCalledWith({
    context: 'ctx',
    structure: [],
    title: 'Popup',
  });
  expect(sendResponse).toHaveBeenCalledWith({
    preview: { preview: true },
    success: true,
  });
});

it('returns translated copy when preview parsing fails with a non-error', async () => {
  const parseTree = vi.fn().mockRejectedValue('preview failed');
  const sendResponse = vi.fn();

  await respondWithPopupPreview({ parseTree, sendResponse });

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'Не удалось подготовить экспорт',
    success: false,
  });
});

it('returns the error message when preview parsing fails with an Error', async () => {
  const parseTree = vi.fn().mockRejectedValue(new Error('tree failed'));
  const sendResponse = vi.fn();

  await respondWithPopupPreview({ parseTree, sendResponse });

  expect(sendResponse).toHaveBeenCalledWith({
    error: 'tree failed',
    success: false,
  });
});
