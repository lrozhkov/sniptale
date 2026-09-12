import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { exportGuideHtml } from './runtime/html-export';

/** UI owns only a disposable export command and cancellation; file effects have one runtime owner. */
export function GuideHtmlExport({ project, t }: { project: GuideProject; t: Translate }) {
  const [status, setStatus] = useState<'idle' | 'pending' | 'saved' | 'history-failed' | 'failed'>(
    'idle'
  );
  const job = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      job.current?.abort();
      job.current = null;
    },
    []
  );
  const save = async () => {
    if (job.current) return;
    const controller = new AbortController();
    job.current = controller;
    setStatus('pending');
    try {
      const result = await exportGuideHtml({
        project,
        t,
        signal: controller.signal,
        theme: document.documentElement.dataset['theme'] === 'dark' ? 'dark' : 'light',
      });
      if (job.current === controller) setStatus(result);
    } catch (error) {
      if (job.current === controller)
        setStatus(
          controller.signal.aborted ||
            (error instanceof DOMException && error.name === 'AbortError')
            ? 'idle'
            : 'failed'
        );
    } finally {
      if (job.current === controller) job.current = null;
    }
  };
  return (
    <div className="guide-html-export">
      <ContentToolbarButton
        title={t('scenario.editor.guideHtmlExport')}
        disabled={status === 'pending'}
        onClick={() => void save()}
      >
        <Download size={16} aria-hidden="true" />
      </ContentToolbarButton>
      {status === 'pending' && (
        <ContentToolbarButton
          title={t('common.actions.cancel')}
          onClick={() => job.current?.abort()}
        >
          <X size={16} aria-hidden="true" />
        </ContentToolbarButton>
      )}
      {status !== 'idle' && (
        <span role="status">
          {t(
            status === 'pending'
              ? 'scenario.editor.guideHtmlPreparing'
              : status === 'saved'
                ? 'scenario.editor.guideHtmlSaved'
                : status === 'history-failed'
                  ? 'scenario.editor.guideHtmlHistoryFailed'
                  : 'scenario.editor.guideHtmlFailed'
          )}
        </span>
      )}
    </div>
  );
}
