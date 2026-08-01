// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
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
    options: Array<{ label: string; value: string }>;
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
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock('@sniptale/ui/product-modal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-modal')>()),
  ProductModal: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalBody: (props: {
    asForm?: boolean;
    children: React.ReactNode;
    onSubmit?: React.FormEventHandler<HTMLFormElement>;
  }) => <form onSubmit={props.onSubmit}>{props.children}</form>,
  ProductModalFooter: (props: { children: React.ReactNode }) => <div>{props.children}</div>,
  ProductModalHeader: (props: { onClose: () => void; title: string }) => (
    <header>
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
  expect(container?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
  expect(
    Array.from(container?.querySelectorAll('select') ?? []).every(
      (select) =>
        select.dataset['menuPlacement'] === 'auto' && select.dataset['menuScrollable'] === 'false'
    )
  ).toBe(true);

  change(container?.querySelector('input'), 'Review');
  change(
    container?.querySelector('[aria-label="settings.videoQuality.qualityLabel"]'),
    VideoQuality.LOW
  );
  change(
    container?.querySelector('[aria-label="settings.videoQuality.containerLabel"]'),
    VideoOutputContainer.MP4
  );
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
      quality: VideoQuality.LOW,
      output: expect.objectContaining({
        codec: VideoOutputCodec.AVC,
        container: VideoOutputContainer.MP4,
        resolution: VideoResolutionPreset.P720,
      }),
    })
  );
});

it('edits a profile, normalizes an incompatible codec, and closes from either action', () => {
  const onClose = vi.fn();
  const props = renderEditor({
    busy: true,
    onClose,
    profile: {
      id: 'custom:mp4',
      name: 'MP4',
      output: {
        codec: VideoOutputCodec.AVC,
        container: VideoOutputContainer.MP4,
        resolution: VideoResolutionPreset.P1080,
      },
      quality: VideoQuality.HIGH,
    },
  });
  expect(container?.textContent).toContain('settings.videoQuality.editTitle');
  expect(container?.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);

  change(
    container?.querySelector('[aria-label="settings.videoQuality.containerLabel"]'),
    VideoOutputContainer.WEBM
  );
  act(() => container?.querySelector('form')?.requestSubmit());
  expect(props.onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      output: expect.objectContaining({
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
