import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { PopupExpandingModeButton } from './index';

function TestIcon({ className }: { className?: string }) {
  return <svg className={className} />;
}

it('renders the initial active mode at its final fixed-height layout without animation', () => {
  const markup = renderToStaticMarkup(
    <PopupExpandingModeButton
      accentClassName="text-accent"
      active
      description="Capture the current tab"
      icon={TestIcon}
      label="Tab"
      onClick={() => undefined}
    />
  );

  expect(markup).toContain('grow-[1.9]');
  expect(markup).toContain('h-[58px] min-h-[58px]');
  expect(markup).toContain('opacity-100');
  expect(markup).not.toContain('transition-[flex-grow');
  expect(markup).not.toContain('transition-opacity');
  expect(markup).toContain('Capture the current tab');
  expect(markup).toContain('w-[108px] shrink-0');
  expect(markup).toContain('block text-[8px]');
  expect(markup).not.toContain('block truncate text-[8px]');
  expect(markup).not.toContain('line-clamp-2');
  expect(markup).toContain('aria-pressed="true"');
});

it('keeps inactive modes compact while the expanded content stays out of layout', () => {
  const markup = renderToStaticMarkup(
    <PopupExpandingModeButton
      accentClassName="text-accent"
      active={false}
      description="Choose an area"
      icon={TestIcon}
      label="Area"
      onClick={() => undefined}
    />
  );

  expect(markup).toContain('grow border-transparent');
  expect(markup).toContain('opacity-0');
  expect(markup).toContain('group-hover:scale-110');
  expect(markup).not.toContain('group-hover:-translate-y-px');
  expect(markup).toContain('absolute inset-y-0 left-[38px] right-2 flex');
  expect(markup).toContain('Choose an area');
  expect(markup).toContain('title="Area. Choose an area"');
});

it('keeps the normal description visible while an unavailable reason stays in the title', () => {
  const markup = renderToStaticMarkup(
    <PopupExpandingModeButton
      accentClassName="text-accent"
      active
      description="Capture the current tab"
      disabled
      disabledReason="Unavailable on extension pages"
      icon={TestIcon}
      label="Tab"
      onClick={() => undefined}
    />
  );

  expect(markup).toContain('>Capture the current tab</span>');
  expect(markup).toContain('title="Tab. Unavailable on extension pages"');
  expect(markup).toContain('disabled=""');
});

it('animates width while crossfading static compact and expanded layouts', () => {
  const markup = renderToStaticMarkup(
    <PopupExpandingModeButton
      accentClassName="text-accent"
      active
      animate
      description="Capture the current tab"
      icon={TestIcon}
      label="Tab"
      onClick={() => undefined}
    />
  );

  expect(markup).toContain('transition-[flex-grow,background-color,border-color,color]');
  expect(markup).toContain('transition-[left,top,translate,color,filter,scale]');
  expect(markup).toContain('top-1/2');
  expect(markup).toContain('left-2.5');
  expect(markup).not.toContain('w-[148px]');
  expect(markup).not.toContain('transition-[left,transform,color]');
  expect(markup).not.toContain('delay-200');
  expect(markup).not.toContain('delay-60');
  expect(markup).not.toContain('var(--sniptale-color-accent-soft)');
  expect(markup).toContain('motion-reduce:transition-none');
  expect(markup).not.toContain('scale-95');
  expect(markup).toContain('group-hover:scale-110');
  expect(markup).not.toContain('group-hover:-translate-y-px');
  expect(markup).not.toContain('transition-[left,transform,color]');
  expect(markup.match(/<svg/g)).toHaveLength(1);
});
