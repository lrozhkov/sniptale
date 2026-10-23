// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SettingsPopoverHeader } from '../../../composition/frame-annotation-controls/popover/header';

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
    expect(markup).toContain('sniptale-toolbar-menu-title');
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
    expect(markup).not.toContain('title="Settings"');
    expect(markup).toContain('sniptale-settings-popover-close');
    expect(markup).toContain('aria-label="Close"');
  });

  it('places back navigation before the title and keeps trash and close at the trailing edge', () => {
    const markup = renderToStaticMarkup(
      <SettingsPopoverHeader
        action={{ label: 'Customize', onClick: vi.fn() }}
        closeLabel="Close"
        context="element"
        destructiveAction={{ label: 'Disable', onClick: vi.fn() }}
        onClose={vi.fn()}
        title="Comment"
      />
    );

    expect(markup).toContain('sniptale-settings-popover-destructive-action');
    expect(markup.indexOf('data-settings-action="back-to-templates"')).toBeLessThan(
      markup.indexOf('Comment')
    );
    expect(markup.indexOf('data-settings-action="disable"')).toBeGreaterThan(
      markup.indexOf('Comment')
    );
    expect(markup.indexOf('data-settings-action="disable"')).toBeLessThan(
      markup.indexOf('data-settings-action="close"')
    );
    expect(markup).toContain('aria-label="Disable"');
    expect(markup).toContain('lucide-trash-2');
    expect(markup).toContain('lucide-arrow-left');
  });
});
