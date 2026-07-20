// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { productSelectPropsSpy } = vi.hoisted(() => ({
  productSelectPropsSpy: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    disabled?: boolean;
    onChange: (value: string) => void | Promise<void>;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => {
    productSelectPropsSpy(props);
    return (
      <select
        data-testid="product-select"
        disabled={props.disabled}
        value={props.value}
        onChange={(event) => void props.onChange(event.currentTarget.value)}
      >
        {props.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  },
}));

vi.mock('../../../section-surface/panel-controls', () => ({
  getSettingsHoverActionsClassName: (visible: boolean) => (visible ? 'visible' : 'hidden'),
  settingsAddButtonClassName: 'settings-add-button',
  settingsCardClassName: 'settings-card',
  settingsDangerIconButtonClassName: 'danger-button',
  settingsEmptyStateClassName: 'empty-state',
  settingsInfoIconButtonClassName: 'info-button',
  settingsListRowClassName: 'list-row',
  settingsModalFieldSurfaceClassName: 'field-surface',
  settingsNeutralBadgeClassName: 'neutral-badge',
  settingsSuccessBadgeClassName: 'success-badge',
  SettingsDragHandle: () => <div data-testid="drag-handle">drag</div>,
  SettingsRange: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="range" {...props} />
  ),
  SettingsSwitch: (props: {
    checked: boolean;
    onClick: () => void | Promise<void>;
    title?: string;
  }) => (
    <button
      data-checked={String(props.checked)}
      data-testid="settings-switch"
      title={props.title}
      onClick={() => void props.onClick()}
    >
      {String(props.checked)}
    </button>
  ),
}));

import { CaptureActionCard, DefaultPresetsCard, GalleryToggleCard } from './cards';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderNode(node: React.ReactNode) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  await act(async () => {
    root?.render(node);
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  productSelectPropsSpy.mockReset();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('renders the capture action card and forwards disabled select changes', async () => {
  const onChange = vi.fn(async () => undefined);

  await renderNode(
    <CaptureActionCard
      captureAction="download_default"
      captureActionOptions={[{ value: 'download_default', label: 'Download default' }]}
      isLoading
      onChange={onChange}
    />
  );

  const select = container?.querySelector<HTMLSelectElement>('[data-testid="product-select"]');

  expect(select?.disabled).toBe(true);
  expect(container?.textContent).toContain('savePresets.section.captureActionLabel');
  expect(productSelectPropsSpy).toHaveBeenCalledWith(
    expect.objectContaining({ disabled: true, value: 'download_default' })
  );
});

it('renders gallery toggle titles for both enabled states', async () => {
  const onToggle = vi.fn(async () => undefined);

  await renderNode(<GalleryToggleCard enabled onToggle={onToggle} />);
  expect(container?.querySelector('[data-testid="settings-switch"]')?.getAttribute('title')).toBe(
    'savePresets.section.galleryToggleOnTitle'
  );

  await renderNode(<GalleryToggleCard enabled={false} onToggle={onToggle} />);

  const toggle = container?.querySelector<HTMLButtonElement>('[data-testid="settings-switch"]');

  expect(toggle?.title).toBe('savePresets.section.galleryToggleOffTitle');
  act(() => {
    toggle?.click();
  });

  expect(onToggle).toHaveBeenCalled();
});

it('renders default preset selects and forwards each change handler', async () => {
  const onDefaultImageChange = vi.fn(async () => undefined);
  const onDefaultVideoChange = vi.fn(async () => undefined);
  const onDefaultExportChange = vi.fn(async () => undefined);

  await renderNode(
    <DefaultPresetsCard
      defaultExportPresetId="export-preset"
      defaultImagePresetId="image-preset"
      defaultVideoPresetId="video-preset"
      isLoading={false}
      onDefaultExportChange={onDefaultExportChange}
      onDefaultImageChange={onDefaultImageChange}
      onDefaultVideoChange={onDefaultVideoChange}
      presetOptions={[
        { value: 'image-preset', label: 'Image preset' },
        { value: 'video-preset', label: 'Video preset' },
        { value: 'export-preset', label: 'Export preset' },
      ]}
    />
  );

  const selects = Array.from(
    container?.querySelectorAll<HTMLSelectElement>('[data-testid="product-select"]') ?? []
  );

  act(() => {
    selects[0]?.dispatchEvent(new Event('change', { bubbles: true }));
    selects[1]?.dispatchEvent(new Event('change', { bubbles: true }));
    selects[2]?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(selects).toHaveLength(3);
  expect(container?.textContent).toContain('savePresets.section.defaultPresetsLabel');
  expect(onDefaultImageChange).toHaveBeenCalledWith('image-preset');
  expect(onDefaultVideoChange).toHaveBeenCalledWith('video-preset');
  expect(onDefaultExportChange).toHaveBeenCalledWith('export-preset');
});
