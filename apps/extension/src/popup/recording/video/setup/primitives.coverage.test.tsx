/* eslint-disable max-lines-per-function */
// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buttonMock: vi.fn(),
  translateMock: vi.fn((key: string) => key),
}));

vi.mock('../../../../platform/i18n', () => ({
  translate: mocks.translateMock,
}));

vi.mock('../../../../ui/popup-shell/icon-state-button', () => ({
  PopupIconStateButton: (props: any) => {
    mocks.buttonMock(props);
    return (
      <button type="button" onClick={props.onClick} disabled={props.disabled}>
        {props.label}
      </button>
    );
  },
}));

import { VideoDiagnosticsToggle } from './toggles/diagnostics-toggle';
import { VideoSystemAudioToggle } from './toggles/system-audio-toggle';
import { InlineSelectRow, ModeIconButton } from './primitives';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(node);
  });
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.clearAllMocks();
});

describe('popup video setup shared controls', () => {
  it('renders the shared mode button and inline row', () => {
    const onClick = vi.fn();
    const icon = () => <svg data-testid="mode-icon" />;

    render(
      <>
        <ModeIconButton
          icon={icon}
          label="Window"
          hint="Hint"
          active
          accentClassName="accent"
          onClick={onClick}
        />
        <InlineSelectRow label="Label" ariaLabel="row-label">
          <span>Child</span>
        </InlineSelectRow>
      </>
    );

    act(() => {
      (container?.querySelector('button') as HTMLButtonElement).click();
    });

    expect(mocks.buttonMock).toHaveBeenCalledWith(
      expect.objectContaining({ active: true, description: 'Hint', label: 'Window' })
    );
    expect(container?.textContent).toContain('Label');
    expect(container?.textContent).toContain('Child');
    expect(container?.querySelector('div')?.className).not.toContain('border');
    expect(container?.querySelector('div')?.className).not.toContain('shadow');
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders diagnostics and system-audio toggles for enabled and disabled states', () => {
    const onSettingsChange = vi.fn();

    render(
      <>
        <VideoDiagnosticsToggle
          settings={{ diagnosticsEnabled: true } as never}
          diagnosticsDisabled={false}
          onSettingsChange={onSettingsChange}
        />
        <VideoSystemAudioToggle
          settings={{ systemAudioEnabled: false } as never}
          systemAudioDisabled
          onSettingsChange={onSettingsChange}
        />
      </>
    );

    const buttons = Array.from(container?.querySelectorAll('button') ?? []);
    act(() => {
      (buttons[0] as HTMLButtonElement).click();
    });

    expect(mocks.buttonMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        active: false,
        disabled: true,
        label: 'popup.video.systemAudioDisabledLabel',
      })
    );
    expect(onSettingsChange).toHaveBeenCalledWith({ diagnosticsEnabled: false });
  });

  it('forwards an explicit disabled state through the shared mode button helper', () => {
    render(
      <ModeIconButton
        icon={() => <svg data-testid="mode-icon" />}
        label="Window"
        hint="Hint"
        active={false}
        disabled
        accentClassName="accent"
        onClick={vi.fn()}
      />
    );

    expect(mocks.buttonMock).toHaveBeenCalledWith(
      expect.objectContaining({
        active: false,
        disabled: true,
        label: 'Window',
      })
    );
  });
});
