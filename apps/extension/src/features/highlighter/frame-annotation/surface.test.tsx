// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../style/defaults';
import { FrameCalloutBadge, resolveFrameCalloutBadgeText } from './callout-badge';
import { getFrameAnnotationCommandSchema } from './commands';
import { createDefaultFrameCallout, createDefaultFrameStepBadge } from './defaults';
import { FrameAnnotationEffectIcon } from './effect-icon';
import { getFrameAnnotationBlurBackdropStyle } from './effect-style';
import {
  FrameAnnotationBlurSurface,
  FrameAnnotationDistortionFilter,
  FrameAnnotationFocusSurface,
} from './effect-surface';
import { FrameAnnotationExportSurface } from './export-surface';
import { FrameAnnotationFloatingToolbar } from './floating-toolbar';
import { createFrameAnnotationSnapshot, normalizeFrameAnnotationSnapshot } from './model';
import { resolveFrameAnnotationVisualScene } from './render-scene';
import { getStepBadgeVisualMetrics } from './step-badge-metrics';
import { getStepBadgeStyle, StepBadgeValue } from './step-badge-surface';

const border = projectBorderPresetToAppliedSettings(DEFAULT_BORDER_PRESET);

function frame(effectMode: 'border' | 'blur' | 'focus' = 'border') {
  return createFrameAnnotationSnapshot(
    {
      id: `frame-${effectMode}`,
      x: 10,
      y: 20,
      width: 160,
      height: 90,
      effectMode,
      borderSettings: border,
    },
    2
  );
}

async function renderExportSurface(props: ComponentProps<typeof FrameAnnotationExportSurface>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<FrameAnnotationExportSurface {...props} />);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const html = host.innerHTML;
  await act(async () => root.unmount());
  host.remove();
  return html;
}

beforeEach(() => vi.restoreAllMocks());

it('normalizes canonical geometry and provides complete shared commands/defaults', () => {
  expect(
    normalizeFrameAnnotationSnapshot({ ...frame(), x: Number.NaN, width: -5, ordering: -2 })
  ).toMatchObject({ x: 0, width: 0, ordering: 0 });
  expect(getFrameAnnotationCommandSchema().map((command) => command.id)).toEqual(
    expect.arrayContaining([
      'effect-border',
      'effect-blur',
      'effect-focus',
      'step-badge',
      'callout',
      'delete',
    ])
  );
  expect(createDefaultFrameStepBadge()).toMatchObject({ enabled: true });
  expect(createDefaultFrameCallout()).toMatchObject({
    enabled: true,
    sourcePresetId: 'system-callout-bubble',
  });
});

it('renders all effect styles, icons, focus masks, and badge metric branches', () => {
  expect(
    getFrameAnnotationBlurBackdropStyle({ blurSettings: { amount: 9, blurType: 'distortion' } })
  ).toMatchObject({ distortionScale: 13.5 });
  expect(
    getFrameAnnotationBlurBackdropStyle({ blurSettings: { amount: 9, blurType: 'pixelate' } })
      .imageRendering
  ).toBe('pixelated');
  expect(
    getFrameAnnotationBlurBackdropStyle({ blurSettings: { amount: 9, blurType: 'solid' } })
      .backdropFilter
  ).toBe('none');
  expect(
    getFrameAnnotationBlurBackdropStyle({ blurSettings: { amount: 9, blurType: 'gaussian' } })
      .backdropFilter
  ).toBe('blur(9px)');
  const borderless = {
    version: 1,
    ordering: 0,
    id: 'borderless',
    x: 0,
    y: 0,
    width: 20,
    height: 20,
  } as const;
  const effects = renderToStaticMarkup(
    <>
      <FrameAnnotationBlurSurface
        frame={{
          ...borderless,
          effectMode: 'blur',
          blurSettings: { amount: 7, blurType: 'gaussian' },
        }}
      />
      <FrameAnnotationDistortionFilter scale={4} />
      <FrameAnnotationFocusSurface
        frames={[{ ...borderless, effectMode: 'focus' }]}
        height={200}
        opacity={-1}
        width={300}
      />
      {(['border', 'blur', 'focus'] as const).map((mode) => (
        <FrameAnnotationEffectIcon key={mode} mode={mode} size={18} />
      ))}
    </>
  );
  expect(effects).toContain('sniptale-distortion-filter');
  expect(effects).toContain('blur(7px)');
  const badge = createDefaultFrameStepBadge();
  const { style, ...plainBadge } = structuredClone(badge);
  expect(style).toBeDefined();
  expect(
    getStepBadgeVisualMetrics({ ...plainBadge, size: 'standard' }, 2).badgeSize
  ).toBeGreaterThan(0);
  expect(
    getStepBadgeVisualMetrics(
      { ...plainBadge, size: 'extra-large', offsetDirections: ['up', 'down', 'left', 'right'] },
      2
    ).offset
  ).toEqual({ x: 0, y: 0 });
  expect(
    getStepBadgeVisualMetrics({ ...badge, offsetDirections: ['right', 'down'] }, 2).offset.x
  ).toBeGreaterThan(0);
  const badgeValueMarkup = renderToStaticMarkup(<StepBadgeValue value={12} />);
  expect(badgeValueMarkup).toContain('12');
  expect(badgeValueMarkup).toContain('font-family:system-ui, -apple-system, sans-serif');
  expect(
    getStepBadgeStyle({
      borderColor: '#000',
      borderWidth: 2,
      settings: { ...badge, manualPlacement: { position: 0.5, side: 'right' } },
      zIndex: 2,
      clickable: true,
    })
  ).toMatchObject({ boxSizing: 'border-box', right: 0 });
  for (const side of ['top', 'bottom', 'left'] as const) {
    expect(
      getStepBadgeStyle({
        borderColor: '#000',
        borderWidth: 2,
        settings: { ...badge, manualPlacement: { position: 0.5, side } },
        zIndex: 2,
        clickable: false,
      })
    ).toMatchObject({ position: 'absolute' });
  }
  const anchoredBadge = structuredClone(badge);
  for (const anchor of [
    'top-left',
    'top-center',
    'top-right',
    'middle-left',
    'center',
    'middle-right',
    'bottom-left',
    'bottom-center',
    'bottom-right',
  ] as const) {
    expect(
      getStepBadgeStyle({
        borderColor: '#000',
        borderWidth: 2,
        settings: { ...anchoredBadge, anchor },
        zIndex: 2,
        clickable: false,
      })
    ).toMatchObject({ position: 'absolute' });
  }
});

it('resolves border and fallback visual scenes without changing semantic geometry', () => {
  expect(resolveFrameAnnotationVisualScene({ frame: frame(), state: 'editing' })).toMatchObject({
    borderWidth: expect.any(Number),
    frameStyle: expect.any(Object),
  });
  expect(
    resolveFrameAnnotationVisualScene({
      frame: { id: 'plain', x: 0, y: 0, width: 10, height: 10 },
      state: 'idle',
    }).borderColor
  ).toContain('accent');
});

it('renders ordered border, blur, focus, badge, and callout export surfaces', async () => {
  const callout = createDefaultFrameCallout();
  callout.content = { bodyHtml: '<b>Body</b>', titleText: 'Title' };
  callout.style.title.enabled = true;
  callout.style.badge.enabled = true;
  callout.style.badge.placement = 'title-start';
  const snapshots = [
    { ...frame('border'), stepBadge: createDefaultFrameStepBadge(), callout },
    {
      ...frame('blur'),
      id: 'borderless-callout',
      blurSettings: { amount: 4, blurType: 'gaussian', showBorder: false } as const,
      callout: structuredClone(callout),
    },
    { ...frame('blur'), id: 'blur', blurSettings: { amount: 8, blurType: 'gaussian' } as const },
    { ...frame('focus'), id: 'focus', focusSettings: { opacity: 0.6 } },
  ];
  const html = await renderExportSurface({
    baseImageUrl: 'blob:base',
    height: 400,
    snapshots,
    width: 600,
  });
  expect(html).toContain('sniptale-callout');
  expect(html).toContain('<b>Body</b>');
  expect(html).toContain('sniptale-step-badge');
  expect(html).toContain('--sniptale-color-surface-base: #ffffff');
});

it('covers callout badge fallbacks and disabled/measurement variants', () => {
  const badge = createDefaultFrameCallout().style.badge;
  expect(renderToStaticMarkup(<FrameCalloutBadge badge={{ ...badge, enabled: false }} />)).toBe('');
  expect(
    renderToStaticMarkup(
      <FrameCalloutBadge
        badge={{ ...badge, enabled: true, shape: 'square' }}
        isMeasurement
        text="A"
      />
    )
  ).toContain('data-sniptale-callout-badge-measure');
  expect(
    resolveFrameCalloutBadgeText({
      badgeText: '  ',
      bodyHtml: '<b>Body</b>',
      titleEnabled: true,
      titleText: 'Title',
    })
  ).toBe('Title');
  expect(
    resolveFrameCalloutBadgeText({
      badgeText: '',
      bodyHtml: '<b>Body</b>',
      titleEnabled: false,
      titleText: '',
    })
  ).toBe('Body');
});

it('renders every callout side, connector, accent edge, and body badge placement', async () => {
  const sides = ['top', 'right', 'bottom', 'left'] as const;
  const snapshots = sides.flatMap((side, index) => {
    const wedge = createDefaultFrameCallout();
    wedge.placement.side = side;
    wedge.content = { bodyHtml: `<em>${side}</em>`, titleText: side };
    wedge.style.title.enabled = index % 2 === 0;
    wedge.style.badge.enabled = true;
    wedge.style.badge.placement = index % 2 === 0 ? 'title-end' : 'body-start';
    wedge.style.accentEdge.enabled = true;
    wedge.style.accentEdge.side = side;
    wedge.style.connector.kind = 'wedge';
    const line = structuredClone(wedge);
    line.style.connector.kind = 'line';
    line.style.surface.shadow = 0;
    if (index === 0) line.placement.manualPlacement = { centerOffsetX: 3, centerOffsetY: 4 };
    return [
      { ...frame(), id: `wedge-${side}`, callout: wedge },
      { ...frame(), id: `line-${side}`, callout: line },
    ];
  });
  const html = await renderExportSurface({
    baseImageUrl: 'blob:base',
    height: 500,
    snapshots,
    width: 700,
  });
  expect(html.match(/class="sniptale-callout"/g)?.length).toBe(8);
  const none = createDefaultFrameCallout();
  none.style.connector.kind = 'none';
  none.placement.side = 'auto';
  none.placement.anchor = 'bottom-center';
  expect(
    await renderExportSurface({
      baseImageUrl: 'blob:base',
      height: 100,
      snapshots: [{ ...frame(), callout: none }],
      width: 100,
    })
  ).toContain('sniptale-callout');
});

it('dispatches shared floating-toolbar commands without leaking pointer events', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const onCommand = vi.fn();
  const root = createRoot(host);
  await act(async () =>
    root.render(<FrameAnnotationFloatingToolbar effectMode="border" onCommand={onCommand} />)
  );
  const buttons = [...host.querySelectorAll('button')];
  await act(async () =>
    buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  );
  expect(host.querySelectorAll('button').length).toBeGreaterThan(buttons.length);
  const focus = [...host.querySelectorAll('button')].at(-1);
  await act(async () =>
    focus?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  );
  expect(onCommand).toHaveBeenCalledWith('effect-focus');

  const effectSettings = vi.fn();
  const stepSettings = vi.fn();
  const calloutSettings = vi.fn();
  await act(async () =>
    root.render(
      <FrameAnnotationFloatingToolbar
        calloutEnabled={false}
        effectMode="blur"
        onCalloutSettingsClick={calloutSettings}
        onCommand={onCommand}
        onEffectSettingsClick={effectSettings}
        onStepSettingsClick={stepSettings}
        stepBadgeEnabled={false}
      />
    )
  );
  const actionButtons = [...host.querySelectorAll<HTMLButtonElement>('button')];
  await act(async () => {
    actionButtons[0]?.click();
    actionButtons[1]?.click();
    actionButtons[2]?.click();
    actionButtons.slice(3).forEach((button) => button.click());
  });
  expect(effectSettings).toHaveBeenCalled();
  expect(stepSettings).toHaveBeenCalled();
  expect(calloutSettings).toHaveBeenCalled();
  expect(onCommand).toHaveBeenCalledWith('step-badge');
  expect(onCommand).toHaveBeenCalledWith('callout');
  await act(async () => root.unmount());
  host.remove();
});

it('omits the page-owned edit action when the host does not implement it', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(
      <FrameAnnotationFloatingToolbar effectMode="border" onCommand={vi.fn()} showEdit={false} />
    )
  );
  expect(host.querySelector('.lucide-pencil')).toBeNull();
  await act(async () => root.unmount());
  host.remove();
});
