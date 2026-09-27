import type { ReactNode } from 'react';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { translate } from '../../../platform/i18n';
import {
  useVideoEditorHeaderController,
  useVideoEditorHistoryController,
} from '../../runtime/controller/composition/hooks';
import type { VideoEditorHeaderController } from '../../runtime/controller/contracts/header';

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
      className={['grid min-w-[6rem] max-w-full shrink items-center', 'focus-within:flex-1'].join(
        ' '
      )}
    >
      <span
        aria-hidden="true"
        className={[
          'invisible col-start-1 row-start-1 min-w-0 overflow-hidden whitespace-pre border',
          'border-transparent pl-2 pr-2.5 text-sm font-semibold',
        ].join(' ')}
      >
        {projectName || ' '}
      </span>
      <input
        aria-label={translate('videoEditor.app.title')}
        value={projectName}
        onChange={(event) => onRenameProject(event.currentTarget.value)}
        className={`${PROJECT_TITLE_CLASS_NAME} col-start-1 row-start-1 text-ellipsis focus:text-clip`}
      />
    </label>
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
