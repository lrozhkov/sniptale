// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
import { createVideoExportCapabilities } from '../../../features/video/project/export/capabilities';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMp4Codec,
} from '../../../features/video/project/types';
import { ExportDialogNumberField, ExportDialogSelectFields } from './select-fields';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('ignores invalid numeric text instead of forwarding NaN through export settings', () => {
  const onChange = vi.fn();

  act(() => {
    root?.render(
      <ExportDialogNumberField label="Width" min={1} onChange={onChange} step={1} value={1920} />
    );
  });

  const input = container?.querySelector('input');
  if (!input) {
    throw new Error('Export number input did not render');
  }

  act(() => {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  expect(onChange).not.toHaveBeenCalled();
});

it('renders a read-only codec field when MP4 has only one available codec', () => {
  const onChange = vi.fn();

  act(() => {
    root?.render(
      <ExportDialogSelectFields
        capabilities={createVideoExportCapabilities({
          formats: [
            { format: VideoExportFormat.MP4, available: true },
            { format: VideoExportFormat.WEBM, available: true },
          ],
          mp4Codecs: [{ codec: VideoMp4Codec.HEVC, available: true }],
        })}
        onChange={onChange}
        selectedClipAvailable={false}
        settings={{
          downloadAfterExport: true,
          format: VideoExportFormat.MP4,
          fps: 30,
          height: 1080,
          quality: VideoExportQualityPreset.BALANCED,
          width: 1920,
        }}
      />
    );
  });

  const codecStatus = container?.querySelector(
    '[data-ui="shared.ui.compact-inspector.status-row"]'
  );

  expect(codecStatus).not.toBeNull();
  expect(codecStatus?.textContent).toContain('videoEditor.exportDialog.codecHevcLabel');
});

it('hides MP4 from format options when capability probing marks it unavailable', () => {
  const onChange = vi.fn();

  act(() => {
    root?.render(
      <ExportDialogSelectFields
        capabilities={createVideoExportCapabilities({
          formats: [
            { format: VideoExportFormat.MP4, available: false },
            { format: VideoExportFormat.WEBM, available: false },
          ],
          mp4Codecs: [],
        })}
        onChange={onChange}
        selectedClipAvailable={false}
        settings={{
          downloadAfterExport: true,
          format: VideoExportFormat.WEBM,
          fps: 30,
          height: 1080,
          quality: VideoExportQualityPreset.BALANCED,
          width: 1920,
        }}
      />
    );
  });

  const formatTrigger = container?.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.formatLabel"]'
  );

  act(() => {
    formatTrigger?.click();
  });

  const options = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []
  ).map((button) => button.textContent);

  expect(options).toContain('videoEditor.exportDialog.formatWebmLabel');
  expect(options).not.toContain('videoEditor.exportDialog.formatMp4Label');
});
