import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Download } from 'lucide-react';
import { ProductField, ProductSelect } from '@sniptale/ui/product-form-controls';
import { ProductGlassSwitch } from '@sniptale/ui/product-glass-controls';
import { exportReviewSubtitles } from '../../features/video/review/subtitle-export';
import type { ReviewTextDocument } from '../../features/video/review/text-types';
import { downloadGalleryBlob } from '../shared/download';
import { ReviewIntervalMap } from './interval-timing';
import { ReviewButton, ReviewDetails, reviewTextButtonClassName } from './controls';
import { translate } from '../../platform/i18n';

type SubtitlesProps = {
  document: ReviewTextDocument;
  ids: readonly string[];
  wholeDocument: boolean;
  mainOffset: number | null;
  disabled: boolean;
  onClose(): void;
};

/** One local file attempt owns projection, options and mounted download feedback. */
function useReviewSubtitleFile(props: SubtitlesProps) {
  const segments = useContext(ReviewIntervalMap);
  const [format, setFormat] = useState<'srt' | 'vtt'>('vtt');
  const [language, setLanguage] = useState<string | null>(null);
  const [onlyShown, setOnlyShown] = useState(false);
  const [normalizeOverlaps, setNormalizeOverlaps] = useState(false);
  const [download, setDownload] = useState<'idle' | 'started' | 'complete' | 'failed'>('idle');
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const ids = props.wholeDocument
    ? props.document.fragments.map((fragment) => fragment.id)
    : props.ids;
  const languages = [...new Set(props.document.fragments.map((entry) => entry.language ?? ''))];
  const result = useMemo(() => {
    if (!segments || props.mainOffset === null) return null;
    return exportReviewSubtitles({
      fragments: props.document.fragments,
      segments,
      ids: props.wholeDocument
        ? props.document.fragments.map((fragment) => fragment.id)
        : props.ids,
      format,
      language,
      onlyShown,
      normalizeOverlaps,
      mainOffset: props.mainOffset,
    });
  }, [
    segments,
    props.document,
    props.ids,
    props.wholeDocument,
    props.mainOffset,
    format,
    language,
    onlyShown,
    normalizeOverlaps,
  ]);
  const start = () => {
    if (!result?.ok || !result.count || props.disabled || download === 'started') return;
    setDownload('started');
    try {
      downloadGalleryBlob(
        new Blob([result.text], {
          type: format === 'vtt' ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8',
        }),
        `subtitles.${format}`,
        undefined,
        undefined,
        (state) => {
          if (mounted.current)
            setDownload(
              state === 'interrupted' ? 'failed' : state === 'complete' ? 'complete' : 'idle'
            );
        }
      );
    } catch {
      setDownload('failed');
    }
  };
  return {
    ids,
    languages,
    result,
    format,
    setFormat,
    language,
    setLanguage,
    onlyShown,
    setOnlyShown,
    normalizeOverlaps,
    setNormalizeOverlaps,
    download,
    setDownload,
    start,
  };
}

/** Disposable sidecar settings occupy the same exclusive inspector without project or audio writes. */
export function ReviewTextSubtitlesForm(props: SubtitlesProps) {
  const file = useReviewSubtitleFile(props);
  const { ids, result, download } = file;
  return (
    <section
      data-ui="gallery.videoReview.textSubtitles"
      className="min-w-0 space-y-2"
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-2">
        <ReviewButton
          autoFocus
          label={translate('gallery.videoReview.textVoiceBack')}
          className={reviewTextButtonClassName}
          onClick={props.onClose}
        >
          <ArrowLeft size={14} />
        </ReviewButton>
        <span className="text-xs font-medium">
          {translate('gallery.videoReview.subtitlesTitle')}
        </span>
      </div>
      <ProductField label={translate('gallery.videoReview.subtitlesScope')}>
        <span className="text-xs">
          {translate(
            props.wholeDocument
              ? 'gallery.videoReview.textRewriteAllScope'
              : 'gallery.videoReview.textRewriteSelectedScope'
          ).replace('{count}', String(ids.length))}
        </span>
      </ProductField>
      <fieldset disabled={props.disabled || download === 'started'} className="min-w-0 space-y-2">
        <SubtitleFileSettings file={file} />
      </fieldset>
      <p className="text-xs">{translate('gallery.videoReview.subtitlesClock')}</p>
      <SubtitleFilePreview result={result} format={file.format} />
      {download === 'failed' && (
        <p role="alert" className="text-xs">
          {translate('gallery.videoReview.subtitlesDownloadFailed')}
        </p>
      )}
      {download === 'started' && (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.subtitlesDownloadStarted')}
        </p>
      )}
      {download === 'complete' && (
        <p role="status" className="text-xs">
          {translate('gallery.videoReview.subtitlesDownloaded')}
        </p>
      )}
      <ReviewButton
        label={translate('gallery.videoReview.subtitlesDownload')}
        className={reviewTextButtonClassName}
        disabled={props.disabled || !result?.ok || !result.count || download === 'started'}
        onClick={file.start}
      >
        <Download size={14} /> {translate('gallery.videoReview.subtitlesDownload')}
      </ReviewButton>
    </section>
  );
}

function SubtitleFileSettings({ file }: { file: ReturnType<typeof useReviewSubtitleFile> }) {
  return (
    <>
      <ProductField label={translate('gallery.videoReview.subtitlesFormat')}>
        <ProductSelect
          aria-label={translate('gallery.videoReview.subtitlesFormat')}
          value={file.format}
          options={[
            { value: 'vtt', label: translate('gallery.videoReview.subtitlesWebVtt') },
            { value: 'srt', label: translate('gallery.videoReview.subtitlesSrt') },
          ]}
          onChange={(value) => {
            file.setFormat(value);
            file.setDownload('idle');
          }}
        />
      </ProductField>
      <ProductField label={translate('gallery.videoReview.subtitlesLanguage')}>
        <ProductSelect
          aria-label={translate('gallery.videoReview.subtitlesLanguage')}
          value={file.language === null ? 'all' : `language:${file.language}`}
          options={[
            { value: 'all', label: translate('gallery.videoReview.subtitlesAllLanguages') },
            ...file.languages.map((value) => ({
              value: `language:${value}`,
              label: value || translate('gallery.videoReview.subtitlesUnspecifiedLanguage'),
            })),
          ]}
          onChange={(value) => {
            file.setLanguage(value === 'all' ? null : value.slice('language:'.length));
            file.setDownload('idle');
          }}
        />
      </ProductField>
      <SubtitleSwitch
        label={translate('gallery.videoReview.subtitlesOnlyShown')}
        on={file.onlyShown}
        onChange={() => {
          file.setOnlyShown((value) => !value);
          file.setDownload('idle');
        }}
      />
      {file.format === 'srt' &&
        (file.normalizeOverlaps || (file.result?.ok && file.result.overlaps)) && (
          <SubtitleSwitch
            label={translate('gallery.videoReview.subtitlesNormalize')}
            on={file.normalizeOverlaps}
            onChange={() => {
              file.setNormalizeOverlaps((value) => !value);
              file.setDownload('idle');
            }}
          />
        )}
    </>
  );
}

function SubtitleFilePreview({
  result,
  format,
}: {
  result: ReturnType<typeof useReviewSubtitleFile>['result'];
  format: 'srt' | 'vtt';
}) {
  return (
    <>
      {!result || !result.ok ? (
        <p role="alert" className="text-xs">
          {translate('gallery.videoReview.subtitlesUnavailable')}
        </p>
      ) : (
        <>
          <p role="status" className="text-xs">
            {translate('gallery.videoReview.subtitlesCount').replace(
              '{count}',
              String(result.count)
            )}
          </p>
          {!!result.approximate && (
            <p className="text-xs">{translate('gallery.videoReview.recognitionApproximate')}</p>
          )}
          {result.overlaps && (
            <p className="text-xs">
              {translate(
                result.normalized
                  ? 'gallery.videoReview.subtitlesNormalized'
                  : format === 'srt'
                    ? 'gallery.videoReview.subtitlesOverlap'
                    : 'gallery.videoReview.subtitlesSimultaneous'
              )}
            </p>
          )}
          {!!result.excluded && (
            <p className="text-xs">{translate('gallery.videoReview.subtitlesExcluded')}</p>
          )}
          {result.blankLines && (
            <p className="text-xs">{translate('gallery.videoReview.subtitlesBlankLines')}</p>
          )}
          <ReviewDetails
            preferenceId="text-subtitles-preview"
            label={translate('gallery.videoReview.subtitlesPreview')}
          >
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">
              {result.text.slice(0, 4000)}
            </pre>
            {result.text.length > 4000 && (
              <p className="text-xs">{translate('gallery.videoReview.subtitlesPreviewLimited')}</p>
            )}
          </ReviewDetails>
        </>
      )}
    </>
  );
}

function SubtitleSwitch(props: { label: string; on: boolean; onChange(): void }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-2 text-xs">
      <span>{props.label}</span>
      <ProductGlassSwitch
        role="switch"
        aria-label={props.label}
        aria-checked={props.on}
        on={props.on}
        onClick={props.onChange}
      />
    </div>
  );
}
