import { CommandPressScope } from '../control-language/press';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ContentToolbarButton,
  ContentToolbarDelayIndicator,
  ContentToolbarDivider,
  ContentToolbarGroup,
  ContentToolbarShell,
  ContentToolbarSpacer,
} from '@sniptale/ui/content-toolbar';

describe('ContentToolbar', () => {
  it.each([0, 3, 5, 10, 30])('keeps delay %s presentation inside its size container', (value) => {
    const markup = renderToStaticMarkup(
      <ContentToolbarDelayIndicator value={value} dataUi="test.delay">
        <svg />
      </ContentToolbarDelayIndicator>
    );
    expect(markup).toContain('class="sniptale-toolbar-delay"');
    expect(markup).toContain('class="sniptale-toolbar-delay-icon"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup.includes('data-ui="test.delay"')).toBe(value > 0);
    expect(markup.includes('data-has-value="true"')).toBe(value > 0);
  });
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

it.each([true, 'true'] as const)(
  'uses the selected visual contract for aria-pressed=%s',
  (pressed) => {
    const markup = renderToStaticMarkup(
      <ContentToolbarButton aria-pressed={pressed}>Left</ContentToolbarButton>
    );
    expect(markup).toContain('data-active="true"');
    expect(markup).toContain('sniptale-glass-toolbar-button--active');
  }
);

it('keeps utility layout state accessible without applying selection or destructive chrome', () => {
  const markup = renderToStaticMarkup(
    <ContentToolbarButton
      tone="utility"
      size="compact"
      aria-pressed
      disabled
      title="Restore height"
    >
      Height
    </ContentToolbarButton>
  );
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('aria-label="Restore height"');
  expect(markup).toContain('disabled=""');
  expect(markup).toContain('sniptale-btn-utility');
  expect(markup).toContain('sniptale-btn-compact');
  expect(markup).not.toContain('sniptale-glass-toolbar-button--active');
  expect(markup).not.toContain('sniptale-toggle');
  expect(markup).not.toContain('sniptale-btn-close');
});

it('separates scoped property selection from tool mode and preserves preview content', () => {
  const markup = renderToStaticMarkup(
    <CommandPressScope value={true}>
      <ContentToolbarButton tone="property" aria-pressed title="Font">
        <span style={{ fontFamily: 'serif' }}>Aa</span>
      </ContentToolbarButton>
    </CommandPressScope>
  );
  expect(markup).toContain('data-command-property="true"');
  expect(markup).toContain('aria-pressed="true"');
  expect(markup).toContain('data-active="true"');
  expect(markup).toContain('font-family:serif');
  expect(markup).not.toContain('sniptale-glass-toolbar-button--active');
  expect(markup).not.toContain('sniptale-toggle');
  const pendingMarkup = renderToStaticMarkup(
    <ContentToolbarButton active>Pending tool</ContentToolbarButton>
  );
  expect(pendingMarkup).not.toContain('data-command-property');
  expect(pendingMarkup).toContain('sniptale-glass-toolbar-button--active');
});
