// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const { productSelectPropsSpy } = vi.hoisted(() => ({
  productSelectPropsSpy: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('@sniptale/ui/product-form-controls', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@sniptale/ui/product-form-controls')>()),
  ProductSelect: (props: {
    'aria-label'?: string;
    disabled?: boolean;
    onChange: (value: string) => void | Promise<void>;
    options: Array<{ label: string; value: string }>;
    value: string;
  }) => {
    productSelectPropsSpy(props);
    return (
      <select
        aria-label={props['aria-label']}
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

import { SaveSettingsRows } from './cards';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  productSelectPropsSpy.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('renders the save controls as compact label-and-select rows', async () => {
  const onCaptureActionChange = vi.fn(async () => undefined);
  const onDefaultImageChange = vi.fn(async () => undefined);
  const onDefaultVideoChange = vi.fn(async () => undefined);
  const onDefaultExportChange = vi.fn(async () => undefined);

  await act(async () => {
    root?.render(
      <SaveSettingsRows
        captureAction="download_default"
        captureActionOptions={[{ value: 'download_default', label: 'Download' }]}
        defaultExportPresetId="export"
        defaultImagePresetId="image"
        defaultVideoPresetId="video"
        isLoading={false}
        onCaptureActionChange={onCaptureActionChange}
        onDefaultExportChange={onDefaultExportChange}
        onDefaultImageChange={onDefaultImageChange}
        onDefaultVideoChange={onDefaultVideoChange}
        presetOptions={[
          { value: 'image', label: 'Image' },
          { value: 'video', label: 'Video' },
          { value: 'export', label: 'Export' },
        ]}
      />
    );
  });

  const selects = Array.from(
    container?.querySelectorAll<HTMLSelectElement>('[data-testid="product-select"]') ?? []
  );
  expect(selects).toHaveLength(4);
  expect(selects.map((select) => select.getAttribute('aria-label'))).toEqual([
    'savePresets.section.captureActionLabel',
    'savePresets.section.imagePresetLabel',
    'savePresets.section.videoPresetLabel',
    'savePresets.section.exportPresetLabel',
  ]);
  expect(container?.textContent).toContain('savePresets.section.captureActionLabel');
  expect(container?.textContent).toContain('savePresets.section.imagePresetLabel');
  expect(container?.textContent).not.toContain('savePresets.section.saveToGalleryLabel');
  expect(container?.firstElementChild?.className).not.toContain('divide-y');
  expect(container?.textContent).toContain('savePresets.section.captureActionDescription');
  expect(container?.textContent).toContain('savePresets.section.downloadsDescription');

  await act(async () => {
    root?.render(
      <SaveSettingsRows
        captureAction="download_default"
        captureActionOptions={[{ value: 'download_default', label: 'Download' }]}
        defaultExportPresetId={null}
        defaultImagePresetId={null}
        defaultVideoPresetId={null}
        isLoading
        onCaptureActionChange={onCaptureActionChange}
        onDefaultExportChange={onDefaultExportChange}
        onDefaultImageChange={onDefaultImageChange}
        onDefaultVideoChange={onDefaultVideoChange}
        presetOptions={[{ value: '', label: 'Not set' }]}
      />
    );
  });

  expect(productSelectPropsSpy).toHaveBeenLastCalledWith(
    expect.objectContaining({ disabled: true, value: '' })
  );
});
