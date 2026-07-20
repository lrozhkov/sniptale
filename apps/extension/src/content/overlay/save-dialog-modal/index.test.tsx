// @vitest-environment jsdom

import type { ComponentProps, ReactNode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentPrivilegedActionIntentSource } from '../../application/privileged-action-intent';

const { saveDialogPresetsMock, useAppLocaleMock } = vi.hoisted(() => ({
  saveDialogPresetsMock: vi.fn(),
  useAppLocaleMock: vi.fn(),
}));

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  useAppLocale: useAppLocaleMock,
}));

vi.mock('./presets', () => ({
  useSaveDialogPresets: () => saveDialogPresetsMock(),
}));

type MockSaveDialogContentProps = {
  filename: string;
  onChoosePreset: (
    presetId: string,
    contentIntentSource?: ContentPrivilegedActionIntentSource | null
  ) => void;
  onChooseSystemFolder: (contentIntentSource?: ContentPrivilegedActionIntentSource | null) => void;
  onClose: () => void;
  onFilenameChange: (value: string) => void;
  sessionFooter?: ReactNode;
};

vi.mock('./views', () => {
  function SaveDialogContent(props: MockSaveDialogContentProps) {
    return (
      <div>
        <input
          data-ui="content.save-dialog.filename"
          onChange={(event) => props.onFilenameChange(event.currentTarget.value)}
          value={props.filename}
        />
        {props.sessionFooter}
        <PresetButton onChoosePreset={props.onChoosePreset} />
        <SystemButton onChooseSystemFolder={props.onChooseSystemFolder} />
        <button data-ui="content.save-dialog.close" onClick={props.onClose} type="button">
          close
        </button>
      </div>
    );
  }

  return { SaveDialogContent, SaveDialogSessionFooter };
});

function PresetButton(props: Pick<MockSaveDialogContentProps, 'onChoosePreset'>) {
  return (
    <button
      data-ui="content.save-dialog.preset"
      onClick={() => props.onChoosePreset('preset-1', undefined)}
      type="button"
    >
      preset
    </button>
  );
}

function SystemButton(props: Pick<MockSaveDialogContentProps, 'onChooseSystemFolder'>) {
  return (
    <button
      data-ui="content.save-dialog.system"
      onClick={() => props.onChooseSystemFolder(undefined)}
      type="button"
    >
      system
    </button>
  );
}

function SaveDialogSessionFooter(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label>
      <input
        checked={props.checked}
        data-ui="content.save-dialog.remember"
        onChange={(event) => props.onChange(event.currentTarget.checked)}
        type="checkbox"
      />
      remember
    </label>
  );
}

import { SaveDialogModal } from '.';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createProps(overrides: Partial<ComponentProps<typeof SaveDialogModal>> = {}) {
  return {
    dataUrl: 'data:image/png;base64,1',
    defaultFilename: 'capture.png',
    onClose: vi.fn(),
    onSave: vi.fn(async () => true),
    onSessionDontAsk: vi.fn(),
    ...overrides,
  };
}

async function renderDialog(props: ReturnType<typeof createProps>) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<SaveDialogModal {...props} />);
  });
}

async function click(selector: string) {
  const element = container?.querySelector(selector);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${selector}`);
  }

  await act(async () => {
    element.click();
    await Promise.resolve();
  });
}

async function setRemember(enabled: boolean) {
  const input = container?.querySelector(
    '[data-ui="content.save-dialog.remember"]'
  ) as HTMLInputElement | null;
  if (!input) {
    throw new Error('Remember checkbox not found');
  }

  await act(async () => {
    if (input.checked !== enabled) {
      input.click();
    }
  });
}

describe('SaveDialogModal', () => {
  beforeEach(prepareSaveDialogTest);
  afterEach(cleanupSaveDialogTest);
  registerPresetSaveDialogTests();
  registerSystemSaveDialogTests();
});

function registerPresetSaveDialogTests() {
  it('closes and remembers the preset only after a successful preset save', async () => {
    const props = createProps();
    await renderDialog(props);

    await setRemember(true);
    await click('[data-ui="content.save-dialog.preset"]');

    expect(props.onSave).toHaveBeenCalledWith(
      'download_default',
      'preset-1',
      'capture.png',
      undefined
    );
    expect(props.onSessionDontAsk).toHaveBeenCalledWith('preset-1');
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog open when preset save fails', async () => {
    const props = createProps({
      onSave: vi.fn(async () => false),
    });
    await renderDialog(props);

    await setRemember(true);
    await click('[data-ui="content.save-dialog.preset"]');

    expect(props.onSave).toHaveBeenCalledWith(
      'download_default',
      'preset-1',
      'capture.png',
      undefined
    );
    expect(props.onSessionDontAsk).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });
}

function registerSystemSaveDialogTests() {
  it('closes the modal only when system-dialog save succeeds', async () => {
    const onSave = vi
      .fn(async () => false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const props = createProps({ onSave });
    await renderDialog(props);

    await click('[data-ui="content.save-dialog.system"]');
    await click('[data-ui="content.save-dialog.system"]');

    expect(onSave).toHaveBeenNthCalledWith(1, 'ask_system', null, 'capture.png', undefined);
    expect(onSave).toHaveBeenNthCalledWith(2, 'ask_system', null, 'capture.png', undefined);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
}

function prepareSaveDialogTest() {
  vi.clearAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  saveDialogPresetsMock.mockReturnValue({
    loadError: false,
    loading: false,
    presets: [{ enabled: true, id: 'preset-1', name: 'Preset 1', path: 'Downloads' }],
  });
}

function cleanupSaveDialogTest() {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
}
