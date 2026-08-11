// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupRenderedNode, getContainer, renderNode } from './popup-home.test.helpers';
import { DEFAULT_SCREENSHOT_SETUP_STATE } from '../../../../composition/persistence/capture-settings';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
vi.mock('@sniptale/ui/product-form-controls', () => ({
  ProductSelect: (props: {
    value: string;
    disabled?: boolean;
    options: Array<{ value: string; label: string }>;
    onChange(value: string): void;
  }) => (
    <select
      disabled={props.disabled}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      {props.options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
vi.mock('../../../../ui/popup-shell/action-button', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../ui/popup-shell/action-button')>()),
  PopupActionButton: (props: { label: string; disabled: boolean; onClick(): void }) => (
    <button disabled={props.disabled} onClick={props.onClick}>
      {props.label}
    </button>
  ),
}));
import { ScreenshotSetupPanel } from './setup-panel';

afterEach(cleanupRenderedNode);

it('hides tab-only fields for desktop and keeps the capture action available', async () => {
  const onCapture = vi.fn();
  await renderNode(
    <ScreenshotSetupPanel
      config={DEFAULT_SCREENSHOT_SETUP_STATE.desktop}
      viewportPresets={[]}
      pending={false}
      disabledReason={null}
      onChange={vi.fn()}
      onCapture={onCapture}
    />
  );
  expect(getContainer()?.textContent).not.toContain('settings.quickActions.screenshotModeLabel');
  expect(getContainer()?.textContent).not.toContain('settings.quickActions.delayLabel');
  (getContainer()?.querySelector('button') as HTMLButtonElement).click();
  expect(onCapture).toHaveBeenCalledOnce();
});

it('hides format and quality whenever clipboard delivery is selected', async () => {
  await renderNode(
    <ScreenshotSetupPanel
      config={{ ...DEFAULT_SCREENSHOT_SETUP_STATE.tab, afterCapture: 'copy', imageFormat: 'png' }}
      viewportPresets={[]}
      pending={false}
      disabledReason={null}
      onChange={vi.fn()}
      onCapture={vi.fn()}
    />
  );
  expect(getContainer()?.textContent).not.toContain('settings.quickActions.imageFormatLabel');
  expect(getContainer()?.textContent).not.toContain('settings.quickActions.qualityLabel');
});

it('renders tab settings, applies field changes, and disables a pending capture', async () => {
  const onChange = vi.fn();
  await renderNode(
    <ScreenshotSetupPanel
      config={{ ...DEFAULT_SCREENSHOT_SETUP_STATE.tab, imageFormat: 'jpeg' }}
      viewportPresets={[
        {
          id: 'wide',
          kind: 'user',
          name: 'Wide',
          target: 'viewport',
          width: 1280,
          height: 720,
          enabled: true,
          order: 1,
        },
      ]}
      pending
      disabledReason={null}
      onChange={onChange}
      onCapture={vi.fn()}
    />
  );
  const selects = getContainer()?.querySelectorAll('select');
  await act(async () => {
    const mode = selects?.[0] as HTMLSelectElement;
    mode.value = 'full';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const viewport = selects?.[1] as HTMLSelectElement;
    viewport.value = 'wide';
    viewport.dispatchEvent(new Event('change', { bubbles: true }));
    const delay = selects?.[2] as HTMLSelectElement;
    delay.value = '5';
    delay.dispatchEvent(new Event('change', { bubbles: true }));
    const afterCapture = selects?.[3] as HTMLSelectElement;
    afterCapture.value = 'edit';
    afterCapture.dispatchEvent(new Event('change', { bubbles: true }));
    const format = selects?.[4] as HTMLSelectElement;
    format.value = 'webp';
    format.dispatchEvent(new Event('change', { bubbles: true }));
    const quality = selects?.[5] as HTMLSelectElement;
    quality.value = '80';
    quality.dispatchEvent(new Event('change', { bubbles: true }));
    (getContainer()?.querySelector('[role="switch"]') as HTMLButtonElement).click();
  });
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ screenshotMode: 'full', imageFormat: 'jpeg' })
  );
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ exitAfterCapture: true }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ viewportPresetId: 'wide' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ delay: 5 }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ afterCapture: 'edit' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ imageFormat: 'webp' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ imageQuality: 80 }));
  const buttons = getContainer()?.querySelectorAll('button');
  expect((buttons?.[buttons.length - 1] as HTMLButtonElement).disabled).toBe(true);
});
