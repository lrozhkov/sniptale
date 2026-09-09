// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { codecSupport } = vi.hoisted(() => ({ codecSupport: vi.fn(() => 'available') }));
vi.mock('./profile-support', () => ({ useProfileCodecSupport: codecSupport }));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductField: (props: { children: React.ReactNode; label: React.ReactNode }) => (
    <label>
      {props.label}
      {props.children}
    </label>
  ),
  ProductInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  ProductSelect: (props: {
    'aria-label'?: string;
    menuPlacement?: 'auto' | 'bottom';
    menuScrollable?: boolean;
    onChange: (value: string) => void;
    options: Array<{ disabled?: boolean; label: string; value: string }>;
    value: string;
  }) => (
    <select
      aria-label={props['aria-label']}
      data-menu-placement={props.menuPlacement}
      data-menu-scrollable={String(props.menuScrollable)}
      value={props.value}
      onChange={(event) => props.onChange(event.currentTarget.value)}
    >
      {props.options.map((option) => (
        <option disabled={option.disabled} key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: (props: { children: React.ReactNode; maxHeight?: string; width?: string }) => (
    <div data-max-height={props.maxHeight} data-width={props.width}>
      {props.children}
    </div>
  ),
  ProductModalBody: (props: {
    asForm?: boolean;
    children: React.ReactNode;
    onSubmit?: React.FormEventHandler<HTMLFormElement>;
  }) => <form onSubmit={props.onSubmit}>{props.children}</form>,
  ProductModalFooter: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalHeader: (props: { compact?: boolean; onClose: () => void; title: string }) => (
    <header data-compact={String(props.compact)}>
      {props.title}
      <button type="button" onClick={props.onClose}>
        close
      </button>
    </header>
  ),
}));

vi.mock('@sniptale/ui/product-modal/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal/actions')>()),
  ProductActionButton: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props} />
  ),
}));

import {
  DEFAULT_VIDEO_OUTPUT_PROFILE,
  VideoFrameRate,
  VideoOutputCodec,
  VideoOutputContainer,
  VideoQuality,
  VideoResolutionPreset,
} from '@sniptale/runtime-contracts/video/types/types';
import { VideoQualityProfileEditor } from './profile-editor';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderEditor(props: Partial<Parameters<typeof VideoQualityProfileEditor>[0]> = {}) {
  const resolved = {
    busy: false,
    onClose: vi.fn(),
    onSave: vi.fn(async () => undefined),
    ...props,
  };
  act(() => {
    root?.render(<VideoQualityProfileEditor {...resolved} />);
  });
  return resolved;
}

function change(element: Element | null | undefined, value: string) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) {
    throw new Error('Expected a form control');
  }
  act(() => {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLSelectElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value);
    element.dispatchEvent(
      new Event(element instanceof HTMLInputElement ? 'input' : 'change', { bubbles: true })
    );
  });
}

beforeEach(() => {
  codecSupport.mockReturnValue('available');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('creates a named profile and submits the selected output combination', () => {
  const props = renderEditor();
  expect(container?.textContent).toContain('settings.videoQuality.createTitle');
  expect(container?.firstElementChild?.getAttribute('data-width')).toBe('560px');
  expect(container?.firstElementChild?.getAttribute('data-max-height')).toBe('84vh');
  expect(container?.querySelector('header')?.getAttribute('data-compact')).toBe('true');
  expect(container?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  expect(
    Array.from(container?.querySelectorAll('select') ?? []).every(
      (select) =>
        select.dataset['menuPlacement'] === 'auto' && select.dataset['menuScrollable'] === 'false'
    )
  ).toBe(true);

  change(container?.querySelector('input'), 'Review');
  act(() =>
    Array.from(container?.querySelectorAll('button') ?? [])
      .find((button) => button.textContent === 'settings.videoQuality.qualityLow')
      ?.click()
  );
  act(() => container?.querySelector<HTMLInputElement>('input[value="MP4"]')?.click());
  change(
    container?.querySelector('[aria-label="settings.videoQuality.codecLabel"]'),
    VideoOutputCodec.AVC
  );
  change(
    container?.querySelector('[aria-label="settings.videoQuality.resolutionLabel"]'),
    VideoResolutionPreset.P720
  );
  act(() => container?.querySelector('form')?.requestSubmit());

  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'Review',
      configuration: expect.objectContaining({
        codec: VideoOutputCodec.AVC,
        container: VideoOutputContainer.MP4,
        quality: VideoQuality.LOW,
        resolution: VideoResolutionPreset.P720,
      }),
    })
  );
});

it('keeps the codec status slot mounted through format checks and their result', () => {
  renderEditor();
  const status = container?.querySelector('[role="status"]');
  expect(status).not.toBeNull();
  expect(status?.textContent).toBe('');
  codecSupport.mockReturnValue('checking');
  renderEditor();
  expect(container?.querySelector('[role="status"]')).toBe(status);
  expect(status?.textContent).toBe('settings.videoQuality.codecChecking');
  codecSupport.mockReturnValue('unavailable');
  renderEditor();
  expect(container?.querySelector('[role="status"]')).toBe(status);
  expect(status?.textContent).toBe('settings.videoQuality.codecUnavailable');
  codecSupport.mockReturnValue('available');
  renderEditor();
  expect(container?.querySelector('[role="status"]')).toBe(status);
  expect(status?.textContent).toBe('');
});

it('edits a profile, normalizes an incompatible codec, and closes from either action', () => {
  const onClose = vi.fn();
  const props = renderEditor({
    busy: false,
    onClose,
    profile: {
      id: 'custom:mp4',
      name: 'MP4',
      configuration: {
        ...DEFAULT_VIDEO_OUTPUT_PROFILE,
        codec: VideoOutputCodec.AVC,
        container: VideoOutputContainer.MP4,
        resolution: VideoResolutionPreset.P1080,
        quality: VideoQuality.HIGH,
      },
    },
  });
  expect(container?.textContent).toContain('settings.videoQuality.editTitle');
  expect(container?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(
    false
  );

  act(() => container?.querySelector<HTMLInputElement>('input[value="WEBM"]')?.click());
  act(() => container?.querySelector('form')?.requestSubmit());
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      configuration: expect.objectContaining({
        codec: VideoOutputCodec.VP9,
        container: VideoOutputContainer.WEBM,
      }),
    })
  );

  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  act(() => buttons.find((button) => button.textContent === 'close')?.click());
  act(() =>
    buttons.find((button) => button.textContent === 'settings.videoQuality.cancel')?.click()
  );
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('preserves compatible codecs and maps every frame-rate option into the profile', () => {
  const props = renderEditor({
    profile: {
      id: 'custom:webm',
      name: 'WebM',
      configuration: DEFAULT_VIDEO_OUTPUT_PROFILE,
    },
  });

  const frameRateSelect = container?.querySelector(
    '[aria-label="settings.videoQuality.frameRateLabel"]'
  );

  act(() => container?.querySelector<HTMLInputElement>('input[value="WEBM"]')?.click());
  change(frameRateSelect, String(VideoFrameRate.FPS24));
  act(() => container?.querySelector('form')?.requestSubmit());
  change(frameRateSelect, String(VideoFrameRate.FPS60));
  act(() => container?.querySelector('form')?.requestSubmit());
  change(frameRateSelect, String(VideoFrameRate.FPS30));
  act(() => container?.querySelector('form')?.requestSubmit());

  expect(props.onSave).toHaveBeenNthCalledWith(
    1,
    expect.objectContaining({
      configuration: expect.objectContaining({
        codec: DEFAULT_VIDEO_OUTPUT_PROFILE.codec,
        frameRate: VideoFrameRate.FPS24,
      }),
    })
  );
  expect(props.onSave).toHaveBeenNthCalledWith(
    2,
    expect.objectContaining({
      configuration: expect.objectContaining({ frameRate: VideoFrameRate.FPS60 }),
    })
  );
  expect(props.onSave).toHaveBeenNthCalledWith(
    3,
    expect.objectContaining({
      configuration: expect.objectContaining({ frameRate: VideoFrameRate.FPS30 }),
    })
  );
});

it('rejects 4K60 without changing FPS and allows 4K30', () => {
  const props = renderEditor({
    profile: {
      id: 'custom:4k',
      name: '4K',
      configuration: {
        ...DEFAULT_VIDEO_OUTPUT_PROFILE,
        frameRate: VideoFrameRate.FPS60,
        resolution: VideoResolutionPreset.P1440,
      },
    },
  });
  const resolutionSelect = container?.querySelector(
    '[aria-label="settings.videoQuality.resolutionLabel"]'
  );
  const frameRateSelect = container?.querySelector<HTMLSelectElement>(
    '[aria-label="settings.videoQuality.frameRateLabel"]'
  );

  change(resolutionSelect, VideoResolutionPreset.P2160);
  expect(frameRateSelect?.value).toBe(String(VideoFrameRate.FPS60));
  change(frameRateSelect, String(VideoFrameRate.FPS30));
  change(resolutionSelect, VideoResolutionPreset.P2160);
  expect(frameRateSelect?.value).toBe(String(VideoFrameRate.FPS30));
  expect(
    frameRateSelect?.querySelector<HTMLOptionElement>(`option[value="${VideoFrameRate.FPS30}"]`)
      ?.disabled
  ).toBe(false);
  expect(
    frameRateSelect?.querySelector<HTMLOptionElement>(`option[value="${VideoFrameRate.FPS60}"]`)
      ?.disabled
  ).toBe(true);

  act(() => container?.querySelector('form')?.requestSubmit());
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      configuration: expect.objectContaining({
        frameRate: VideoFrameRate.FPS30,
        resolution: VideoResolutionPreset.P2160,
      }),
    })
  );
});

it.each(['checking', 'unavailable', 'busy'])('blocks submission while %s', (state) => {
  codecSupport.mockReturnValue(state === 'busy' ? 'available' : state);
  const props = renderEditor({
    busy: state === 'busy',
    profile: { id: 'custom:test', name: 'Test', configuration: DEFAULT_VIDEO_OUTPUT_PROFILE },
  });
  act(() =>
    container
      ?.querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  );
  expect(props.onSave).not.toHaveBeenCalled();
});

it('orders compression quality from smaller files to more detail', () => {
  renderEditor();
  const group = container?.querySelector('[aria-label="settings.videoQuality.qualityLabel"]');
  expect(
    Array.from(group?.querySelectorAll('button') ?? []).map((button) => button.textContent)
  ).toEqual([
    'settings.videoQuality.qualityLow',
    'settings.videoQuality.qualityMedium',
    'settings.videoQuality.qualityHigh',
    'settings.videoQuality.qualityUltra',
  ]);
});
