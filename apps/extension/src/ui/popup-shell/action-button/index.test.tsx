/* eslint-disable max-lines-per-function --
   exact action-button proof keeps default and compact variant branches together */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { PopupActionButton } from './index';

function TestIcon({ className }: { className?: string }) {
  return <svg className={className} data-ui="test.icon" />;
}

describe('PopupActionButton', () => {
  it('renders the default variant with the shared left-aligned action surface contract', () => {
    const markup = renderToStaticMarkup(
      <PopupActionButton
        icon={TestIcon}
        label="Open settings"
        subtitle="Configure defaults"
        iconClassName="text-brand"
        onClick={() => {}}
        tone="gallery"
        trailing={<span>⌘,</span>}
        dataUi="popup.action"
      />
    );

    expect(markup).toContain('data-ui="popup.action"');
    expect(markup).toContain('aria-label="Open settings"');
    expect(markup).toContain('title="Open settings"');
    expect(markup).toContain('Configure defaults');
    expect(markup).toContain('⌘,');
    expect(markup).toContain('justify-start');
    expect(markup).toContain('group');
    expect(markup).toContain('flex-1 items-center justify-between');
    expect(markup).toContain('text-brand');
  });

  it('renders the compact variant with explicit aria and disabled defaults', () => {
    const markup = renderToStaticMarkup(
      <PopupActionButton
        icon={TestIcon}
        label={<span>Save</span>}
        ariaLabel="Save project"
        title="Save now"
        iconClassName="text-brand"
        onClick={() => {}}
        compact
        disabled
      />
    );

    expect(markup).toContain('data-ui="shared.ui.popup-action-button"');
    expect(markup).toContain('aria-label="Save project"');
    expect(markup).toContain('title="Save now"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('sr-only">Save project<');
    expect(markup).toContain('group');
    expect(markup).toContain('justify-center');
  });

  it('omits optional trailing and accessible-label wrappers when the label is not textual', () => {
    const markup = renderToStaticMarkup(
      <PopupActionButton
        icon={TestIcon}
        label={<span>Save</span>}
        iconClassName="text-brand"
        onClick={() => {}}
        compact
      />
    );

    expect(markup).not.toContain('sr-only');
    expect(markup).not.toContain('title=');
  });

  it('keeps the shared aria fallback contract across both variants', () => {
    const defaultMarkup = renderToStaticMarkup(
      <PopupActionButton
        icon={TestIcon}
        label="Export"
        iconClassName="text-brand"
        onClick={() => {}}
      />
    );
    const compactMarkup = renderToStaticMarkup(
      <PopupActionButton
        icon={TestIcon}
        label="Export"
        iconClassName="text-brand"
        onClick={() => {}}
        compact
      />
    );

    expect(defaultMarkup).toContain('aria-label="Export"');
    expect(defaultMarkup).toContain('title="Export"');
    expect(compactMarkup).toContain('aria-label="Export"');
    expect(compactMarkup).toContain('title="Export"');
  });

  it('keeps enabled buttons transparent until hover and focus reveal the surface', () => {
    const markup = renderToStaticMarkup(
      <PopupActionButton
        icon={TestIcon}
        label="Export"
        iconClassName="text-brand"
        onClick={() => {}}
        tone="primary"
      />
    );

    expect(markup).toContain('bg-transparent');
    expect(markup).toContain('hover:bg-');
    expect(markup).toContain('focus-visible:bg-');
  });
});
