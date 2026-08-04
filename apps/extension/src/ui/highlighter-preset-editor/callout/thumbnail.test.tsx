import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { CalloutPresetPreview } from './thumbnail';

it('renders a compact callout scene with a target, connector, and styled surface', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const style = {
    ...preset.style,
    surface: { ...preset.style.surface, borderColor: '#ff7a00', borderWidth: 2 },
  };
  const markup = renderToStaticMarkup(<CalloutPresetPreview compact style={style} />);

  expect(markup).toContain('shared.callout-preview.target');
  expect(markup).toContain('<svg');
  expect(markup).toContain('M 50 19 L 50 28 L 29 35 Z');
  expect(markup).toContain(style.surface.backgroundColor);
  expect(markup).toContain('h-11 w-[4.5rem]');
  expect(markup).toContain('shared.callout-preview.outline');
});

it('shows transparent surfaces with a checker pattern instead of an empty thumbnail', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const markup = renderToStaticMarkup(
    <CalloutPresetPreview
      style={{
        ...preset.style,
        surface: { ...preset.style.surface, backgroundColor: 'transparent' },
      }}
    />
  );

  expect(markup).toContain('<pattern');
  expect(markup).toContain('fill="url(#callout-checker-');
});

it('marks the preset default anchor in the live preview', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const markup = renderToStaticMarkup(
    <CalloutPresetPreview
      placement={{ anchor: 'bottom-right', side: 'bottom' }}
      style={preset.style}
    />
  );

  expect(markup).toContain('data-callout-placement="bottom-right"');
  expect(markup).toContain('cx="30" cy="45"');
});
