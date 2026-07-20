// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const buttonPropsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../../platform/i18n', () => ({
  translate: (key: string) => `t:${key}`,
}));

vi.mock('../../../icon-state-button', () => ({
  PopupIconStateButton: (props: {
    active: boolean;
    disabled: boolean;
    label: string;
    onClick: () => void;
  }) => {
    buttonPropsMock(props);
    return (
      <button type="button" disabled={props.disabled} onClick={props.onClick}>
        {props.label}
      </button>
    );
  },
}));

import { ExportOptionToggles } from './index';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createToggleSetter() {
  return vi.fn();
}

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof ExportOptionToggles>> = {}
) {
  const props: React.ComponentProps<typeof ExportOptionToggles> = {
    disabled: false,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
    setIncludeBasicLogs: createToggleSetter(),
    setIncludeCssDiagnostics: createToggleSetter(),
    setIncludeFiles: createToggleSetter(),
    setIncludeFullPageScreenshot: createToggleSetter(),
    setIncludeHarDomLogs: createToggleSetter(),
    setIncludeImages: createToggleSetter(),
    setIncludeJson: createToggleSetter(),
    setIncludeMarkdown: createToggleSetter(),
    ...overrides,
  };

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ExportOptionToggles {...props} />);
  });

  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  buttonPropsMock.mockReset();
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

describe('ExportOptionToggles', () => {
  it('renders content and diagnostics toggles and wires their setters', () => {
    const props = renderComponent();
    const buttons = Array.from(container?.querySelectorAll('button') ?? []);

    expect(container?.textContent).toContain('t:popup.export.contentGroupLabel');
    expect(container?.textContent).toContain('t:popup.export.diagnosticsGroupLabel');
    expect(buttons).toHaveLength(8);

    act(() => {
      buttons[0]?.click();
      buttons[5]?.click();
      buttons[7]?.click();
    });

    expect(props.setIncludeJson).toHaveBeenCalledTimes(1);
    expect(props.setIncludeHarDomLogs).toHaveBeenCalledTimes(1);
    expect(props.setIncludeFullPageScreenshot).toHaveBeenCalledTimes(1);
  });

  it('disables image exports without files and applies global disabled state', () => {
    renderComponent({
      disabled: true,
      includeFiles: false,
    });

    const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

    expect(buttons.every((button) => button.disabled)).toBe(true);
  });
});
