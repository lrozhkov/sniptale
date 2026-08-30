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
  expect(markup).toContain('M 21 15 L 0 31 L 21 24');
  expect(markup).toContain('#ffffffff');
  expect(markup).toContain('shared.callout-preview.surface-html');
  expect(markup).not.toContain('shared.callout-preview.connector');
  expect(markup).toContain('h-9 w-16');
  expect(markup).toContain('content.callout.surface-contour');
  expect(markup).toContain('stroke-dasharray="4 2.5"');
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

  expect(markup).toContain('fill="#00000000"');
  expect(markup).toContain('<foreignObject');
});

it('keeps wedge Paint card-relative and reuses silhouette elevation and outline layers', () => {
  const preset = createSystemCalloutPresetCatalog().find(
    (entry) => entry.id === 'system-callout-header-card'
  )!;
  const style = {
    ...preset.style,
    connector: { ...preset.style.connector, kind: 'wedge' as const },
    surface: {
      ...preset.style.surface,
      fillPaint: {
        kind: 'gradient' as const,
        gradient: {
          type: 'linear' as const,
          angle: 135,
          interpolation: 'oklab' as const,
          repeat: { enabled: false, span: 1 },
          stops: [
            { id: 'start', color: '#60a5fa38', position: 0, midpoint: 0.5 },
            { id: 'end', color: '#a78bfa2e', position: 1, midpoint: 0.5 },
          ],
        },
      },
    },
  };
  const markup = renderToStaticMarkup(<CalloutPresetPreview style={style} />);

  expect(markup).toContain('left:29px');
  expect(markup).toContain('<linearGradient');
  expect(markup).toContain('content.callout.surface-elevation');
  expect(markup).toContain('<feComposite');
  expect(markup).toContain('data-outline-band="outer"');
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

  const topLeft = renderToStaticMarkup(
    <CalloutPresetPreview placement={{ anchor: 'top-left', side: 'top' }} style={preset.style} />
  );
  expect(topLeft).toContain('cx="3" cy="29"');

  const center = renderToStaticMarkup(
    <CalloutPresetPreview placement={{ anchor: 'center', side: 'top' }} style={preset.style} />
  );
  expect(center).toContain('cx="16.5" cy="37"');
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
  expect(markup).toContain('style="stroke:rgb(255, 0, 0);stroke-dasharray:6 3"');
});
