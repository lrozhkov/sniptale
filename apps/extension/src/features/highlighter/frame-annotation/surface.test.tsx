// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { projectBorderPresetToAppliedSettings } from '@sniptale/runtime-contracts/highlighter/border-preset';
import { DEFAULT_BORDER_PRESET } from '../style/defaults';
import { FrameCalloutBadge, resolveFrameCalloutBadgeText } from './callout-badge';
import { getFrameAnnotationCommandSchema } from './commands';
import { translate } from '../../../platform/i18n';
import { createDefaultFrameCallout, createDefaultFrameStepBadge } from './defaults';
import { FrameAnnotationEffectIcon } from './effect-icon';
import { getFrameAnnotationBlurBackdropStyle } from './effect-style';
import {
  FrameAnnotationBlurSurface,
  FrameAnnotationDistortionFilter,
  FrameAnnotationFocusSurface,
} from './effect-surface';
import { FrameAnnotationExportSurface } from './export-surface';
import {
  FrameAnnotationFloatingToolbar,
  FrameAnnotationToolbarActionButtons,
  FrameAnnotationToolbarAddCalloutButton,
} from './floating-toolbar';
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
    expect.arrayContaining(['effect-blur', 'effect-focus', 'step-badge', 'callout', 'delete'])
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
        blurAmount={9}
        edgeOverscan={0.5}
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
  expect(effects).toContain('blur(9px)');
  expect(effects).toContain('width:300.5px');
  expect(effects).toContain('height:200.5px');
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
      visualScale: 0.5,
    })
  ).toMatchObject({
    boxSizing: 'border-box',
    left: '100%',
    transform: expect.stringContaining('scale(0.5) translateZ(0)'),
    willChange: 'transform',
  });
  const cornerStyle = getStepBadgeStyle({
    borderColor: '#000',
    borderWidth: 2,
    settings: { ...badge, manualPlacement: { position: 1, side: 'top' } },
    zIndex: 2,
    clickable: true,
  });
  const diagonalStyle = getStepBadgeStyle({
    borderColor: '#000',
    borderWidth: 2,
    settings: {
      ...badge,
      manualPlacement: {
        normalOffset: 20,
        position: 1,
        side: 'top',
        tangentialOffset: 20,
      },
    },
    zIndex: 2,
    clickable: true,
  });
  const readTranslation = (transform: string | undefined) => {
    const match = transform?.match(/^translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    return match ? [Number(match[1]), Number(match[2])] : [];
  };
  const [cornerX, cornerY] = readTranslation(cornerStyle.transform);
  const [diagonalX, diagonalY] = readTranslation(diagonalStyle.transform);
  expect(diagonalStyle).toMatchObject({ left: '100%', top: 0 });
  expect(diagonalX! - cornerX!).toBeCloseTo(20);
  expect(diagonalY! - cornerY!).toBeCloseTo(-20);
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

it('omits only capture-hidden frame decoration while retaining its number and comment', async () => {
  const hiddenBorder = {
    ...border,
    effects: {
      ...border.effects!,
      capture: { hideFrame: true },
    },
  };
  const html = await renderExportSurface({
    baseImageUrl: 'blob:base',
    height: 300,
    snapshots: [
      {
        ...frame(),
        borderSettings: hiddenBorder,
        callout: createDefaultFrameCallout(),
        stepBadge: createDefaultFrameStepBadge(),
      },
    ],
    width: 500,
  });

  expect(html).not.toContain('sniptale-interactive-frame-fill');
  expect(html).not.toContain('sniptale-interactive-frame-stroke');
  expect(html).toContain('sniptale-step-badge');
  expect(html).toContain('sniptale-callout');
});

it('keeps callout badge text explicit and covers disabled/measurement variants', () => {
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
  ).toBe('');
  expect(
    resolveFrameCalloutBadgeText({
      badgeText: '',
      bodyHtml: '<b>Body</b>',
      titleEnabled: false,
      titleText: '',
    })
  ).toBe('');
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
  const focus = host.querySelector<HTMLButtonElement>('[data-frame-effect="focus"]');
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

it('preserves every floating-toolbar command and optional action branch', async () => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const onCommand = vi.fn();
  const labels = new Map(getFrameAnnotationCommandSchema().map((item) => [item.id, item.label]));
  labels.set('step-badge', translate('content.stepBadge.settingsTitle'));
  labels.set('callout', translate('content.callout.settingsTitle'));
  const button = (command: Parameters<typeof labels.get>[0]) => {
    const title = labels.get(command);
    const match = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
      (candidate) => candidate.title === title
    );
    expect(match, `button for ${command}`).toBeDefined();
    return match!;
  };
  const click = async (target: HTMLButtonElement) => {
    await act(async () => target.click());
  };
  const effectOption = (command: 'effect-border' | 'effect-blur' | 'effect-focus') => {
    const title = labels.get(command);
    const match = [...host.querySelectorAll<HTMLButtonElement>('button')]
      .filter((candidate) => candidate.title === title)
      .at(-1);
    expect(match, `effect option for ${command}`).toBeDefined();
    return match!;
  };

  await act(async () =>
    root.render(
      <FrameAnnotationFloatingToolbar
        calloutEnabled={false}
        canDecrease
        effectMode="border"
        onCommand={onCommand}
        stepBadgeEnabled={false}
        trailingSlot={
          <FrameAnnotationToolbarAddCalloutButton
            title="Add another comment"
            onClick={vi.fn()}
            onMouseDown={vi.fn()}
          />
        }
      />
    )
  );
  const toolbarButtons = [
    ...host.querySelectorAll<HTMLButtonElement>('.sniptale-action-toolbar button'),
  ];
  const calloutIndex = toolbarButtons.findIndex((item) => item.title === labels.get('callout'));
  expect(toolbarButtons[calloutIndex + 2]?.title).toBe('Add another comment');
  const deleteIndex = toolbarButtons.findIndex((item) => item.title === labels.get('delete'));
  expect(toolbarButtons[deleteIndex + 1]?.title).toBe(labels.get('close'));
  host
    .querySelector('.sniptale-glass-toolbar')
    ?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
  button('step-badge').dispatchEvent(
    new MouseEvent('mousedown', { bubbles: true, cancelable: true })
  );
  await click(button('step-badge'));
  await click(button('callout'));
  for (const command of ['increase', 'decrease', 'edit', 'delete', 'close'] as const) {
    await click(button(command));
  }
  for (const command of ['effect-border', 'effect-blur', 'effect-focus'] as const) {
    await click(button('effect-border'));
    await click(effectOption(command));
  }
  await click(button('effect-border'));
  await click(button('effect-border'));
  expect(onCommand.mock.calls.map(([command]) => command)).toEqual(
    expect.arrayContaining([
      'step-badge',
      'callout',
      'increase',
      'decrease',
      'edit',
      'delete',
      'close',
      'effect-blur',
      'effect-focus',
    ])
  );

  const effectSettings = vi.fn();
  const stepSettings = vi.fn();
  const calloutSettings = vi.fn();
  await act(async () =>
    root.render(
      <FrameAnnotationFloatingToolbar
        calloutEnabled
        canDecrease={false}
        effectMode="focus"
        onCalloutSettingsClick={calloutSettings}
        onCommand={onCommand}
        onEffectSettingsClick={effectSettings}
        onStepSettingsClick={stepSettings}
        showEdit={false}
        stepBadgeEnabled
      />
    )
  );
  await click(button('effect-border'));
  expect(onCommand).toHaveBeenCalledWith('effect-border');
  const commandCount = onCommand.mock.calls.length;
  await click(
    host.querySelector<HTMLButtonElement>('.sniptale-annotation-effect-switch > button')!
  );
  await click(
    host.querySelector<HTMLButtonElement>(
      `button[title="${translate('content.interactiveFrame.stepBadgeSettings')}"]`
    )!
  );
  await click(
    host.querySelector<HTMLButtonElement>(
      `button[title="${translate('content.interactiveFrame.calloutSettings')}"]`
    )!
  );
  expect(effectSettings).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  expect(stepSettings).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  expect(calloutSettings).toHaveBeenCalledWith(expect.any(HTMLButtonElement));
  expect(onCommand).toHaveBeenCalledTimes(commandCount);
  expect(button('decrease').disabled).toBe(true);
  expect(host.querySelector('.lucide-move')).toBeNull();

  const onMouseDown = vi.fn();
  const onClick = vi.fn();
  const onCaptureVisibilityChange = vi.fn();
  await act(async () =>
    root.render(
      <>
        <FrameAnnotationToolbarAddCalloutButton
          onClick={onClick}
          onMouseDown={onMouseDown}
          title="Add callout"
        />
        <FrameAnnotationToolbarActionButtons
          canDecrease
          captureHidden={false}
          captureVisibilityTitle="Hide from capture"
          onCaptureVisibilityChange={onCaptureVisibilityChange}
          onClose={onClick}
          onDecrease={onClick}
          onDelete={onClick}
          onEdit={onClick}
          onIncrease={onClick}
          onMouseDown={onMouseDown}
          showEdit={false}
        />
      </>
    )
  );
  const addCallout = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.interactive-frame.add-callout"]'
  );
  const captureVisibility = host.querySelector<HTMLButtonElement>(
    '[data-ui="content.interactive-frame.capture-visibility"]'
  );
  expect(addCallout).not.toBeNull();
  expect(captureVisibility?.querySelector('.lucide-eye')).not.toBeNull();
  addCallout?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await click(addCallout!);
  await click(captureVisibility!);
  expect(onMouseDown).toHaveBeenCalled();
  expect(onClick).toHaveBeenCalled();
  expect(onCaptureVisibilityChange).toHaveBeenCalled();

  await act(async () =>
    root.render(
      <FrameAnnotationToolbarActionButtons
        canDecrease
        captureHidden
        captureVisibilityTitle="Show in capture"
        onCaptureVisibilityChange={onCaptureVisibilityChange}
        onClose={onClick}
        onDecrease={onClick}
        onDelete={onClick}
        onEdit={onClick}
        onIncrease={onClick}
        onMouseDown={onMouseDown}
      />
    )
  );
  expect(host.querySelector('.lucide-eye-off')).not.toBeNull();
  expect(
    host
      .querySelector('[data-ui="content.interactive-frame.capture-visibility"]')
      ?.getAttribute('aria-pressed')
  ).toBe('true');

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

it('distinguishes annotation editing from capture dimensions with a move icon', () => {
  const markup = renderToStaticMarkup(
    <FrameAnnotationFloatingToolbar effectMode="border" onCommand={() => {}} />
  );
  expect(markup).toContain('lucide-square');
  expect(markup).toContain('lucide-move');
  expect(markup).not.toContain('lucide-scaling');
  expect(markup).not.toContain('lucide-pencil');
});

it('exports standalone number and comment content without frame paint or interactive controls', async () => {
  const callout = createDefaultFrameCallout();
  callout.content.bodyHtml = '<p>Standalone export comment</p>';
  const snapshots = [
    createFrameAnnotationSnapshot(
      {
        id: 'number',
        annotationKind: 'step-badge',
        x: 100,
        y: 100,
        width: 1,
        height: 1,
        stepBadge: { ...createDefaultFrameStepBadge(), value: '9' },
      },
      0
    ),
    createFrameAnnotationSnapshot(
      { id: 'comment', annotationKind: 'callout', x: 250, y: 150, width: 1, height: 1, callout },
      1
    ),
  ];
  const html = await renderExportSurface({
    baseImageUrl: 'blob:base',
    width: 600,
    height: 400,
    snapshots,
  });
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelector('.sniptale-step-badge')?.textContent).toBe('9');
  expect(document.querySelector('.sniptale-callout')?.textContent).toContain(
    'Standalone export comment'
  );
  for (const stroke of document.querySelectorAll<HTMLElement>(
    '.sniptale-interactive-frame-stroke'
  )) {
    expect(['', 'none', 'hidden']).toContain(stroke.style.borderStyle);
  }
  for (const fill of document.querySelectorAll('.sniptale-interactive-frame-fill')) {
    expect(fill.getAttribute('style')).toContain('background: transparent');
  }
  expect(document.querySelector('[contenteditable="true"]')).toBeNull();
  expect(html).not.toContain('sniptale-step-badge-move-handle');
  expect(html).not.toContain('sniptale-step-badge-settings-handle');
});

it('recenters on font and size changes, preserves text on metric failure and releases observers', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const canvasDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'getContext'
  )!;
  const fontsDescriptor = Object.getOwnPropertyDescriptor(document, 'fonts');
  const fonts = new EventTarget();
  const disconnect = vi.fn();
  let resize = () => {};
  let available = true;
  let right = 7;
  const context = {
    font: '',
    letterSpacing: '',
    measureText: vi.fn(() => ({
      actualBoundingBoxLeft: -100,
      actualBoundingBoxRight: right * 100,
    })),
  };
  const nativeComputedStyle = getComputedStyle;
  vi.stubGlobal('CanvasRenderingContext2D', class {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {
        disconnect();
      }
    }
  );
  vi.stubGlobal('getComputedStyle', (element: Element) => {
    const style = nativeComputedStyle(element);
    style.width = `${(element.textContent?.length ?? 0) * 9}px`;
    style.fontSize = '16.2px';
    style.fontWeight = '700';
    style.fontStyle = 'normal';
    return style;
  });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    value: () => (available ? context : null),
  });
  Object.defineProperty(document, 'fonts', { configurable: true, value: fonts });
  try {
    act(() => root.render(<StepBadgeValue value="1" />));
    const value = host.querySelector('span')!;
    expect(value.style.translate).toBe('0.5px 0');
    right = 8;
    act(() => fonts.dispatchEvent(new Event('loadingdone')));
    expect(value.style.translate).toBe('0px 0');
    right = 7;
    act(() => resize());
    expect(value.style.translate).toBe('0.5px 0');
    right = 18;
    act(() => root.render(<StepBadgeValue value="12" customStyle={{ letterSpacing: '0.5px' }} />));
    expect(value.style.translate).toBe('-0.5px 0');
    expect(context.letterSpacing).toBe('50px');
    expect(context.font).toContain('1620px');
    available = false;
    act(() => resize());
    expect(value.style.translate).toBe('0px 0');
    expect(value.textContent).toBe('12');
    available = true;
    right = Number.NaN;
    act(() => fonts.dispatchEvent(new Event('loadingdone')));
    expect(value.style.translate).toBe('0px 0');
    expect(value.textContent).toBe('12');
    act(() => root.unmount());
    const calls = context.measureText.mock.calls.length;
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(context.measureText).toHaveBeenCalledTimes(calls);
    expect(disconnect).toHaveBeenCalled();
  } finally {
    act(() => root.unmount());
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', canvasDescriptor);
    if (fontsDescriptor) Object.defineProperty(document, 'fonts', fontsDescriptor);
    else Reflect.deleteProperty(document, 'fonts');
    vi.unstubAllGlobals();
    host.remove();
  }
});
