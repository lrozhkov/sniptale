// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const numericRowPropsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../../../section-surface', async (importOriginal) => ({
  ...(await importOriginal()),
  settingsSectionClassName: 'settings-section',
  settingsCompactWorkbenchClassName: 'settings-compact-workbench',
  settingsMetaLabelClassName: 'meta-label',
}));

vi.mock('../../../../../ui/compact-inspector-controls', async (importOriginal) => ({
  ...(await importOriginal()),
  NumericRow: (props: {
    disabled?: boolean;
    label: string;
    onCommitValue(value: number): void;
    onPreviewValue(value: number): void;
    value: number;
  }) => {
    numericRowPropsMock(props);
    return <div data-testid="numeric-row">{props.label}</div>;
  },
}));

import { ImageSettingsSectionContent } from './content';

type ImageSettingsState = Parameters<typeof ImageSettingsSectionContent>[0]['state'];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderWithState(state: ImageSettingsState) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(<ImageSettingsSectionContent state={state} />);
  });
}

function createState(overrides: Partial<ImageSettingsState> = {}): ImageSettingsState {
  return {
    imageFormat: 'webp',
    imageQuality: 85,
    isLoading: false,
    isQualityDisabled: false,
    handleFormatChange: vi.fn(),
    handleQualityCommit: vi.fn(),
    handleQualityPreview: vi.fn(),
    ...overrides,
  } as ImageSettingsState;
}

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

describe('ImageSettingsSectionContent', () => {
  it('renders compact format and quality controls and forwards user actions', async () => {
    const state = createState({ isLoading: true });

    await renderWithState(state);

    expect(container?.textContent).not.toContain('imageSettings.section.saving');
    expect(container?.firstElementChild?.className).toContain('settings-compact-workbench');
    expect(container?.firstElementChild?.className).not.toContain('!max-w-[560px]');
    expect(container?.textContent).toContain('imageSettings.section.formatWebpLabel');
    expect(container?.querySelector('ul')).toBeNull();

    const buttons = Array.from(container?.querySelectorAll('button') ?? []);
    await act(async () => {
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      const lastNumericProps = numericRowPropsMock.mock.lastCall?.[0] as
        | {
            onCommitValue(value: number): void;
            onPreviewValue(value: number): void;
          }
        | undefined;
      lastNumericProps?.onPreviewValue(91);
      lastNumericProps?.onCommitValue(91);
    });

    expect(state.handleFormatChange).toHaveBeenCalledWith('png');
    expect(state.handleQualityPreview).toHaveBeenCalledWith(91);
    expect(state.handleQualityCommit).toHaveBeenCalledWith(91);
  });
});

describe('ImageSettingsSectionContent quality states', () => {
  it('shows the disabled quality state for lossless PNG', async () => {
    await renderWithState(
      createState({
        imageFormat: 'png',
        imageQuality: 40,
        isQualityDisabled: true,
      })
    );

    expect(numericRowPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true, value: 100 })
    );
  });

  it('passes the current lossy quality to the numeric scrubber', async () => {
    await renderWithState(createState({ imageQuality: 73 }));
    expect(numericRowPropsMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: false, value: 73, unit: '%' })
    );
  });
});
