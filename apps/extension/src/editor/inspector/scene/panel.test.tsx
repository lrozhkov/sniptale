// @vitest-environment jsdom

import type React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../features/editor/document/constants';
import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { EditorInspectorFramePanel } from './panel';

const previewSection = vi.fn();
const paddingSection = vi.fn();
const applyButton = vi.fn();
const presetHeader = vi.fn();

vi.mock('../presets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../presets')>()),
  EditorInspectorPresetHeader: (props: React.PropsWithChildren<{ state: unknown }>) => {
    presetHeader(props);
    return <div data-testid="preset-header">preset-header{props.children}</div>;
  },
}));

vi.mock('./placement/modes', () => ({
  EditorInspectorFrameModeButtons: (props: {
    options: Array<{ value: string; label: string }>;
    value: string;
    onChange: (value: string) => void;
  }) => {
    const firstOption = props.options[0];
    if (!firstOption) {
      return null;
    }

    return (
      <div data-testid="mode-buttons" data-value={props.value}>
        <button type="button" onClick={() => props.onChange(firstOption.value)}>
          change-mode
        </button>
      </div>
    );
  },
}));

vi.mock('./placement', () => ({
  EditorInspectorFramePlacementSection: (props: {
    children?: React.ReactNode;
    frameLayoutModeOptions: Array<{ value: string; label: string }>;
    setLayoutMode: (value: string) => void;
  }) => {
    const firstOption = props.frameLayoutModeOptions[0];
    if (!firstOption) {
      return null;
    }

    return (
      <div data-testid="placement-section">
        <button type="button" onClick={() => props.setLayoutMode(firstOption.value)}>
          set-layout
        </button>
        {props.children}
      </div>
    );
  },
}));

vi.mock('./placement/background', () => ({
  EditorInspectorFrameBackgroundSection: (props: {
    children?: React.ReactNode;
    frameBackgroundModeOptions: Array<{ value: string; label: string }>;
    setBackgroundMode: (value: string) => void;
  }) => {
    const firstOption = props.frameBackgroundModeOptions[0];
    if (!firstOption) {
      return null;
    }

    return (
      <div data-testid="background-section">
        <button type="button" onClick={() => props.setBackgroundMode(firstOption.value)}>
          set-background
        </button>
        {props.children}
      </div>
    );
  },
}));

vi.mock('./background', () => ({
  EditorInspectorFrameBackgroundFillEditor: (props: { frameDraft: EditorFrameSettings }) => {
    previewSection(props);
    return <div data-testid="background-fill-section">{props.frameDraft.backgroundMode}</div>;
  },
}));

vi.mock('./background/blur', () => ({
  EditorInspectorBackgroundBlurControl: () => <div data-testid="background-blur-section" />,
}));

vi.mock('./source-image', () => ({
  EditorInspectorFrameSourceImageSection: () => <div data-testid="source-image-section" />,
}));

vi.mock('./padding', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./padding')>()),
  FramePaddingFields: (props: {
    setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
  }) => {
    paddingSection(props);
    return (
      <div data-testid="padding-section">
        <button
          type="button"
          onClick={() =>
            props.setFrameDraft((frameDraft) => ({
              ...frameDraft,
              paddingTop: frameDraft.paddingTop + 1,
            }))
          }
        >
          bump-padding
        </button>
      </div>
    );
  },
}));

vi.mock('./apply-button', () => ({
  FrameApplyButton: (props: { onApplyFrame: () => void; onCancelFrame?: () => void }) => {
    applyButton(props);
    return (
      <div data-testid="apply-button">
        {props.onCancelFrame ? (
          <button type="button" data-testid="cancel-frame" onClick={props.onCancelFrame}>
            cancel-frame
          </button>
        ) : null}
        <button type="button" data-testid="apply-frame" onClick={props.onApplyFrame}>
          apply-frame
        </button>
      </div>
    );
  },
}));

const FRAME: EditorFrameSettings = {
  ...DEFAULT_EDITOR_FRAME_SETTINGS,
  backgroundMode: 'color',
  backgroundColor: '#ffffff',
  backgroundImageData: null,
  backgroundImageFit: 'cover',
  layoutMode: 'fit-image',
};

function createPanelProps() {
  const setLayoutMode = vi.fn();
  const setBackgroundMode = vi.fn();
  const setFrameDraft = vi.fn();
  const onApplyFrame = vi.fn();
  const onCancelFrame = vi.fn();

  return {
    setLayoutMode,
    setBackgroundMode,
    setFrameDraft,
    onApplyFrame,
    onCancelFrame,
    props: {
      scenePresetHeader: { value: 'scene-default' } as never,
      frameDraft: FRAME,
      backgroundPreviewStyle: { backgroundColor: '#fff' },
      framePaddingSummary: '12 / 12 / 12 / 12',
      frameLayoutModeOptions: [{ value: 'fit-image' as const, label: 'Fit' }],
      frameBackgroundModeOptions: [{ value: 'color' as const, label: 'Solid' }],
      gradientPresets: [],
      frameBackgroundPalette: [],
      frameBackgroundImageFitOptions: [{ value: 'cover' as const, label: 'Cover' }],
      recentColors: [],
      toNumber: (value: string) => Number(value),
      setFrameDraft,
      setLayoutMode,
      setBackgroundMode,
      applyGradientPreset: vi.fn(),
      previewFramePatch: vi.fn(),
      applyFramePatch: vi.fn(),
      onPickBackgroundImage: vi.fn(),
      onClearBackgroundImage: vi.fn(),
      onApplyFrame,
      onCancelFrame,
    },
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderUi(element: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(element);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  previewSection.mockClear();
  paddingSection.mockClear();
  applyButton.mockClear();
  presetHeader.mockClear();
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

function expectPanelSectionOrder() {
  const presetHeaderElement = container?.querySelector('.space-y-3');
  expect(
    Array.from(presetHeaderElement?.children ?? []).map((element) =>
      element.getAttribute('data-testid')
    )
  ).toEqual(['background-section', 'placement-section', 'source-image-section', 'apply-button']);
}

function expectFramePanelSections() {
  expect(container?.querySelector('[data-testid="preset-header"]')).toBeNull();
  expect(container?.querySelector('[data-testid="placement-section"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="background-section"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="frame-preview"]')).toBeNull();
  expect(container?.querySelector('[data-testid="background-fill-section"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="background-blur-section"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="padding-section"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="source-image-section"]')).not.toBeNull();
  expect(container?.querySelector('[data-testid="apply-button"]')).not.toBeNull();
  expectPanelSectionOrder();
}

async function clickFramePanelActions() {
  await act(async () => {
    clickPanelButton('[data-testid="mode-buttons"] button');
    clickPanelButton('[data-testid="placement-section"] button');
    clickPanelButton('[data-testid="background-section"] button');
    clickPanelButton('[data-testid="padding-section"] button');
    container
      ?.querySelector('[data-testid="apply-button"]')
      ?.querySelector('[data-testid="apply-frame"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    container
      ?.querySelector('[data-testid="cancel-frame"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function clickPanelButton(selector: string) {
  (container?.querySelector(selector) as HTMLButtonElement | undefined)?.click();
}

it('wires the inspector scene panel sections and actions', async () => {
  const { onApplyFrame, onCancelFrame, props, setBackgroundMode, setFrameDraft, setLayoutMode } =
    createPanelProps();

  await renderUi(<EditorInspectorFramePanel {...props} />);

  expectFramePanelSections();
  await clickFramePanelActions();

  expect(previewSection).toHaveBeenCalled();
  expect(paddingSection).toHaveBeenCalled();
  expect(applyButton).toHaveBeenCalled();
  expect(presetHeader).not.toHaveBeenCalled();
  expect(setLayoutMode).toHaveBeenCalledWith('fit-image');
  expect(setBackgroundMode).toHaveBeenCalledWith('color');
  expect(setFrameDraft).toHaveBeenCalledTimes(1);
  expect(onApplyFrame).toHaveBeenCalledTimes(1);
  expect(onCancelFrame).toHaveBeenCalledTimes(1);
});

it('renders scene controls without the template wrapper when no state is provided', async () => {
  const { props } = createPanelProps();

  await renderUi(<EditorInspectorFramePanel {...props} scenePresetHeader={null} />);

  expect(container?.querySelector('[data-testid="preset-header"]')).toBeNull();
  expect(container?.querySelector('[data-testid="background-section"]')).not.toBeNull();
});
