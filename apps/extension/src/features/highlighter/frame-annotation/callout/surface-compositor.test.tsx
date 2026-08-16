// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Gradient } from '@sniptale/foundation/paint';
import { applySurfaceStyleToCallout } from '../../surface-style/operations';
import { resolveCalloutSurfaceProjection } from '../../surface-style/card-projection';
import { getSystemSurfaceStylePresets } from '../../surface-style/system-presets';
import { createDefaultCalloutSettings } from './model';
import { getDynamicTailState } from './dynamic-tail';
import { CalloutSurfaceCompositor } from './surface-compositor';

const CSS_CONTEXT = {
  color: '#1f2937',
  fontFamily: 'system-ui',
  fontSize: 16,
  fontStyle: 'italic',
  fontWeight: 400,
  letterSpacing: 0,
  lineHeight: 1.5,
} as const;

function createWedge(side: 'top' | 'right' | 'bottom' | 'left' = 'top') {
  return getDynamicTailState({
    borderRadius: 10,
    borderWidth: 2,
    bubbleRect: { x: 120, y: 20, width: 160, height: 48 },
    frameRect: { x: 100, y: 100, width: 160, height: 120 },
    preferredSide: side,
    tailSize: 8,
  });
}

function renderWedge(
  style = createDefaultCalloutSettings().style,
  side?: Parameters<typeof createWedge>[0]
) {
  return renderToStaticMarkup(
    <CalloutSurfaceCompositor
      connector={createWedge(side)}
      cssContext={CSS_CONTEXT}
      dimensions={{ width: 160, height: 48 }}
      projection={resolveCalloutSurfaceProjection(style)}
      visualScale={1}
    />
  );
}

function renderSurface(
  style: ReturnType<typeof createDefaultCalloutSettings>['style'],
  wedge: boolean
) {
  return renderToStaticMarkup(
    <CalloutSurfaceCompositor
      connector={wedge ? createWedge() : null}
      cssContext={CSS_CONTEXT}
      dimensions={{ width: 160, height: 48 }}
      projection={resolveCalloutSurfaceProjection(style)}
      visualScale={1}
    />
  );
}

const gradientStops = [
  { id: 'start', color: '#112233ff', position: 0, midpoint: 0.5 },
  { id: 'end', color: '#ddeeffff', position: 1, midpoint: 0.5 },
];

function renderGradient(gradient: Gradient) {
  const style = createDefaultCalloutSettings().style;
  style.surface.fillPaint = { kind: 'gradient', gradient };
  return renderWedge(style);
}

describe('CalloutSurfaceCompositor', () => {
  it.each(['top', 'right', 'bottom', 'left'] as const)(
    'owns the complete %s wedge silhouette without a second HTML card surface',
    (side) => {
      const style = createDefaultCalloutSettings().style;
      style.surface.fillPaint = { kind: 'solid', color: '#ffffff80' };
      const markup = renderWedge(style, side);

      expect(markup).toContain('data-ui="content.callout.surface-compositor"');
      expect(markup).toContain('data-ui="content.callout.surface-paint"');
      expect(markup).toContain('data-ui="content.callout.surface-contour"');
      expect(markup).toContain('fill="#ffffff80"');
      expect(markup).toContain('clip-path:path(&quot;');
      expect(markup).not.toContain('content.callout.unified-surface');
      expect(markup).not.toContain('box-shadow:0 ');
    }
  );

  it.each(getSystemSurfaceStylePresets())(
    'projects $id through the same wedge compositor',
    (preset) => {
      const style = applySurfaceStyleToCallout(createDefaultCalloutSettings().style, preset.style);
      const markup = renderWedge(style);

      expect(markup).toContain('content.callout.surface-paint');
      expect(markup).toContain('content.callout.surface-contour');
      if (preset.style.surfaceCss.includes('backdrop-filter')) {
        expect(markup).toContain('backdrop-filter:');
      }
      if (preset.id === 'system-surface-soft-elevated') {
        expect(markup).toContain('content.callout.surface-css-probe');
        expect(markup).toContain('content.callout.surface-elevation');
      }
    }
  );

  it('keeps the gradient coordinate definition on the card box rather than the extended bounds', () => {
    const clearTint = getSystemSurfaceStylePresets().find(
      (preset) => preset.id === 'system-surface-clear-tint'
    )!;
    const style = applySurfaceStyleToCallout(createDefaultCalloutSettings().style, clearTint.style);
    const wedge = createWedge();
    const markup = renderToStaticMarkup(
      <CalloutSurfaceCompositor
        connector={wedge}
        cssContext={CSS_CONTEXT}
        dimensions={{ width: 160, height: 48 }}
        projection={resolveCalloutSurfaceProjection(style)}
        visualScale={1}
      />
    );

    expect(wedge.geometry.contentRect).toMatchObject({ width: 160, height: 48 });
    expect(wedge.geometry.bounds.height).toBeGreaterThan(48);
    expect(markup).toContain('<linearGradient');
    expect(markup).toContain('gradientUnits="userSpaceOnUse"');
    expect(markup).toContain('backdrop-filter:blur(10px) saturate(1.25)');
  });
});

describe('CalloutSurfaceCompositor Paint', () => {
  it.each([
    {
      expected: 'spreadMethod="pad"',
      gradient: {
        type: 'radial',
        center: { x: 0.35, y: 0.6 },
        radius: { x: 0.45, y: 0.7 },
        interpolation: 'srgb',
        repeat: { enabled: false, span: 1 },
        stops: gradientStops,
      } satisfies Gradient,
      layer: '<radialGradient',
    },
    {
      expected: 'spreadMethod="repeat"',
      gradient: {
        type: 'radial',
        center: { x: 0.5, y: 0.5 },
        radius: { x: 0.4, y: 0.4 },
        interpolation: 'oklab',
        repeat: { enabled: true, span: 0.5 },
        stops: gradientStops,
      } satisfies Gradient,
      layer: '<radialGradient',
    },
    {
      expected: 'clip-path="url(#callout-paint-clip-',
      gradient: {
        type: 'conic',
        center: { x: 0.5, y: 0.5 },
        startAngle: 30,
        interpolation: 'srgb',
        repeat: { enabled: false, span: 1 },
        stops: gradientStops,
      } satisfies Gradient,
      layer: ' A ',
    },
    {
      expected: 'clip-path="url(#callout-paint-clip-',
      gradient: {
        type: 'conic',
        center: { x: 0.25, y: 0.75 },
        startAngle: 120,
        interpolation: 'oklab',
        repeat: { enabled: true, span: 0.4 },
        stops: gradientStops,
      } satisfies Gradient,
      layer: ' A ',
    },
    {
      expected: 'spreadMethod="repeat"',
      gradient: {
        type: 'linear',
        angle: 20,
        interpolation: 'srgb',
        repeat: { enabled: true, span: 0.6 },
        stops: gradientStops,
      } satisfies Gradient,
      layer: '<linearGradient',
    },
  ])('renders the $gradient.type Paint branch', ({ expected, gradient, layer }) => {
    const markup = renderGradient(gradient);

    expect(markup).toContain(layer);
    expect(markup).toContain(expected);
  });

  it('renders custom paint, outline variants, spread, and blurred inset effects on the silhouette', () => {
    const style = createDefaultCalloutSettings().style;
    style.customCss = [
      '[card]',
      'background: #123456;',
      'box-shadow: 0 2px 4px 3px #00000080, inset 0 1px 4px 2px #ffffff80;',
      'outline-color: #abcdef;',
      'outline-offset: 2px;',
      'outline-style: dotted;',
      'outline-width: 2px;',
    ].join('\n');
    const markup = renderWedge(style);

    expect(markup).toContain('background:#123456');
    expect(markup).toContain('stroke="#000"');
    expect(markup).toContain('stroke="#abcdef"');
    expect(markup).toContain('stroke-dasharray="0 5"');
    expect(markup).toContain('stroke-linecap="round"');
    expect(markup).toContain('content.callout.surface-css-probe');
  });

  it('keeps typed gradient coordinates when a custom background longhand is present', () => {
    const style = createDefaultCalloutSettings().style;
    style.surface.fillPaint = {
      kind: 'gradient',
      gradient: {
        type: 'linear',
        angle: 90,
        interpolation: 'srgb',
        repeat: { enabled: false, span: 1 },
        stops: gradientStops,
      },
    };
    style.customCss = '[card]\nbackground-repeat: no-repeat;';
    const markup = renderWedge(style);

    expect(markup).toContain('background-size:160px 48px');
    expect(markup).toContain('background-repeat:no-repeat');
  });

  it('supports a dashed outline without a border', () => {
    const style = createDefaultCalloutSettings().style;
    style.surface.borderWidth = 0;
    style.customCss =
      '[card]\noutline-color: #abcdef;\noutline-style: dashed;\noutline-width: 2px;';
    const markup = renderWedge(style);

    expect(markup).toContain('stroke-dasharray="8 5"');
    expect(markup).not.toContain(`stroke="${style.surface.borderColor}"`);
  });

  it.each([
    ['wedge', true],
    ['rect', false],
  ] as const)('keeps a negative outline offset as an inner %s contour', (_kind, wedge) => {
    const style = createDefaultCalloutSettings().style;
    style.customCss = [
      '[card]',
      'outline-color: #abcdef;',
      'outline-offset: -2px;',
      'outline-style: solid;',
      'outline-width: 1px;',
    ].join('\n');
    const markup = renderSurface(style, wedge);

    expect(markup).toContain('data-outline-band="inner"');
    expect(markup).not.toContain('data-outline-band="outer"');
    expect(markup).toContain('stroke="#000" stroke-width="2"');
    expect(markup).toMatch(/stroke="#abcdef"[^>]+stroke-width="4"/u);
  });

  it.each([
    { bands: 2, style: 'double', token: 'stroke="#abcdef"' },
    { bands: 2, style: 'groove', token: 'outline-inset)' },
    { bands: 2, style: 'ridge', token: 'outline-outset)' },
    { bands: 1, style: 'inset', token: 'outline-inset)' },
    { bands: 1, style: 'outset', token: 'outline-outset)' },
    { bands: 1, style: 'auto', token: 'stroke="#abcdef"' },
    { bands: 0, style: 'hidden', token: '' },
  ])('preserves the browser-resolved $style outline strategy', ({ bands, style, token }) => {
    const settings = createDefaultCalloutSettings().style;
    settings.customCss = [
      '[card]',
      'outline-color: #abcdef;',
      'outline-offset: 1px;',
      `outline-style: ${style};`,
      'outline-width: 6px;',
    ].join('\n');
    const markup = renderSurface(settings, false);

    expect(markup.match(/data-outline-band="outer"/gu) ?? []).toHaveLength(bands);
    if (token) expect(markup).toContain(token);
  });
});

describe('CalloutSurfaceCompositor effects', () => {
  it('clips outer shadow alpha out of the comment interior', () => {
    const style = createDefaultCalloutSettings().style;
    style.surface.fillPaint = { kind: 'solid', color: '#ffffff00' };
    style.surface.shadow = 12;
    const markup = renderWedge(style);

    expect(markup).toContain('result="colored-shadow"');
    expect(markup).toContain(
      '<feComposite in="colored-shadow" in2="SourceAlpha" operator="out"></feComposite>'
    );
  });

  it('keeps configured shadow visible until custom CSSOM shadow resolution completes', () => {
    const style = createDefaultCalloutSettings().style;
    style.surface.shadow = 12;
    style.customCss = '[card]\nbox-shadow: 0 0.5em 1em red;';
    const withoutCustomPaint = renderWedge(style);

    expect(withoutCustomPaint).toContain('content.callout.surface-css-probe');
    expect(withoutCustomPaint).toContain('content.callout.surface-elevation');

    style.customCss = '[card]\nbackground: #123456;\nbox-shadow: 0 0.5em 1em red;';
    const withCustomPaint = renderWedge(style);
    expect(withCustomPaint).toContain('background:#123456');
    expect(withCustomPaint).toContain('content.callout.surface-css-probe');
    expect(withCustomPaint).toContain('content.callout.surface-elevation');
  });

  it('resolves browser-computed shadow and outline lengths before painting effects', async () => {
    const style = createDefaultCalloutSettings().style;
    style.surface.shadow = 12;
    style.customCss = [
      '[card]',
      'background: #123456;',
      'box-shadow: red 0 0.5em 1em;',
      'outline-color: #abcdef;',
      'outline-offset: 0.5em;',
      'outline-style: solid;',
      'outline-width: thin;',
    ].join('\n');
    const computedStyle = {
      boxShadow: 'rgb(255, 0, 0) 0px 8px 16px 0px',
      outlineColor: 'rgb(171, 205, 239)',
      outlineOffset: '8px',
      outlineStyle: 'solid',
      outlineWidth: '1px',
    } as CSSStyleDeclaration;
    const computedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue(computedStyle);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <CalloutSurfaceCompositor
          connector={createWedge()}
          cssContext={CSS_CONTEXT}
          dimensions={{ width: 160, height: 48 }}
          projection={resolveCalloutSurfaceProjection(style)}
          visualScale={1}
        />
      );
    });

    expect(host.innerHTML).toContain('content.callout.surface-elevation');
    expect(host.innerHTML).toContain('flood-color="rgb(255, 0, 0)"');
    expect(host.innerHTML).toContain('stroke="#000" stroke-width="16"');
    expect(host.innerHTML).toContain('stroke="rgb(171, 205, 239)"');
    expect(host.innerHTML).toContain('stroke-width="18"');

    await act(async () => root.unmount());
    computedStyleSpy.mockRestore();
  });

  it.each([
    {
      css: 'outline-offset: 0.5em;\noutline-width: 2px;',
      computedOffset: '8px',
      computedWidth: '2px',
      expectedGap: 'stroke-width="16"',
      expectedStroke: 'stroke-width="20"',
    },
    {
      css: 'outline-offset: 2px;\noutline-width: thin;',
      computedOffset: '2px',
      computedWidth: '1px',
      expectedGap: 'stroke-width="4"',
      expectedStroke: 'stroke-width="6"',
    },
  ])(
    'keeps both outline fields when CSSOM resolves mixed units: $css',
    async ({ computedOffset, computedWidth, css, expectedGap, expectedStroke }) => {
      const style = createDefaultCalloutSettings().style;
      style.customCss = `[card]\noutline-color: currentColor;\noutline-style: solid;\n${css}`;
      const computedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
        outlineColor: 'rgb(31, 41, 55)',
        outlineOffset: computedOffset,
        outlineStyle: 'solid',
        outlineWidth: computedWidth,
      } as CSSStyleDeclaration);
      const host = document.createElement('div');
      const root = createRoot(host);

      await act(async () => {
        root.render(
          <CalloutSurfaceCompositor
            connector={createWedge()}
            cssContext={CSS_CONTEXT}
            dimensions={{ width: 160, height: 48 }}
            projection={resolveCalloutSurfaceProjection(style)}
            visualScale={1}
          />
        );
      });

      expect(host.innerHTML).toContain(expectedGap);
      expect(host.innerHTML).toContain(expectedStroke);
      const probe = host.querySelector<HTMLElement>(
        '[data-ui="content.callout.surface-css-probe"]'
      );
      expect(probe?.style.outlineOffset).toBe(css.includes('0.5em') ? '0.5em' : '2px');
      expect(probe?.style.outlineWidth).toBe(css.includes('thin') ? 'thin' : '2px');

      await act(async () => root.unmount());
      computedStyleSpy.mockRestore();
    }
  );
});

describe('CalloutSurfaceCompositor CSS authority', () => {
  it('preserves configured shadow when custom shadow CSS resolves to none', async () => {
    const style = createDefaultCalloutSettings().style;
    style.surface.shadow = 12;
    style.customCss = '[card]\nbox-shadow: 0 2px -4px notacolor;';
    const computedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      boxShadow: 'none',
    } as CSSStyleDeclaration);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <CalloutSurfaceCompositor
          connector={createWedge()}
          cssContext={CSS_CONTEXT}
          dimensions={{ width: 160, height: 48 }}
          projection={resolveCalloutSurfaceProjection(style)}
          visualScale={1}
        />
      );
    });

    expect(host.innerHTML).toContain('content.callout.surface-elevation');
    expect(host.innerHTML).toContain('content.callout.surface-css-probe');

    await act(async () => root.unmount());
    computedStyleSpy.mockRestore();
  });

  it('resolves CSS effects in the card color and typography context', async () => {
    const style = createDefaultCalloutSettings().style;
    style.surface.shadow = 12;
    style.surface.shadowColor = '#ff0000';
    style.customCss = '[card]\nbox-shadow: 0 0.5em 1em currentColor;';
    const computedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      boxShadow: 'rgb(31, 41, 55) 0px 8px 16px 0px',
    } as CSSStyleDeclaration);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <CalloutSurfaceCompositor
          connector={createWedge()}
          cssContext={CSS_CONTEXT}
          dimensions={{ width: 160, height: 48 }}
          projection={resolveCalloutSurfaceProjection(style)}
          visualScale={1}
        />
      );
    });

    const probe = host.querySelector<HTMLElement>('[data-ui="content.callout.surface-css-probe"]');
    expect(probe?.style.color).toBe('rgb(31, 41, 55)');
    expect(probe?.style.fontFamily).toBe('system-ui');
    expect(probe?.style.fontSize).toBe('16px');
    expect(probe?.style.fontStyle).toBe('italic');
    expect(host.innerHTML).toContain('flood-color="rgb(31, 41, 55)"');
    expect(host.innerHTML).toContain('flood-color="#ff0000"');

    await act(async () => root.unmount());
    computedStyleSpy.mockRestore();
  });

  it('scales custom paint, backdrop, and post effects through one logical CSS plane', () => {
    const style = createDefaultCalloutSettings().style;
    style.customCss = [
      '[card]',
      'background: linear-gradient(90deg, red 6px, blue 12px);',
      'backdrop-filter: blur(9px);',
      'filter: blur(3px);',
    ].join('\n');
    const markup = renderToStaticMarkup(
      <CalloutSurfaceCompositor
        connector={null}
        cssContext={CSS_CONTEXT}
        dimensions={{ width: 43, height: 29 }}
        projection={resolveCalloutSurfaceProjection(style)}
        visualScale={1 / 3}
      />
    );

    expect(markup).toContain('content.callout.surface-effects');
    expect(markup).toContain('transform:scale(0.3333333333333333)');
    expect(markup).toContain('transform:scale(3)');
    expect(markup).toContain('width:129px');
    expect(markup).toContain('backdrop-filter:blur(9px)');
    expect(markup).toContain('filter:blur(3px)');
    expect(markup).toContain('red 6px');
  });

  it('renders outline offset as a masked gap instead of adding it to visible thickness', () => {
    const header = createDefaultCalloutSettings().style;
    header.customCss = [
      '[card]',
      'outline-color: #abcdef;',
      'outline-offset: 3px;',
      'outline-style: solid;',
      'outline-width: 1px;',
    ].join('\n');
    const markup = renderWedge(header);

    expect(markup).toContain('data-outline-band="outer"');
    expect(markup).toContain('stroke="#000" stroke-width="6"');
    expect(markup).toContain('stroke="#abcdef"');
    expect(markup).toContain('stroke-width="8"');
  });

  it('combines Clear Tint inset highlight with the configured outer shadow', async () => {
    const clearTint = getSystemSurfaceStylePresets().find(
      (preset) => preset.id === 'system-surface-clear-tint'
    )!;
    const style = applySurfaceStyleToCallout(createDefaultCalloutSettings().style, clearTint.style);
    style.surface.shadow = 12;
    const computedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      boxShadow: 'inset rgb(255, 255, 255) 0px 1px 0px 0px',
    } as CSSStyleDeclaration);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <CalloutSurfaceCompositor
          connector={createWedge()}
          cssContext={CSS_CONTEXT}
          dimensions={{ width: 160, height: 48 }}
          projection={resolveCalloutSurfaceProjection(style)}
          visualScale={1}
        />
      );
    });

    expect(host.innerHTML).toContain('content.callout.surface-elevation');
    expect(host.innerHTML).toContain('stroke="rgb(255, 255, 255)"');

    await act(async () => root.unmount());
    computedStyleSpy.mockRestore();
  });

  it('combines arbitrary outer Surface CSS with the configured Shadow', async () => {
    const style = createDefaultCalloutSettings().style;
    style.surface.shadow = 12;
    style.customCss = '[card]\nbox-shadow: 0 10px 24px rgba(17, 24, 39, 0.35);';
    const computedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      boxShadow: 'rgba(17, 24, 39, 0.35) 0px 10px 24px 0px',
    } as CSSStyleDeclaration);
    const host = document.createElement('div');
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <CalloutSurfaceCompositor
          connector={createWedge()}
          cssContext={CSS_CONTEXT}
          dimensions={{ width: 160, height: 48 }}
          projection={resolveCalloutSurfaceProjection(style)}
          visualScale={1}
        />
      );
    });

    expect(host.innerHTML.match(/content.callout.surface-elevation/gu)).toHaveLength(2);
    expect(host.innerHTML).toContain('flood-color="rgba(17, 24, 39, 0.35)"');

    await act(async () => root.unmount());
    computedStyleSpy.mockRestore();
  });

  it('uses the same compositor for a rectangular line surface', () => {
    const style = createDefaultCalloutSettings().style;
    style.connector.kind = 'line';
    const markup = renderToStaticMarkup(
      <CalloutSurfaceCompositor
        connector={null}
        cssContext={CSS_CONTEXT}
        dimensions={{ width: 160, height: 48 }}
        projection={resolveCalloutSurfaceProjection(style)}
        visualScale={1}
      />
    );

    expect(markup).toContain('<rect');
    expect(markup).toContain('clip-path:inset(0 round');
    expect(markup).toContain('content.callout.surface-elevation');
  });
});
