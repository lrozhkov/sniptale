import type { ReactNode } from 'react';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { translate } from '../../../platform/i18n';
import {
  useVideoEditorHeaderController,
  useVideoEditorHistoryController,
} from '../../runtime/controller/composition/hooks';
import type { VideoEditorHeaderController } from '../../runtime/controller/contracts/header';
import { requestVideoEditorSaveRetry } from '../../runtime/session/save-retry';

const DOCUMENT_BAR_CLASS_NAME = 'flex min-w-0 flex-1 items-center justify-start gap-2';

const PROJECT_TITLE_CLASS_NAME = [
  'h-9 min-w-0 w-full rounded-[8px] border border-transparent bg-transparent',
  'px-2 text-left text-sm font-semibold text-[var(--sniptale-color-text-primary)] outline-none transition',
  'hover:border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
  'focus:border-[color:var(--sniptale-color-border-accent-strong)]',
  'focus:bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-input)_70%,transparent)]',
].join(' ');

type VideoEditorDocumentBarProps = {
  header: VideoEditorHeaderController;
  history: ReturnType<typeof useVideoEditorHistoryController>;
};

function VideoEditorProjectTitle({
  onRenameProject,
  projectName,
}: Pick<VideoEditorDocumentBarProps['header'], 'onRenameProject' | 'projectName'>) {
  return (
    <label
      className={[
        'grid min-w-[6rem] max-w-[24rem] shrink items-center',
        'focus-within:w-[30rem] focus-within:max-w-full',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className="invisible col-start-1 row-start-1 truncate px-2 text-sm font-semibold"
      >
        {projectName || ' '}
      </span>
      <input
        aria-label={translate('videoEditor.app.title')}
        value={projectName}
        onChange={(event) => onRenameProject(event.currentTarget.value)}
        className={`${PROJECT_TITLE_CLASS_NAME} col-start-1 row-start-1`}
      />
    </label>
  );
}

function VideoEditorSaveStateBadge({
  saveStateMeta,
}: Pick<VideoEditorDocumentBarProps['header'], 'saveStateMeta'>) {
  if (saveStateMeta.state !== 'error') return null;
  return (
    <span role="alert">
      <ValueBadge className={saveStateMeta.className}>
        {translate('videoEditor.app.saveChangesFailed')}
        <button
          type="button"
          className="ml-2 font-semibold underline underline-offset-2"
          onClick={requestVideoEditorSaveRetry}
        >
          {translate('common.actions.retry')}
        </button>
      </ValueBadge>
    </span>
  );
}

export function VideoEditorFloatingDocumentBar({ children }: { children?: ReactNode } = {}) {
  const header = useVideoEditorHeaderController();
  const history = useVideoEditorHistoryController();
  if (!header) return null;
  return (
    <div data-ui="video-editor.floating.document-bar" className={DOCUMENT_BAR_CLASS_NAME}>
      {children}
      {!children && (
        <VideoEditorProjectTitle
          projectName={header.projectName}
          onRenameProject={header.onRenameProject}
        />
      )}
      <VideoEditorSaveStateBadge saveStateMeta={header.saveStateMeta} />
      {history.error && (
        <span role="alert">
          <ValueBadge className="text-[var(--sniptale-color-danger)]">
            {translate('videoEditor.app.historyError')}
          </ValueBadge>
        </span>
      )}
    </div>
  );
}
