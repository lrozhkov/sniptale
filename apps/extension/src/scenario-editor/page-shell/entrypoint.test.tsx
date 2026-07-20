// @vitest-environment jsdom

import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { renderPageShellMock, useAppLocaleMock } = vi.hoisted(() => ({
  renderPageShellMock: vi.fn(),
  useAppLocaleMock: vi.fn(),
}));

vi.mock('../../ui/page-bootstrap', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../ui/page-bootstrap')>()),
  renderPageShell: renderPageShellMock,
}));

vi.mock('./ScenarioEditorPage', () => ({
  ScenarioEditorPage: () => null,
}));

vi.mock('../../platform/i18n', async () => {
  const actual = await vi.importActual('../../platform/i18n');
  return {
    ...actual,
    useAppLocale: useAppLocaleMock,
    usePageLocaleMetadata: () => useAppLocaleMock(),
  };
});

function renderEntrypointElement() {
  const options = renderPageShellMock.mock.calls[0]?.[0] as
    | { element: ReactElement; namespace: string; strictMode: boolean }
    | undefined;

  expect(options?.namespace).toBe('ScenarioEditorEntrypoint');
  expect(options?.strictMode).toBe(true);
  expect(options).toBeDefined();
  renderToStaticMarkup(options!.element);
}

describe('scenario-editor index entrypoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('renders the scenario editor through the shared shell with strict mode', async () => {
    await import('../index');

    renderEntrypointElement();
    expect(useAppLocaleMock).toHaveBeenCalledTimes(1);
  });
});
