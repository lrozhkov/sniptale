// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const locale = vi.hoisted(() => ({ prefix: '' }));
vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => locale.prefix + key,
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
  locale.prefix = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

it('refreshes source resolution and every quality label after a mounted locale change', () => {
  const onChange = vi.fn();
  for (const language of ['ru:', 'en:', 'ru:']) {
    locale.prefix = language;
    for (const [quality, label] of [
      [VideoExportQualityPreset.LOW, 'qualityLow'],
      [VideoExportQualityPreset.MEDIUM, 'qualityMedium'],
      [VideoExportQualityPreset.HIGH, 'qualityHigh'],
      [VideoExportQualityPreset.ULTRA, 'qualityUltra'],
    ] as const) {
      act(() => {
        root!.render(
          <ExportDialogSelectFields
            capabilities={null}
            onChange={onChange}
            selectedClipAvailable={false}
            sourceDimensions={{ width: 1920, height: 1080 }}
            settings={{
              downloadAfterExport: true,
              format: VideoExportFormat.MP4,
              mp4VideoCodec: VideoMp4Codec.AVC,
              resolution: VideoResolutionPreset.SOURCE,
              fps: 30,
              height: 1080,
              width: 1920,
              quality,
            }}
          />
        );
      });
      expect(container!.textContent).toContain(
        `${language}videoEditor.exportDialog.resolutionSource`
      );
      expect(container!.textContent).toContain(`${language}videoEditor.exportDialog.${label}`);
    }
  }
  expect(onChange).not.toHaveBeenCalled();
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

  const codecStatus = [
    ...container!.querySelectorAll('[data-ui="shared.ui.compact-inspector.status-row"]'),
  ].find((row) => row.textContent?.includes('videoEditor.exportDialog.codecLabel'));

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

  const statuses = [
    ...container!.querySelectorAll('[data-ui="shared.ui.compact-inspector.status-row"]'),
  ];
  const format = statuses.find((row) =>
    row.textContent?.includes('videoEditor.exportDialog.formatLabel')
  );
  expect(format?.textContent).toContain('videoEditor.exportDialog.formatWebmLabel');
  expect(format?.textContent).not.toContain('videoEditor.exportDialog.formatMp4Label');
  expect(
    container!.querySelector('[aria-label="videoEditor.exportDialog.formatLabel"]')
  ).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
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
    height: 500,
    resolution: VideoResolutionPreset.P1080,
    width: 1086,
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
    height: 478,
    resolution: VideoResolutionPreset.P480,
    width: 852,
  });

  renderFields({
    ...settings,
    height: 478,
    resolution: VideoResolutionPreset.P480,
    width: 852,
  });
  await selectResolution('1080p');
  expect(onChange).toHaveBeenLastCalledWith({
    height: 478,
    resolution: VideoResolutionPreset.P1080,
    width: 852,
  });

  renderFields({
    ...settings,
    height: 478,
    resolution: VideoResolutionPreset.P1080,
    width: 852,
  });
  await selectResolution('videoEditor.exportDialog.resolutionSource');
  expect(onChange).toHaveBeenLastCalledWith({
    height: 478,
    resolution: VideoResolutionPreset.SOURCE,
    width: 852,
  });
});

it('offers a selected timeline range independently of clip selection', async () => {
  const onChange = vi.fn();
  act(() =>
    root!.render(
      <ExportDialogSelectFields
        capabilities={null}
        onChange={onChange}
        selectedClipAvailable={false}
        selectedRangeAvailable
        sourceDimensions={{ width: 1920, height: 1080 }}
        settings={{
          downloadAfterExport: true,
          format: VideoExportFormat.MP4,
          mp4VideoCodec: VideoMp4Codec.AVC,
          resolution: VideoResolutionPreset.SOURCE,
          fps: 30,
          width: 1920,
          height: 1080,
          quality: VideoExportQualityPreset.MEDIUM,
        }}
      />
    )
  );
  const option = container!.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.scopeLabel"] ' +
      'button[title="videoEditor.exportDialog.scopeSelectedRangeLabel"]'
  );
  expect(option).toBeDefined();
  await act(async () => option!.click());
  expect(onChange).toHaveBeenCalledWith({ scope: 'selected-range' });
});

it('selects adaptive60 atomically and restores the editable constant rate', async () => {
  let settings: VideoProjectExportSettings = {
    format: 'WEBM',
    webmVideoCodec: 'VP9',
    width: 160,
    height: 90,
    fps: 24,
    quality: 'HIGH',
    resolution: 'SOURCE',
    downloadAfterExport: false,
  };
  const render = () =>
    root!.render(
      <ExportDialogSelectFields
        settings={settings}
        capabilities={null}
        selectedClipAvailable={false}
        sourceDimensions={settings}
        onChange={(patch) => {
          settings = { ...settings, ...patch } as VideoProjectExportSettings;
          render();
        }}
      />
    );
  await act(async () => render());
  const choose = async (index: number) => {
    await act(async () =>
      container!
        .querySelectorAll<HTMLButtonElement>(
          '[aria-label="videoEditor.exportDialog.frameRateMode"] button'
        )
        [index]!.click()
    );
  };
  await choose(1);
  expect(settings).toMatchObject({ fps: 60, frameRateMode: 'adaptive' });
  expect(container!.querySelector('[aria-label="videoEditor.exportDialog.fpsLabel"]')).toBeNull();
  await choose(0);
  expect(settings).toMatchObject({ fps: 60, frameRateMode: 'constant' });
  expect(
    container!.querySelector('[aria-label="videoEditor.exportDialog.fpsLabel"]')
  ).not.toBeNull();
});

it('exposes short export choices as selected segments and forwards codec and quality values', () => {
  const onChange = vi.fn();
  act(() =>
    root!.render(
      <ExportDialogSelectFields
        capabilities={null}
        onChange={onChange}
        selectedClipAvailable={false}
        sourceDimensions={{ width: 1920, height: 1080 }}
        settings={{
          format: VideoExportFormat.WEBM,
          webmVideoCodec: 'VP9',
          resolution: VideoResolutionPreset.SOURCE,
          fps: 30,
          width: 1920,
          height: 1080,
          quality: VideoExportQualityPreset.MEDIUM,
          downloadAfterExport: false,
        }}
      />
    )
  );
  expect(container!.querySelector('[aria-label="videoEditor.exportDialog.scopeLabel"]')).toBeNull();
  expect(container!.textContent).toContain('videoEditor.exportDialog.scopeProjectLabel');
  const codec = container!.querySelector('[aria-label="videoEditor.exportDialog.codecLabel"]')!;
  const quality = container!.querySelector('[aria-label="videoEditor.exportDialog.qualityLabel"]')!;
  expect(codec.querySelector('[aria-pressed="true"]')?.textContent).toBe('VP9');
  expect(quality.querySelector('[aria-pressed="true"]')?.textContent).toContain('qualityMedium');
  act(() => codec.querySelector<HTMLButtonElement>('[title="VP8"]')!.click());
  act(() =>
    quality
      .querySelector<HTMLButtonElement>('[title="videoEditor.exportDialog.qualityUltra"]')!
      .click()
  );
  expect(onChange).toHaveBeenCalledWith({ webmVideoCodec: 'VP8' });
  expect(onChange).toHaveBeenCalledWith({ quality: VideoExportQualityPreset.ULTRA });
  expect(
    container!
      .querySelector('[aria-label="videoEditor.exportDialog.resolutionLabel"]')
      ?.getAttribute('aria-haspopup')
  ).toBe('listbox');
});

it('keeps an unavailable current format visible until an available replacement is chosen', async () => {
  const onChange = vi.fn();
  act(() =>
    root!.render(
      <ExportDialogSelectFields
        capabilities={createVideoExportCapabilities({
          formats: [
            { format: VideoExportFormat.MP4, available: false },
            { format: VideoExportFormat.WEBM, available: true },
          ],
          mp4Codecs: [],
        })}
        onChange={onChange}
        selectedClipAvailable={false}
        sourceDimensions={{ width: 1920, height: 1080 }}
        settings={{
          format: VideoExportFormat.MP4,
          mp4VideoCodec: VideoMp4Codec.AVC,
          resolution: VideoResolutionPreset.SOURCE,
          fps: 30,
          width: 1920,
          height: 1080,
          quality: VideoExportQualityPreset.MEDIUM,
          downloadAfterExport: false,
        }}
      />
    )
  );
  const trigger = container!.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.exportDialog.formatLabel"]'
  )!;
  expect(trigger.textContent).toContain('videoEditor.exportDialog.formatMp4Label');
  expect(onChange).not.toHaveBeenCalled();
  act(() => trigger.click());
  const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  const available = options.filter((option) => !option.disabled);
  expect(available).toHaveLength(1);
  expect(available[0]?.textContent).toBe('videoEditor.exportDialog.formatWebmLabel');
  expect(
    options.find((option) => option.textContent === 'videoEditor.exportDialog.formatMp4Label')
      ?.disabled
  ).toBe(true);
  await act(async () => available[0]!.click());
  expect(onChange).toHaveBeenCalledWith({ format: VideoExportFormat.WEBM, webmVideoCodec: 'VP9' });
});
