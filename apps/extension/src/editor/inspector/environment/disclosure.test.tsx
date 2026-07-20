// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  colorControlMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: mocks.translateMock,
}));

vi.mock('../../chrome/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../chrome/ui')>()),
  cx: (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(' '),
  ColorField: (props: any) => {
    mocks.colorControlMock(props);
    return (
      <button
        type="button"
        data-testid="color-control"
        onClick={() => {
          props.onChange('#445566');
        }}
      >
        {props.label}
      </button>
    );
  },
}));

vi.mock('./shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./shared')>()),
  PanelSection: ({ children, label, value }: any) => (
    <section>
      <div>{label}</div>
      <div>{value}</div>
      {children}
    </section>
  ),
  panelButtonClassName: 'panel-button',
}));

import { WorkspacePanelBody } from './disclosure';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

function renderWorkspacePanel(
  overrides: Partial<React.ComponentProps<typeof WorkspacePanelBody>> = {}
) {
  const props: React.ComponentProps<typeof WorkspacePanelBody> = {
    applyWorkspaceColor: vi.fn(),
    palette: ['#111111', '#222222'],
    previewWorkspaceColor: vi.fn(),
    recentColors: ['#ffffff'],
    saveWorkspaceColorAsDefault: vi.fn(),
    workspaceBackgroundColor: '#111111',
    workspaceColorError: null,
    workspaceColorMatchesDefault: false,
    workspaceDefaultSavePending: false,
    ...overrides,
  };

  render(<WorkspacePanelBody {...props} />);
}

function getWorkspaceDefaultButton() {
  return Array.from(container?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === 'editor.compact.workspaceMakeDefault'
  ) as HTMLButtonElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('WorkspacePanelBody', () => {
  it('renders workspace color controls and the save-default action', () => {
    const applyWorkspaceColor = vi.fn();
    const saveWorkspaceColorAsDefault = vi.fn();

    renderWorkspacePanel({
      applyWorkspaceColor,
      saveWorkspaceColorAsDefault,
      workspaceColorError: 'Save failed',
    });

    act(() => {
      (container?.querySelector('[data-testid="color-control"]') as HTMLButtonElement).click();
    });

    expect(applyWorkspaceColor).toHaveBeenCalledWith('#445566');
    expect(container?.textContent).toContain('editor.compact.workspaceMakeDefault');
    expect(container?.textContent).toContain('Save failed');
    expect(container?.textContent).not.toContain('editor.compact.workspaceDefaultHint');
    expect(container?.textContent).not.toContain('editor.compact.workspaceDefaultApplied');
    expect(container?.textContent).not.toContain('editor.compact.workspaceMoreOptions');
    expect(container?.textContent).not.toContain('editor.compact.behavior');

    act(() => {
      (container?.querySelector('button[title="#111111"]') as HTMLButtonElement).click();
    });

    expect(applyWorkspaceColor).toHaveBeenCalledWith('#111111');
    act(() => {
      getWorkspaceDefaultButton().click();
    });

    expect(saveWorkspaceColorAsDefault).toHaveBeenCalledOnce();
  });

  it('disables the action and switches helper copy when the color already matches default', () => {
    renderWorkspacePanel({
      palette: ['#111111'],
      recentColors: [],
      workspaceColorMatchesDefault: true,
    });

    const saveButton = getWorkspaceDefaultButton();

    expect(container?.textContent).not.toContain('editor.compact.workspaceDefaultApplied');
    expect(saveButton.disabled).toBe(true);
  });
});
