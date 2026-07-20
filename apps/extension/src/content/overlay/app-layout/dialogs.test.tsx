// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AutoBlurController } from '../auto-blur/controller';
import type { ContentAppLayoutDialogsProps } from './types';

const {
  aiModalMock,
  autoBlurModalMock,
  countdownToastMock,
  handleContentSaveDialogSaveMock,
  saveDialogModalMock,
} = vi.hoisted(() => ({
  aiModalMock: vi.fn((_props: Record<string, unknown>) => <div data-ui="content.ai-modal" />),
  autoBlurModalMock: vi.fn((_props: Record<string, unknown>) => (
    <div data-ui="content.auto-blur-modal" />
  )),
  countdownToastMock: vi.fn((props: { count: number | null }) => (
    <div data-ui="content.countdown-toast">{String(props.count)}</div>
  )),
  handleContentSaveDialogSaveMock: vi.fn(async (_args: unknown) => undefined),
  saveDialogModalMock: vi.fn((props: Record<string, unknown>) => (
    <button
      data-ui="content.save-dialog"
      onClick={() => {
        void (
          props['onSave'] as (
            action: 'download_default',
            presetId: string | null,
            filename: string
          ) => void
        )('download_default', 'preset-1', 'capture.png');
        (props['onClose'] as () => void)();
      }}
      type="button"
    >
      save
    </button>
  )),
}));

vi.mock('../ai/modal/shell/lazy', async (importOriginal) => ({
  ...(await importOriginal()),
  LazyAIModal: (props: Record<string, unknown>) => aiModalMock(props),
}));

vi.mock('../auto-blur/modal', () => ({
  AutoBlurModal: (props: Record<string, unknown>) => autoBlurModalMock(props),
}));

vi.mock('../countdown-toast', () => ({
  CountdownToast: (props: { count: number | null }) => countdownToastMock(props),
}));

vi.mock('../save-dialog-modal', () => ({
  SaveDialogModal: (props: Record<string, unknown>) => saveDialogModalMock(props),
}));

vi.mock('./save', () => ({
  handleContentSaveDialogSave: (args: unknown) => handleContentSaveDialogSaveMock(args),
}));

import { ContentDialogStack } from './dialogs';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createAutoBlurController(): AutoBlurController {
  return {
    apply: vi.fn(async () => undefined),
    applyOnce: vi.fn(async () => undefined),
    autoApplyAllowed: true,
    autoApplyEnabled: false,
    blurSettings: {
      amount: 10,
      blurType: 'solid',
      showBorder: false,
    },
    close: vi.fn(),
    errorMessage: null,
    isApplying: false,
    isOpen: false,
    matches: [],
    open: vi.fn(),
    reset: vi.fn(),
    selectedCategories: new Set(),
    selectedMatchIds: new Set(),
    selectedTargetCount: 0,
    setBlurSettings: vi.fn(),
    status: 'idle',
    toggleAllSelection: vi.fn(),
    toggleAutoApply: vi.fn(async () => undefined),
    toggleCategory: vi.fn(),
    toggleMatch: vi.fn(),
  };
}

function createProps() {
  return {
    dialogs: {
      aiController: {
        handleAiPickContentStart: vi.fn(),
        handleCloseAIModal: vi.fn(),
        handleDisableAiPickMode: vi.fn(),
        handleSubmitAIPrompt: vi.fn(async () => undefined),
        isAILoading: false,
        isAIModalOpen: true,
        treeData: null,
      },
      autoBlurController: createAutoBlurController(),
      countdown: null as number | null,
      handleCancelCountdown: vi.fn(),
      quickActionToastCountdown: 3,
      saveDialogState: {
        dataUrl: 'data:image/png;base64,1',
        filename: 'capture.png',
      },
      setSaveDialogState: vi.fn(),
      setSessionActivePresetId: vi.fn(),
    },
  } satisfies { dialogs: ContentAppLayoutDialogsProps };
}

async function renderStack(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ContentDialogStack {...props} />);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

describe('ContentDialogStack', () => {
  it('renders the ai modal, quick-action countdown, and delegates save handling through the save helper', async () => {
    const props = createProps();
    await renderStack(props);

    expect(container?.querySelector('[data-ui="content.ai-modal"]')).not.toBeNull();
    expect(autoBlurModalMock).toHaveBeenCalledWith({
      controller: props.dialogs.autoBlurController,
    });
    expect(container?.querySelector('[data-ui="content.countdown-toast"]')?.textContent).toBe('3');

    const saveButton = container?.querySelector(
      '[data-ui="content.save-dialog"]'
    ) as HTMLButtonElement;
    saveButton.click();
    await Promise.resolve();

    expect(handleContentSaveDialogSaveMock).toHaveBeenCalledWith({
      actionType: 'download_default',
      filename: 'capture.png',
      presetId: 'preset-1',
      saveDialogState: {
        dataUrl: 'data:image/png;base64,1',
        filename: 'capture.png',
      },
    });
    expect(props.dialogs.setSaveDialogState).toHaveBeenCalledWith(null);
  });

  it('prefers the primary countdown over the quick-action countdown', async () => {
    const props = createProps();
    props.dialogs.countdown = 5;
    await renderStack(props);

    expect(countdownToastMock).toHaveBeenCalledTimes(1);
    expect(container?.querySelector('[data-ui="content.countdown-toast"]')?.textContent).toBe('5');
  });
});
