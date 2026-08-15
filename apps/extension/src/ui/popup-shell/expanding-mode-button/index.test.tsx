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
  expect(markup).toContain('group-hover:-translate-y-px');
  expect(markup).toContain('absolute inset-y-0 left-2.5 flex w-[148px]');
  expect(markup).toContain('Choose an area');
  expect(markup).toContain('title="Area. Choose an area"');
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
  expect(markup).toContain('transition-[opacity,transform]');
  expect(markup).toContain('left-1/2');
  expect(markup).toContain('left-2.5');
  expect(markup).toContain('w-[148px]');
  expect(markup).not.toContain('transition-[left,transform,color]');
  expect(markup).toContain('delay-200');
  expect(markup).toContain('motion-reduce:transition-none');
  expect(markup).not.toContain('scale-95');
  expect(markup).toContain('group-hover:-translate-y-px');
  expect(markup).not.toContain('transition-[left,transform,color]');
  expect(markup.match(/<svg/g)).toHaveLength(2);
});
