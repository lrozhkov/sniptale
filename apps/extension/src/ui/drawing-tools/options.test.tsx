import { renderToStaticMarkup } from 'react-dom/server';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { describe, expect, it, vi } from 'vitest';
import {
  DrawingBlurStrengthOptions,
  DrawingOptionsDivider,
  DrawingShapeOptions,
  DrawingWidthOptions,
  DrawingTextOptions,
} from './options';

describe('shared drawing option controls', () => {
  it('keeps the text divider within the same horizontal button height', () => {
    const horizontal = renderToStaticMarkup(<DrawingOptionsDivider extended vertical={false} />);
    const vertical = renderToStaticMarkup(<DrawingOptionsDivider extended vertical />);
    expect(horizontal).toContain('h-5 w-px');
    expect(horizontal).not.toContain('h-9');
    expect(vertical).toContain('h-px w-full');
  });
  it('offers only the canonical quick shapes', () => {
    const markup = renderToStaticMarkup(
      <DrawingShapeOptions value="rectangle" onChange={vi.fn()} />
    );

    expect(markup).toContain('shape.kind-rectangle');
    expect(markup).toContain('shape.kind-ellipse');
    expect(markup).toContain('shape.kind-triangle');
    expect(markup).not.toContain('parallelogram');
  });

  it('renders distinct square pencil width controls', () => {
    const markup = renderToStaticMarkup(
      <DrawingWidthOptions tool="pencil" value={4} values={[2, 4, 8, 16]} onChange={vi.fn()} />
    );

    expect(markup.match(/drawing-width-preview/g)).toHaveLength(4);
    expect(markup).toContain('aspect-square');
    expect(markup).toContain('width:3px');
    expect(markup).toContain('width:12px');
    for (const value of [2, 4, 8, 16]) expect(markup).toContain(`>${value}</span>`);
  });

  it('shows three icon-only blur previews with distinct strengths and named hints', () => {
    const markup = renderToStaticMarkup(
      <DrawingBlurStrengthOptions value={20} onChange={vi.fn()} />
    );

    expect(markup.match(/data-ui="drawing-blur-preview"/g)).toHaveLength(3);
    expect(markup).toContain('filter:blur(0.35px)');
    expect(markup).toContain('filter:blur(1.2px)');
    expect(markup).toContain('filter:blur(2.6px)');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('title="');
    expect(markup).toContain('2px');
    expect(markup).toContain('6px');
    expect(markup).toContain('20px');
    expect(markup.replace(/<[^>]*>/g, '')).toBe('');
  });
  it.each([false, true])('preserves text previews and color order with scope=%s', (scoped) => {
    const markup = renderToStaticMarkup(
      <CommandPressScope value={scoped}>
        <DrawingTextOptions
          backgroundColor={null}
          color="#123456"
          colors={['#123456']}
          floatingBoundaryRef={{ current: null }}
          floatingPlacement="auto"
          fontSize={20}
          fontFamily="sans"
          vertical={false}
          onBackgroundColorChange={vi.fn()}
          onColorChange={vi.fn()}
          onFontSizeChange={vi.fn()}
          onFontFamilyChange={vi.fn()}
        />
      </CommandPressScope>
    );
    expect(markup).toContain('font-family:');
    expect(markup).toContain('>Aa</span>');
    expect(markup).toContain('font-size:13px');
    expect(markup).toContain('font-size:14px');
    expect(markup).toContain('font-size:15.5px');
    const color = markup.indexOf('shared.ui.color-selector');
    expect(markup.lastIndexOf('content.toolbar.drawing-options.text.size-')).toBeLessThan(color);
    expect(markup.lastIndexOf('content.toolbar.drawing-options.text.font-')).toBeLessThan(color);
    expect(color).toBeGreaterThan(0);
  });
});

it('uses neutral property choices only inside the migrated command scope', () => {
  const options = (
    <DrawingWidthOptions tool="pencil" value={4} values={[2, 4]} onChange={vi.fn()} />
  );
  const scoped = renderToStaticMarkup(
    <CommandPressScope.Provider value>{options}</CommandPressScope.Provider>
  );
  expect(scoped.match(/data-command-property="true"/g)).toHaveLength(2);
  expect(scoped).not.toContain('sniptale-glass-toolbar-button--active');
  expect(scoped).not.toContain('!text-[var(--sniptale-color-accent-emphasis)]');
  expect(scoped).toContain('aria-pressed="true"');
  const pending = renderToStaticMarkup(options);
  expect(pending).not.toContain('data-command-property');
  expect(pending).toContain('sniptale-glass-toolbar-button--active');
  expect(pending).toContain('!text-[var(--sniptale-color-accent-emphasis)]');
});
