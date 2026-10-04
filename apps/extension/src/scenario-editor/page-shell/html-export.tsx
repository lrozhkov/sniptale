import { useEffect, useRef, useState } from 'react';
import { Download, FileText, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { exportGuideHtml } from './runtime/html-export';
import { MissingGuideHtmlImageError } from './runtime/html-images';
import { guideHtmlImages } from './html-image-settings';
import { DEFAULT_GUIDE_READING, type GuideReadingOptions } from './reader-pages';
import { exportGuideMarkdown } from './runtime/markdown-export';

type ExportFeedback = {
  format: 'html' | 'markdown';
  status: 'idle' | 'pending' | 'saved' | 'history-failed' | 'failed' | 'missing-image';
  missingNumber?: number;
};

/** Classifies one command outcome without acquiring or publishing another export. */
function exportFailure(
  error: unknown,
  signal: AbortSignal,
  project: GuideProject
): Omit<ExportFeedback, 'format'> {
  if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError'))
    return { status: 'idle' };
  if (error instanceof MissingGuideHtmlImageError)
    return {
      status: 'missing-image',
      missingNumber:
        guideHtmlImages(project).findIndex(({ block }) => block.id === error.blockId) + 1,
    };
  return { status: 'failed' };
}

const exportMessages = {
  html: {
    pending: 'scenario.editor.guideHtmlPreparing',
    saved: 'scenario.editor.guideHtmlSaved',
    failed: 'scenario.editor.guideHtmlFailed',
  },
  markdown: {
    pending: 'scenario.editor.guideMarkdownPreparing',
    saved: 'scenario.editor.guideMarkdownSaved',
    failed: 'scenario.editor.guideMarkdownFailed',
  },
} as const;

/** Both formats share a single translated feedback surface. */
function exportFeedbackText(feedback: ExportFeedback, t: Translate): string {
  if (feedback.status === 'idle') return '';
  if (feedback.status === 'missing-image')
    return t('scenario.editor.htmlMissingImage').replace(
      '{number}',
      String(feedback.missingNumber)
    );
  if (feedback.status === 'history-failed') return t('scenario.editor.guideHtmlHistoryFailed');
  return t(exportMessages[feedback.format][feedback.status]);
}

/** UI owns only a disposable export command and cancellation; file effects have one runtime owner. */
export function GuideHtmlExport({
  project,
  t,
  reading = DEFAULT_GUIDE_READING,
}: {
  project: GuideProject;
  t: Translate;
  reading?: GuideReadingOptions;
}) {
  const [feedback, setFeedback] = useState<ExportFeedback>({ format: 'html', status: 'idle' });
  const { status } = feedback;
  const job = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      job.current?.abort();
      job.current = null;
    },
    []
  );
  const save = async (format: 'html' | 'markdown') => {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setFeedback({ format, status: 'pending' });
    try {
      const args = {
        project,
        t,
        signal: controller.signal,
      };
      const result =
        format === 'html'
          ? await exportGuideHtml({
              ...args,
              reading,
              theme: document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light',
            })
          : await exportGuideMarkdown(args);
      if (job.current === controller) setFeedback({ format, status: result });
    } catch (error) {
      if (job.current === controller)
        setFeedback({ format, ...exportFailure(error, controller.signal, project) });
    } finally {
      if (job.current === controller) job.current = null;
    }
  };
  return (
    <div className="guide-html-export">
      <ContentToolbarButton
        className="guide-labeled-action"
        title={t('scenario.editor.guideHtmlExport')}
        disabled={status === 'pending'}
        onClick={() => void save('html')}
      >
        <Download size={16} aria-hidden="true" />
        <span>{t('scenario.editor.guideHtmlFormat')}</span>
      </ContentToolbarButton>
      <ContentToolbarButton
        className="guide-labeled-action"
        title={t('scenario.editor.guideMarkdownExport')}
        disabled={status === 'pending'}
        onClick={() => void save('markdown')}
      >
        <FileText size={16} aria-hidden="true" />
        <span>{t('scenario.editor.guideMarkdownFormat')}</span>
      </ContentToolbarButton>
      {status === 'pending' && (
        <ContentToolbarButton
          className="guide-labeled-action"
          title={t('common.actions.cancel')}
          onClick={() => job.current?.abort()}
        >
          <X size={16} aria-hidden="true" />
          <span>{t('common.actions.cancel')}</span>
        </ContentToolbarButton>
      )}
      {status !== 'idle' && <span role="status">{exportFeedbackText(feedback, t)}</span>}
    </div>
  );
}
