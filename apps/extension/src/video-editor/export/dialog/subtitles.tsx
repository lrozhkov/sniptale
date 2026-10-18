import { useMemo, useState } from 'react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { exportVideoProjectSubtitles } from '../../../features/video/project/text/subtitle-export';
import type { VideoProject } from '../../../features/video/project/types';
import { translate } from '../../../platform/i18n';
import { SelectField, ToggleField } from '../../../ui/compact-inspector-controls';
import { useSubtitleExport } from '../../runtime/subtitle-export';

/** Subtitle files have an explicit whole-project scope independent of video export settings. */
export function ProjectSubtitles({ project }: { project: VideoProject }) {
  const [format, setFormat] = useState<'srt' | 'vtt'>('srt');
  const [language, setLanguage] = useState('all');
  const [onlyShown, setOnlyShown] = useState(false);
  const [normalizeOverlaps, setNormalizeOverlaps] = useState(false);
  const download = useSubtitleExport();
  const languages = [
    ...new Set([
      ...(project.clips.some((clip) => clip.type === 'SUBTITLE') ? [''] : []),
      ...(project.textDocuments ?? []).flatMap((entry) =>
        entry.document.fragments.map((fragment) => fragment.language ?? '')
      ),
    ]),
  ];
  const result = useMemo(
    () =>
      exportVideoProjectSubtitles(project, {
        format,
        language: language === 'all' ? null : language.slice('language:'.length),
        onlyShown,
        normalizeOverlaps,
      }),
    [project, format, language, onlyShown, normalizeOverlaps]
  );
  return (
    <details
      data-ui="video-editor.export.subtitles"
      className="border-t border-[var(--sniptale-color-border-soft)] pt-3"
    >
      <summary className="cursor-pointer text-sm font-medium text-[var(--sniptale-color-text-primary)]">
        {translate('gallery.videoReview.subtitlesTitle')}
      </summary>
      <div className="mt-3 grid min-w-0 gap-2">
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.subtitlesScope')}:{' '}
          {translate('videoEditor.exportDialog.scopeProjectLabel')}
        </p>
        <SelectField
          label={translate('gallery.videoReview.subtitlesFormat')}
          value={format}
          onChange={setFormat}
          options={[
            { value: 'srt', label: translate('gallery.videoReview.subtitlesSrt') },
            { value: 'vtt', label: translate('gallery.videoReview.subtitlesWebVtt') },
          ]}
        />
        <SelectField
          label={translate('gallery.videoReview.subtitlesLanguage')}
          value={language}
          onChange={setLanguage}
          options={[
            { value: 'all', label: translate('gallery.videoReview.subtitlesAllLanguages') },
            ...languages.map((value) => ({
              value: `language:${value}`,
              label: value || translate('gallery.videoReview.subtitlesUnspecifiedLanguage'),
            })),
          ]}
        />
        <ToggleField
          label={translate('gallery.videoReview.subtitlesOnlyShown')}
          value={onlyShown}
          onChange={setOnlyShown}
        />
        {format === 'srt' ? (
          <ToggleField
            label={translate('gallery.videoReview.subtitlesNormalize')}
            value={normalizeOverlaps}
            onChange={setNormalizeOverlaps}
          />
        ) : null}
        <SubtitleExportFeedback result={result} format={format} />
        <ProductActionButton
          tone="secondary"
          disabled={!result.ok || result.count === 0}
          onClick={() => {
            if (result.ok) download.download(result.text, format);
          }}
        >
          {translate('gallery.videoReview.subtitlesDownload')}
        </ProductActionButton>
        {download.status !== 'idle' ? (
          <p role="status" className="text-xs text-[var(--sniptale-color-text-muted)]">
            {translate(
              download.status === 'started'
                ? 'gallery.videoReview.subtitlesDownloadStarted'
                : 'gallery.videoReview.subtitlesDownloadFailed'
            )}
          </p>
        ) : null}
      </div>
    </details>
  );
}

/** Eligibility and format warnings describe the generated artifact independently of form controls. */
function SubtitleExportFeedback({
  result,
  format,
}: {
  result: ReturnType<typeof exportVideoProjectSubtitles>;
  format: 'srt' | 'vtt';
}) {
  return result.ok ? (
    <>
      <p className="text-xs text-[var(--sniptale-color-text-muted)]">
        {translate('gallery.videoReview.subtitlesCount').replace('{count}', String(result.count))}
      </p>
      {result.normalized ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.subtitlesNormalized')}
        </p>
      ) : result.overlaps && format === 'srt' ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.subtitlesOverlap')}
        </p>
      ) : null}
      {result.excluded > 0 ? (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('gallery.videoReview.subtitlesExcluded')}
        </p>
      ) : null}
    </>
  ) : (
    <p role="alert" className="text-xs text-[var(--sniptale-color-text-muted)]">
      {translate('gallery.videoReview.subtitlesUnavailable')}
    </p>
  );
}
