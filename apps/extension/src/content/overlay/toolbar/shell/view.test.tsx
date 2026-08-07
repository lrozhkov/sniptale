import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolbarShellContent } from './view';

const { useContentUiScaleMock } = vi.hoisted(() => ({
  useContentUiScaleMock: vi.fn(() => 1),
}));

vi.mock('../../../platform/dom-host', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/dom-host')>()),
  useContentUiScale: useContentUiScaleMock,
}));

vi.mock('../controls/primary', () => ({
  ToolbarPrimaryControls: () => <div data-testid="toolbar-primary" />,
}));

vi.mock('../controls/secondary', () => ({
  ToolbarSecondaryControls: () => <div data-testid="toolbar-secondary" />,
}));

function renderToolbarShell(
  positionReady: boolean,
  activeMenuType: string | null = null,
  uiScale = 1
) {
  useContentUiScaleMock.mockReturnValue(uiScale);
  return renderToStaticMarkup(
    <ToolbarShellContent
      toolbarProps={{} as never}
      viewModel={
        {
          derivedState: {
            toolbarRef: { current: null },
            isDragging: false,
            displayMode: 'horizontal',
            position: { x: 24, y: 12 },
            positionReady,
            uiScale,
            handleMouseDown: vi.fn(),
          },
          toolbarMenuState: { activeMenuType },
        } as never
      }
      onHoverCapture={vi.fn()}
      onViewportChange={vi.fn()}
    />
  );
}

describe('ToolbarShellContent', () => {
  it('keeps the shell hidden until the drag-position owner reports readiness', () => {
    const markup = renderToolbarShell(false);

    expect(markup).toContain('visibility:hidden');
    expect(markup).toContain('pointer-events:none');
    expect(markup).toContain('animation:none');
  });

  it('renders the positioned shell once the drag-position owner is ready', () => {
    const markup = renderToolbarShell(true);

    expect(markup).toContain('top:12px');
    expect(markup).toContain('left:24px');
    expect(markup).toContain('visibility:visible');
    expect(markup).toContain('pointer-events:auto');
  });

  it('projects logical toolbar coordinates back into the scaled client surface', () => {
    const markup = renderToolbarShell(true, null, 0.5);

    expect(markup).toContain('top:6px');
    expect(markup).toContain('left:12px');
  });

  it('owns a viewport interaction guard while a main-toolbar menu is open', () => {
    const markup = renderToolbarShell(true, 'frame-style');

    expect(markup).toContain('sniptale-toolbar-menu-interaction-guard');
    expect(markup).toContain('data-menu-open="true"');
  });
});
