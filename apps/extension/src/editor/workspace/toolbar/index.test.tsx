import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  contentMock: vi.fn(() => <div>content</div>),
  emptyStateMock: vi.fn(() => <div>empty</div>),
  shellMock: vi.fn(({ children }: { children: ReactNode }) => <section>{children}</section>),
  useAppLocaleMock: vi.fn(),
  useControllerMock: vi.fn(() => ({ activeTool: 'select' })),
}));

vi.mock('../../../platform/i18n', () => ({
  useAppLocale: mocks.useAppLocaleMock,
}));
vi.mock('./content', () => ({ EditorToolbarContent: mocks.contentMock }));
vi.mock('./empty-state', () => ({ EditorToolbarEmptyState: mocks.emptyStateMock }));
vi.mock('./shared', () => ({ EditorToolbarShell: mocks.shellMock }));
vi.mock('./use-controller', () => ({ useEditorToolbarController: mocks.useControllerMock }));

import { EditorToolbar } from './';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useControllerMock.mockReturnValue({ activeTool: 'select' });
});

it('renders the empty-state shell when no image is loaded', () => {
  const markup = renderToStaticMarkup(<EditorToolbar hasImage={false} />);

  expect(markup).toContain('empty');
  expect(mocks.useAppLocaleMock).toHaveBeenCalledOnce();
  expect(mocks.useControllerMock).toHaveBeenCalledWith(false);
  expect(mocks.shellMock).toHaveBeenCalledOnce();
  expect(mocks.emptyStateMock).toHaveBeenCalledOnce();
  expect(mocks.contentMock).not.toHaveBeenCalled();
});

it('renders toolbar content when an image is loaded', () => {
  renderToStaticMarkup(<EditorToolbar hasImage />);

  expect(mocks.useAppLocaleMock).toHaveBeenCalledOnce();
  expect(mocks.useControllerMock).toHaveBeenCalledWith(true);
  expect(mocks.contentMock).toHaveBeenCalledWith(
    expect.objectContaining({ activeTool: 'select' }),
    undefined
  );
  expect(mocks.shellMock).not.toHaveBeenCalled();
  expect(mocks.emptyStateMock).not.toHaveBeenCalled();
});
