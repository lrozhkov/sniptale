// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
  }) => (
    <select
      aria-label={props['aria-label']}
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
  ),
}));

import { CaptureActionRow, DownloadPresetRows } from './cards';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('keeps after-capture behavior separate from file destination controls', async () => {
  await act(async () => {
    root.render(
      <CaptureActionRow
        captureAction="download_default"
        captureActionOptions={[{ value: 'download_default', label: 'Download' }]}
        isLoading={false}
        onCaptureActionChange={vi.fn(async () => undefined)}
      />
    );
  });
  expect(container.querySelectorAll('select')).toHaveLength(1);
  expect(container.textContent).toContain('savePresets.section.captureActionDescription');
  expect(container.textContent).not.toContain('savePresets.section.downloadsDescription');
});

it('shows three compact file destination rows with live values and disabled state', async () => {
  const onDefaultImageChange = vi.fn(async () => undefined);
  const callbacks = {
    onDefaultExportChange: vi.fn(async () => undefined),
    onDefaultImageChange,
    onDefaultVideoChange: vi.fn(async () => undefined),
  };
  await act(async () => {
    root.render(
      <DownloadPresetRows
        {...callbacks}
        defaultExportPresetId="export"
        defaultImagePresetId="image"
        defaultVideoPresetId="video"
        isLoading={false}
        presetOptions={[
          { value: 'image', label: 'Image' },
          { value: 'video', label: 'Video' },
          { value: 'export', label: 'Export' },
        ]}
      />
    );
  });
  const selects = Array.from(container.querySelectorAll<HTMLSelectElement>('select'));
  expect(selects.map((select) => select.getAttribute('aria-label'))).toEqual([
    'savePresets.section.imagePresetLabel',
    'savePresets.section.videoPresetLabel',
    'savePresets.section.exportPresetLabel',
  ]);
  expect(selects.map((select) => select.value)).toEqual(['image', 'video', 'export']);
  expect(container.textContent).not.toContain('savePresets.section.captureActionLabel');
  await act(async () => {
    selects[0]!.value = 'video';
    selects[0]!.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(onDefaultImageChange).toHaveBeenCalledWith('video');
  await act(async () => {
    root.render(
      <DownloadPresetRows
        {...callbacks}
        defaultExportPresetId={null}
        defaultImagePresetId={null}
        defaultVideoPresetId={null}
        isLoading
        presetOptions={[{ value: '', label: 'Not set' }]}
      />
    );
  });
  expect(Array.from(container.querySelectorAll('select')).every((select) => select.disabled)).toBe(
    true
  );
});
