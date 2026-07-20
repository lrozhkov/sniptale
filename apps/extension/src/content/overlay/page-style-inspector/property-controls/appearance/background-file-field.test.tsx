// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  PAGE_STYLE_ASSET_KINDS,
  type PageStyleAssetReference,
} from '@sniptale/runtime-contracts/page-style';
import { translate } from '../../../../../platform/i18n';
import { PageStyleAssetCleanupError } from '../../action-errors';
import type { PageStyleInspectorActionOutcome } from '../../types';
import { BackgroundFileField } from './background-file-field';

const mocks = vi.hoisted(() => ({
  getPageStyleAsset: vi.fn(),
}));

vi.mock('../../../../../composition/persistence/page-style/assets', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('../../../../../composition/persistence/page-style/assets')
  >()),
  getPageStyleAsset: mocks.getPageStyleAsset,
}));

let host: HTMLDivElement | null = null;
let root: Root | null = null;

const asset: PageStyleAssetReference = {
  assetId: 'asset-bg',
  filename: 'background.png',
  kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
  mimeType: 'image/png',
  size: 2048,
};

function renderField(
  props: {
    onClear?: () => Promise<PageStyleInspectorActionOutcome>;
    onSelect?: (file: File) => Promise<PageStyleInspectorActionOutcome>;
  } = {}
) {
  const onClear = props.onClear ?? vi.fn(async () => undefined);
  const onSelect = props.onSelect ?? vi.fn(async () => undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);

  act(() => {
    root?.render(
      <BackgroundFileField
        asset={asset}
        buttonLabel="Upload"
        disabled={false}
        label="Background file"
        onClear={onClear}
        onSelect={onSelect}
      />
    );
  });

  return { onClear, onSelect };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

it('shows selected file metadata and clears the file through the icon action', async () => {
  const { onClear } = renderField();

  expect(document.body.textContent).toContain('background.png');
  expect(document.body.textContent).toContain('2 KB');

  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        `button[aria-label="${translate('content.pageStyleInspector.backgroundFileClear')}"]`
      )
      ?.click();
  });

  expect(onClear).toHaveBeenCalledTimes(1);
});

it('passes the selected image file to the upload action', async () => {
  const { onSelect } = renderField();
  const file = new File(['image'], 'hero.png', { type: 'image/png' });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', { configurable: true, value: [file] });

  await act(async () => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(onSelect).toHaveBeenCalledWith(file);
});

it('previews the selected background image asset', async () => {
  const createObjectUrl = vi.fn(() => 'blob:background-preview');
  const revokeObjectUrl = vi.fn();
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: createObjectUrl,
    revokeObjectURL: revokeObjectUrl,
  });
  mocks.getPageStyleAsset.mockResolvedValueOnce({
    blob: new Blob(['image'], { type: 'image/png' }),
    kind: PAGE_STYLE_ASSET_KINDS.BACKGROUND_IMAGE,
  });

  renderField();
  await act(async () => {
    await Promise.resolve();
  });

  expect(createObjectUrl).toHaveBeenCalledTimes(1);
  expect(document.querySelector<HTMLImageElement>('img[alt="background.png"]')?.src).toBe(
    'blob:background-preview'
  );

  act(() => {
    root?.unmount();
  });
  root = null;

  expect(revokeObjectUrl).toHaveBeenCalledWith('blob:background-preview');
});

it('surfaces background upload compensation cleanup failures', async () => {
  renderField({
    onSelect: vi.fn(async () => {
      throw new PageStyleAssetCleanupError(['asset-new-bg']);
    }),
  });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['image'], 'bg.png', { type: 'image/png' })],
  });

  await act(async () => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(document.body.textContent).toContain(
    'Не удалось применить файл и очистить временную копию'
  );
});

it('surfaces background post-apply cleanup warnings', async () => {
  renderField({
    onSelect: vi.fn(async () => ({
      message: 'Действие выполнено, но часть файлов не удалось очистить',
      state: 'warning' as const,
    })),
  });
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [new File(['image'], 'bg.png', { type: 'image/png' })],
  });

  await act(async () => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
  });

  expect(document.body.textContent).toContain(
    'Действие выполнено, но часть файлов не удалось очистить'
  );
});
