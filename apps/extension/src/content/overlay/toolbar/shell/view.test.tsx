import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ToolbarShellContent } from './view';

vi.mock('../controls/primary', () => ({
  ToolbarPrimaryControls: () => <div data-testid="toolbar-primary" />,
}));

vi.mock('../controls/secondary', () => ({
  ToolbarSecondaryControls: () => <div data-testid="toolbar-secondary" />,
}));

function renderToolbarShell(positionReady: boolean) {
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
            handleMouseDown: vi.fn(),
          },
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
});
