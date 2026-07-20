import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  PopupActionButtonCompactContent,
  PopupActionButtonDefaultContent,
  PopupActionButtonIcon,
} from './content';

function TestIcon({ className }: { className?: string }) {
  return <svg className={className} data-testid="icon" />;
}

it('renders the dimmed icon class when the action is disabled', () => {
  const markup = renderToStaticMarkup(
    <PopupActionButtonIcon icon={TestIcon} iconClassName="text-brand" disabled />
  );

  expect(markup).toContain('transition-colors');
  expect(markup).toContain('text-[var(--sniptale-color-text-dim)]');
  expect(markup).not.toContain('text-brand');
});

it('keeps the shared icon renderer ready for consumer hover color sync when enabled', () => {
  const markup = renderToStaticMarkup(
    <PopupActionButtonIcon
      icon={TestIcon}
      iconClassName="text-brand group-hover:text-accent"
      disabled={false}
    />
  );

  expect(markup).toContain('transition-colors');
  expect(markup).toContain('text-brand');
  expect(markup).toContain('group-hover:text-accent');
});

it('renders compact trailing content and screen-reader label when provided', () => {
  const markup = renderToStaticMarkup(
    <PopupActionButtonCompactContent
      accessibleLabel="Open gallery"
      trailing={<span data-testid="badge">3</span>}
    />
  );

  expect(markup).toContain('Open gallery');
  expect(markup).toContain('sr-only');
  expect(markup).toContain('data-testid="badge"');
});

it('renders an empty compact fragment when no optional content is provided', () => {
  const markup = renderToStaticMarkup(<PopupActionButtonCompactContent />);

  expect(markup).toBe('');
});

it('renders subtitle and trailing content for the default layout when provided', () => {
  const markup = renderToStaticMarkup(
    <PopupActionButtonDefaultContent
      label="Start capture"
      subtitle="Prepare current page"
      trailing={<span data-testid="status">ready</span>}
    />
  );

  expect(markup).toContain('Start capture');
  expect(markup).toContain('Prepare current page');
  expect(markup).toContain('data-testid="status"');
});

it('omits subtitle and trailing wrappers for the default layout when not provided', () => {
  const markup = renderToStaticMarkup(<PopupActionButtonDefaultContent label="Open settings" />);

  expect(markup).toContain('Open settings');
  expect(markup).not.toContain('text-xs font-medium');
  expect(markup).not.toContain('shrink-0');
});
