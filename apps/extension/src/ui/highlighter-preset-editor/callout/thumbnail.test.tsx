// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { createSystemCalloutPresetCatalog } from '../../../features/highlighter/callout-presets/catalog';
import { CalloutPresetPreview } from './thumbnail';

it('renders a compact callout scene with a target, connector, and styled surface', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const style = {
    ...preset.style,
    surface: {
      ...preset.style.surface,
      borderColor: '#ff7a00',
      borderStyle: 'dashed' as const,
      borderWidth: 2,
    },
    title: {
      ...preset.style.title,
      dividerColor: '#2563eb',
      dividerStyle: 'dotted' as const,
      dividerWidth: 2,
      enabled: true,
    },
  };
  const markup = renderToStaticMarkup(<CalloutPresetPreview compact style={style} />);

  expect(markup).toContain('shared.callout-preview.target');
  expect(markup).toContain('<svg');
  expect(markup).toContain('M 50 19 L 50 28 L 29 35 Z');
  expect(markup).toContain('#2b3038ff');
  expect(markup).toContain('shared.callout-preview.surface-html');
  expect(markup).toContain('h-9 w-16');
  expect(markup).toContain('shared.callout-preview.outline');
  expect(markup).toContain('stroke-dasharray="8 5"');
  expect(markup).toContain('border-bottom:2px dotted #2563eb');
});

it('shows transparent surfaces through the shared HTML/CSS card projection', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const markup = renderToStaticMarkup(
    <CalloutPresetPreview
      style={{
        ...preset.style,
        surface: { ...preset.style.surface, fillPaint: { kind: 'solid', color: '#00000000' } },
      }}
    />
  );

  expect(markup).toContain('background:#00000000');
  expect(markup).toContain('<foreignObject');
});

it('renders the angled connector preview as a short landing followed by a diagonal', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const markup = renderToStaticMarkup(
    <CalloutPresetPreview
      style={{
        ...preset.style,
        connector: { ...preset.style.connector, kind: 'line', routing: 'polyline' },
      }}
    />
  );

  expect(markup).toContain('M 50 25 L 41 25 L 29 35');
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

it('previews an accent edge as part of the rounded surface contour', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const markup = renderToStaticMarkup(
    <CalloutPresetPreview
      style={{
        ...preset.style,
        accentEdge: {
          color: '#f97316',
          enabled: true,
          lineStyle: 'solid',
          side: 'right',
          width: 4,
        },
      }}
    />
  );

  expect(markup).toContain('data-ui="shared.callout-preview.accent-edge"');
  expect(markup).toContain('stroke="#f97316"');
  expect(markup).toContain('<clipPath');
  expect(markup).toContain('d="M 93 4 V 33"');
});

it('previews safely scoped custom styles on their matching callout parts', () => {
  const preset = createSystemCalloutPresetCatalog()[0]!;
  const markup = renderToStaticMarkup(
    <CalloutPresetPreview
      style={{
        ...preset.style,
        connector: { ...preset.style.connector, kind: 'line' },
        customCss: [
          '[card]',
          'filter: drop-shadow(0 2px 3px #000);',
          '[connector]',
          'opacity: .5;',
          'stroke: #ff0000;',
          'stroke-dasharray: 6 3;',
        ].join('\n'),
      }}
    />
  );

  expect(markup).toContain('filter:drop-shadow(0 2px 3px #000)');
  expect(markup).toContain('data-ui="shared.callout-preview.connector"');
  expect(markup).toContain('style="opacity:0.5"');
  expect(markup).toContain('data-ui="shared.callout-preview.connector-line"');
  expect(markup).toContain('style="stroke:#ff0000;stroke-dasharray:6 3"');
});
