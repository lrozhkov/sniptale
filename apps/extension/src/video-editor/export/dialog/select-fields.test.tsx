// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
import { createVideoExportCapabilities } from '../../../features/video/project/export/capabilities';
import { VideoResolutionPreset } from '@sniptale/runtime-contracts/video/types/types';
import {
  VideoExportFormat,
  VideoExportQualityPreset,
  VideoMp4Codec,
  type VideoProjectExportSettings,
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
        sourceDimensions={{ height: 1080, width: 1920 }}
        settings={{
          downloadAfterExport: true,
          format: VideoExportFormat.MP4,
          resolution: 'SOURCE' as const,
          mp4VideoCodec: 'AVC' as const,
          fps: 30,
          height: 1080,
          quality: VideoExportQualityPreset.MEDIUM,
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
        sourceDimensions={{ height: 1080, width: 1920 }}
        settings={{
          downloadAfterExport: true,
          format: VideoExportFormat.WEBM,
          resolution: 'SOURCE' as const,
          webmVideoCodec: 'VP9' as const,
          fps: 30,
          height: 1080,
          quality: VideoExportQualityPreset.MEDIUM,
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

it('fits an arbitrary source into the selected standard resolution without distortion', async () => {
  const onChange = vi.fn();

  act(() => {
    root?.render(
      <ExportDialogSelectFields
        capabilities={null}
        onChange={onChange}
        selectedClipAvailable={false}
        sourceDimensions={{ height: 500, width: 1086 }}
        settings={{
          downloadAfterExport: true,
          format: VideoExportFormat.WEBM,
          resolution: 'SOURCE' as const,
          webmVideoCodec: 'VP9' as const,
          fps: 30,
          height: 500,
          quality: VideoExportQualityPreset.MEDIUM,
          width: 1086,
        }}
      />
    );
  });

  const resolutionTrigger = container?.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.resolutionLabel"]'
  );
  act(() => resolutionTrigger?.click());
  const option = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')
  ).find((button) => button.textContent === '1080p');
  await act(async () => {
    option?.click();
    await Promise.resolve();
  });

  expect(onChange).toHaveBeenCalledWith({
    height: 1080,
    resolution: VideoResolutionPreset.P1080,
    width: 2346,
  });
});

it('resolves every selection from immutable source dimensions without sequential drift', async () => {
  const onChange = vi.fn();
  const sourceDimensions = { height: 479, width: 853 };
  const settings: VideoProjectExportSettings = {
    downloadAfterExport: true,
    format: VideoExportFormat.WEBM,
    resolution: 'SOURCE' as const,
    webmVideoCodec: 'VP9' as const,
    fps: 30,
    height: 479,
    quality: VideoExportQualityPreset.MEDIUM,
    width: 853,
  };

  const renderFields = (nextSettings: VideoProjectExportSettings) => {
    act(() => {
      root?.render(
        <ExportDialogSelectFields
          capabilities={null}
          onChange={onChange}
          selectedClipAvailable={false}
          settings={nextSettings}
          sourceDimensions={sourceDimensions}
        />
      );
    });
  };
  const selectResolution = async (label: string) => {
    const trigger = container?.querySelector<HTMLButtonElement>(
      '[aria-label="videoEditor.exportDialog.resolutionLabel"]'
    );
    act(() => trigger?.click());
    const option = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="option"]')
    ).find((button) => button.textContent === label);
    await act(async () => {
      option?.click();
      await Promise.resolve();
    });
  };

  renderFields(settings);
  await selectResolution('480p');
  expect(onChange).toHaveBeenLastCalledWith({
    height: 480,
    resolution: VideoResolutionPreset.P480,
    width: 854,
  });

  renderFields({
    ...settings,
    height: 480,
    resolution: VideoResolutionPreset.P480,
    width: 854,
  });
  await selectResolution('1080p');
  expect(onChange).toHaveBeenLastCalledWith({
    height: 1080,
    resolution: VideoResolutionPreset.P1080,
    width: 1924,
  });

  renderFields({
    ...settings,
    height: 1080,
    resolution: VideoResolutionPreset.P1080,
    width: 1924,
  });
  await selectResolution('videoEditor.exportDialog.resolutionSource');
  expect(onChange).toHaveBeenLastCalledWith({
    height: 478,
    resolution: VideoResolutionPreset.SOURCE,
    width: 852,
  });
});
