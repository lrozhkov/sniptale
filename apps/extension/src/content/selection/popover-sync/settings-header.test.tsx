// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPopoverHeader } from './settings-header';

describe('SettingsPopoverHeader', () => {
  it('renders a transient toolbar header without drag or close controls', () => {
    const markup = renderToStaticMarkup(
      <SettingsPopoverHeader
        closeLabel="Close"
        context="toolbar"
        onClose={vi.fn()}
        title="Settings"
      />
    );

    expect(markup).toContain('Settings');
    expect(markup).not.toContain('data-draggable');
    expect(markup).not.toContain('sniptale-settings-popover-close');
  });

  it('renders a compact mode action in the shared header', () => {
    const markup = renderToStaticMarkup(
      <SettingsPopoverHeader
        action={{ label: 'Choose template', onClick: vi.fn() }}
        closeLabel="Close"
        context="toolbar"
        onClose={vi.fn()}
        title="Frame"
      />
    );

    expect(markup).toContain('sniptale-settings-popover-mode-action');
    expect(markup).toContain('Choose template');
  });

  it('renders an element header with drag and explicit close controls', () => {
    const markup = renderToStaticMarkup(
      <SettingsPopoverHeader
        closeLabel="Close"
        context="element"
        drag={{
          isDragging: false,
          onPointerDown: vi.fn(),
          onPointerMove: vi.fn(),
          onPointerUp: vi.fn(),
          position: { left: 0, top: 0 },
        }}
        onClose={vi.fn()}
        title="Settings"
      />
    );

    expect(markup).toContain('data-draggable="true"');
    expect(markup).toContain('sniptale-settings-popover-close');
    expect(markup).toContain('aria-label="Close"');
  });
});
