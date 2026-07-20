// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const settingsRangePropsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../section-surface/panel-controls', async (importOriginal) => ({
  ...(await importOriginal()),
  settingsCardClassName: 'settings-card',
}));

vi.mock('../../section-surface', async (importOriginal) => ({
  ...(await importOriginal()),
  settingsSectionClassName: 'settings-section',
  settingsMetaLabelClassName: 'meta-label',
  SettingsSectionHeader: (props: { description?: string; kicker?: string; title?: string }) => (
    <div>
      <span>{props.kicker}</span>
      {props.title ? <span>{props.title}</span> : null}
      <span>{props.description}</span>
    </div>
  ),
  SettingsRangeField: ({
    aside,
    displaySuffix,
    displayValue,
    hint,
    label,
    rangeClassName: _rangeClassName,
    ...props
  }: React.InputHTMLAttributes<HTMLInputElement> & {
    aside?: React.ReactNode;
    displaySuffix?: React.ReactNode;
    displayValue?: React.ReactNode;
    hint?: React.ReactNode;
    label?: React.ReactNode;
    rangeClassName?: string;
  }) => {
    settingsRangePropsMock(props);
    return (
      <div>
        <span>{label}</span>
        <span>{displayValue}</span>
        <span>{displaySuffix}</span>
        {aside ? <span>{aside}</span> : null}
        {hint ? <span>{hint}</span> : null}
        <input type="range" {...props} />
      </div>
    );
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
    handleQualityChange: vi.fn(),
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
  it('renders format cards, tips, and forwards user actions', async () => {
    const state = createState({ isLoading: true });

    await renderWithState(state);

    expect(container?.textContent).toContain('settings.navigation.image');
    expect(container?.textContent).toContain('imageSettings.section.subtitle');
    expect(container?.textContent).toContain('imageSettings.section.saving');
    expect(container?.textContent).toContain('imageSettings.section.formatWebpLabel');
    expect(container?.textContent).toContain('imageSettings.section.tipQuality');

    const buttons = Array.from(container?.querySelectorAll('button') ?? []);
    await act(async () => {
      buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await act(async () => {
      const lastRangeProps = settingsRangePropsMock.mock.lastCall?.[0] as
        | React.InputHTMLAttributes<HTMLInputElement>
        | undefined;
      lastRangeProps?.onChange?.({
        target: { value: '91' },
      } as React.ChangeEvent<HTMLInputElement>);
    });

    expect(state.handleFormatChange).toHaveBeenCalledWith('png');
    expect(state.handleQualityChange).toHaveBeenCalledWith(91);
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

    expect(container?.textContent).toContain('imageSettings.section.qualityUnavailable');
    expect(container?.textContent).toContain('imageSettings.section.qualityLosslessDescription');
    expect(container?.textContent).toContain('100%');
  });

  it.each([
    [95, 'imageSettings.section.qualityHighDescription'],
    [75, 'imageSettings.section.qualityBalancedDescription'],
    [55, 'imageSettings.section.qualityMediumDescription'],
    [25, 'imageSettings.section.qualityLowDescription'],
  ])('renders the correct quality description for %s', async (imageQuality, expectedKey) => {
    await renderWithState(createState({ imageQuality }));
    expect(container?.textContent).toContain(expectedKey);
  });
});
