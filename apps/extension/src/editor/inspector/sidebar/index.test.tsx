// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useAppLocaleMock: vi.fn(),
  useControllerMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../platform/i18n')>();
  return {
    ...actual,
    useAppLocale: mocks.useAppLocaleMock,
  };
});

vi.mock('../compact', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../compact')>()),
  EditorInspectorCompactToolbar: (props: Record<string, unknown>) => (
    <div data-testid="compact-toolbar">{String((props['commandGroups'] as unknown[]).length)}</div>
  ),
}));

vi.mock('../sidebar-expanded-content', () => ({
  EditorInspectorSidebarExpandedContent: (props: Record<string, unknown>) => (
    <div data-testid="expanded-content">{String(props['hasImage'])}</div>
  ),
}));

vi.mock('@sniptale/ui/inspector-shell', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sniptale/ui/inspector-shell')>();
  return {
    ...actual,
    InspectorShellFrame: (props: { children?: React.ReactNode; className?: string }) => (
      <div data-testid="shell-frame" data-class-name={props.className}>
        {props.children}
      </div>
    ),
    InspectorShellPanel: (props: { children?: React.ReactNode; style?: React.CSSProperties }) => (
      <div data-testid="shell-panel" data-background={String(props.style?.background ?? '')}>
        {props.children}
      </div>
    ),
  };
});

vi.mock('./hidden-inputs', () => ({
  EditorInspectorSidebarHiddenInputs: () => <div data-testid="hidden-inputs" />,
}));

vi.mock('../sidebar-controller', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../sidebar-controller')>()),
  useEditorInspectorSidebarController: mocks.useControllerMock,
}));

import { EditorInspectorSidebar } from './';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createSidebarController(inspectorCollapsed: boolean) {
  return {
    backgroundImageInputRef: { current: null },
    compactCommandGroups: [[{ id: 'command-1' }]],
    handleBackgroundImageUpload: vi.fn(),
    importSessionInputRef: { current: null },
    inspectorCollapsed,
    openImageInputRef: { current: null },
    setImageData: vi.fn(),
  };
}

function setupSidebarMocks() {
  vi.clearAllMocks();
  document.body.innerHTML = '';
  mocks.useControllerMock.mockReturnValue(createSidebarController(false));
}

function renderSidebar(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(node));
}

describe('EditorInspectorSidebar', () => {
  beforeEach(setupSidebarMocks);

  it('renders the expanded sidebar content when the inspector is not collapsed', () => {
    renderSidebar(<EditorInspectorSidebar hasImage />);

    expect(mocks.useAppLocaleMock).toHaveBeenCalledOnce();
    expect(container?.querySelector('[data-testid="hidden-inputs"]')).toBeTruthy();
    expect(
      container?.querySelector('[data-testid="shell-panel"]')?.getAttribute('data-background')
    ).toContain('surface-panel');
    expect(container?.querySelector('[data-testid="expanded-content"]')?.textContent).toContain(
      'true'
    );
    expect(container?.querySelector('[data-testid="compact-toolbar"]')).toBeNull();
  });

  it('renders the compact toolbar when the inspector is collapsed', () => {
    mocks.useControllerMock.mockReturnValue(createSidebarController(true));

    renderSidebar(<EditorInspectorSidebar hasImage={false} />);

    expect(container?.querySelector('[data-testid="compact-toolbar"]')?.textContent).toContain('1');
    expect(container?.querySelector('[data-testid="expanded-content"]')).toBeNull();
  });
});
