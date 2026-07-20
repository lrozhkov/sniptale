// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { createScenarioStoreProjectFixture } from '../../composition/persistence/scenario/store/test.helpers.ts';
import { ScenarioEditorExportDialog } from './ScenarioEditorExportDialog';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProject() {
  return createScenarioStoreProjectFixture();
}

function findButtonByText(text: string) {
  return Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (button) => button.textContent?.trim() === text
  );
}

function findButtonByLabel(label: string) {
  return container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
}

async function clickButton(text: string) {
  await act(async () => {
    findButtonByText(text)?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function renderDialog(props?: {
  onClose?: () => void;
  onExport?: (
    format: 'html' | 'markdown',
    mode: 'copy' | 'download',
    imageFormat: 'svg' | 'png',
    includeFullImages: boolean
  ) => Promise<void>;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(
      <ScenarioEditorExportDialog
        onClose={props?.onClose ?? vi.fn()}
        onExport={props?.onExport ?? vi.fn(async () => undefined)}
        project={createProject()}
      />
    );
  });
}

describe('ScenarioEditorExportDialog', () => {
  it('forwards the selected export options to export actions', async () => {
    const onExport = vi.fn(async () => undefined);
    await renderDialog({ onExport });

    expect(container?.querySelector('button[data-selected="true"]')?.textContent?.trim()).toBe(
      'scenario.editor.exportHtml'
    );
    expect(
      Array.from(container?.querySelectorAll('button[data-selected="true"]') ?? []).some((button) =>
        button.textContent?.includes('scenario.editor.exportImagePng')
      )
    ).toBe(true);
    await act(async () => {
      findButtonByLabel('scenario.editor.exportIncludeFullImages')?.click();
    });
    await clickButton('scenario.editor.exportAction');

    expect(onExport).toHaveBeenCalledWith('html', 'download', 'png', true);
  });

  it('shows the full-image toggle only for HTML exports', async () => {
    await renderDialog();

    expect(container?.textContent).toContain('scenario.editor.exportIncludeFullImages');

    await clickButton('scenario.editor.exportMarkdown');

    expect(container?.textContent).not.toContain('scenario.editor.exportIncludeFullImages');
  });

  it('disables the full-image toggle for svg exports and clears the export flag', async () => {
    const onExport = vi.fn(async () => undefined);
    await renderDialog({ onExport });

    await act(async () => {
      findButtonByLabel('scenario.editor.exportIncludeFullImages')?.click();
    });
    await clickButton('scenario.editor.exportImageSvg');
    await clickButton('scenario.editor.exportAction');

    expect(container?.textContent).toContain('scenario.editor.exportIncludeFullImagesSvgHint');
    expect(findButtonByLabel('scenario.editor.exportIncludeFullImages')?.disabled).toBe(true);
    expect(onExport).toHaveBeenCalledWith('html', 'download', 'svg', false);
  });
});

describe('ScenarioEditorExportDialog shell', () => {
  it('renders inside the shared modal shell and closes from the shared close button', async () => {
    const onClose = vi.fn();
    await renderDialog({ onClose });

    const dialog = container?.querySelector('.sniptale-modal');
    const closeButton = container?.querySelector('.sniptale-modal-close');

    expect(dialog).not.toBeNull();
    expect(closeButton).not.toBeNull();

    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
