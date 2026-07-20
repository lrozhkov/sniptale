import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ContentToolbarButton,
  ContentToolbarDivider,
  ContentToolbarGroup,
  ContentToolbarShell,
  ContentToolbarSpacer,
} from '@sniptale/ui/content-toolbar';

describe('ContentToolbar', () => {
  it('renders the shell with the default data-ui and dragging class', () => {
    const markup = renderToStaticMarkup(
      <ContentToolbarShell dragging>
        <span>Toolbar</span>
      </ContentToolbarShell>
    );

    expect(markup).toContain('data-ui="shared.ui.content-toolbar"');
    expect(markup).toContain('sniptale-toolbar-dragging');
  });

  it('renders utility groups and chrome primitives with their shared data-ui markers', () => {
    const markup = renderToStaticMarkup(
      <ContentToolbarShell>
        <ContentToolbarGroup utilities>
          <ContentToolbarDivider />
          <ContentToolbarSpacer />
        </ContentToolbarGroup>
      </ContentToolbarShell>
    );

    expect(markup).toContain('data-ui="shared.ui.content-toolbar-group"');
    expect(markup).toContain('sniptale-group-utilities');
    expect(markup).toContain('data-ui="shared.ui.content-toolbar-divider"');
    expect(markup).toContain('data-ui="shared.ui.content-toolbar-spacer"');
  });

  it('renders button tone and active state classes without dropping custom classes', () => {
    const markup = renderToStaticMarkup(
      <>
        <ContentToolbarButton active className="custom-button" title="Active action">
          Active
        </ContentToolbarButton>
        <ContentToolbarButton menuIndicator>Menu</ContentToolbarButton>
        <ContentToolbarButton tone="danger">Danger</ContentToolbarButton>
        <ContentToolbarButton tone="close">Close</ContentToolbarButton>
      </>
    );

    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('aria-label="Active action"');
    expect(markup).toContain('title="Active action"');
    expect(markup).toContain('sniptale-glass-toolbar-button--active');
    expect(markup).toContain('custom-button');
    expect(markup).toContain('data-menu-indicator="true"');
    expect(markup).toContain('sniptale-btn-danger');
    expect(markup).toContain('sniptale-btn-close');
  });
});
