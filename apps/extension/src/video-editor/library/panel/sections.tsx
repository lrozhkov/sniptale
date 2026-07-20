import type React from 'react';
import { Bug, FolderKanban, Library, Plus } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { OptionRow } from '../../../ui/compact-inspector-controls';
import { VideoEditorImportToolbar } from '../../chrome/import-toolbar';
import type { VideoEditorLibraryPanelProps } from '../contracts/panel';

export type LibraryPanelTab = 'media' | 'projects' | 'import' | 'diagnostics';

interface LibraryPanelTabItem {
  count?: number;
  icon: React.ReactNode;
  id: LibraryPanelTab;
  label: string;
}

type VideoEditorLibrarySectionProps = Pick<
  VideoEditorLibraryPanelProps,
  | 'activeProjectId'
  | 'diagnosticsContent'
  | 'diagnosticsOpen'
  | 'onCreateProject'
  | 'onToggleDiagnostics'
  | 'projects'
  | 'recordingId'
>;

export function LibraryPanelTitle({
  projectsCount,
  recordingsCount,
}: {
  projectsCount: number;
  recordingsCount: number;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {translate('videoEditor.app.libraryTitle')}
      </p>
      <p className="mt-0.5 truncate text-xs text-[var(--sniptale-color-text-muted)]">
        {projectsCount} {translate('videoEditor.sidebar.projectsSavedSuffix')} · {recordingsCount}{' '}
        {translate('videoEditor.sidebar.recordingsInDbSuffix')}
      </p>
    </div>
  );
}

export function LibraryPanelTabs(props: {
  activeTab: LibraryPanelTab;
  projectsCount: number;
  recordingsCount: number;
  diagnosticsAvailable: boolean;
  onTabChange: (tab: LibraryPanelTab) => void;
}) {
  const tabs = buildLibraryPanelTabs(props);

  return (
    <nav
      className="grid content-start gap-1"
      aria-label={translate('videoEditor.app.libraryButton')}
    >
      {tabs.map((tab) => (
        <LibraryPanelTabButton
          key={tab.id}
          active={props.activeTab === tab.id}
          count={tab.count}
          icon={tab.icon}
          label={tab.label}
          onClick={() => props.onTabChange(tab.id)}
        />
      ))}
    </nav>
  );
}

function buildLibraryPanelTabs(props: {
  projectsCount: number;
  recordingsCount: number;
  diagnosticsAvailable: boolean;
}): LibraryPanelTabItem[] {
  const tabs: LibraryPanelTabItem[] = [
    {
      count: props.recordingsCount,
      icon: <Library size={15} strokeWidth={2} />,
      id: 'media',
      label: translate('videoEditor.app.mediaButton'),
    },
    {
      count: props.projectsCount,
      icon: <FolderKanban size={15} strokeWidth={2} />,
      id: 'projects',
      label: translate('videoEditor.sidebar.projectsTitle'),
    },
    {
      icon: <Plus size={15} strokeWidth={2.2} />,
      id: 'import',
      label: translate('videoEditor.sidebar.libraryImportTab'),
    },
  ];

  if (props.diagnosticsAvailable) {
    tabs.push({
      icon: <Bug size={15} strokeWidth={2} />,
      id: 'diagnostics',
      label: translate('videoEditor.sidebar.diagnosticsTitle'),
    });
  }

  return tabs;
}

function LibraryPanelTabButton(props: {
  active: boolean;
  count: number | undefined;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={[
        'grid h-10 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-[8px] px-2.5',
        'border text-left text-xs font-semibold transition-colors',
        props.active
          ? [
              'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_42%,var(--sniptale-color-border-soft))]',
              'bg-[color:var(--sniptale-color-accent-soft)] text-[var(--sniptale-color-text-primary)]',
            ].join(' ')
          : [
              'border-transparent text-[var(--sniptale-color-text-secondary)]',
              'hover:border-[color:var(--sniptale-color-border-soft)]',
              'hover:bg-[color:var(--sniptale-color-surface-hover)]',
            ].join(' '),
      ].join(' ')}
      aria-pressed={props.active}
      onClick={props.onClick}
    >
      <span className="text-[var(--sniptale-color-text-muted)]">{props.icon}</span>
      <span className="truncate">{props.label}</span>
      {props.count === undefined ? null : (
        <span
          className={[
            'rounded-full bg-[color:var(--sniptale-color-surface-canvas)] px-1.5 py-0.5',
            'text-[10px] text-[var(--sniptale-color-text-muted)]',
          ].join(' ')}
        >
          {props.count}
        </span>
      )}
    </button>
  );
}

export function CurrentProjectStrip({
  activeProjectId,
  projects,
}: Pick<VideoEditorLibrarySectionProps, 'activeProjectId' | 'projects'>) {
  const activeProject = projects.find((item) => item.id === activeProjectId);

  return (
    <div
      className={[
        'rounded-[10px] border border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:var(--sniptale-color-surface-panel)] px-2.5 py-2',
      ].join(' ')}
      data-ui="video-editor.library.current-project"
    >
      <p className="truncate text-[10px] font-semibold uppercase text-[var(--sniptale-color-text-muted)]">
        {translate('videoEditor.sidebar.libraryCurrentProjectTitle')}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-[var(--sniptale-color-text-primary)]">
        {activeProject?.name || translate('videoEditor.sidebar.untitledProject')}
      </p>
    </div>
  );
}

export function ImportSection(props: {
  onCreateProject: () => void | Promise<void>;
  onImportAudio: () => void;
  onImportImage: () => void;
  onImportVideo: () => void;
  onRecordAudio: () => void;
}) {
  return (
    <div className="grid gap-3" data-ui="video-editor.library.import-tab">
      <LibraryTabHeading
        title={translate('videoEditor.sidebar.libraryImportTab')}
        meta={translate('videoEditor.sidebar.libraryImportMeta')}
      />
      <VideoEditorImportToolbar
        onCreateProject={props.onCreateProject}
        onImportImage={props.onImportImage}
        onImportVideo={props.onImportVideo}
        onImportAudio={props.onImportAudio}
        onRecordAudio={props.onRecordAudio}
        presentation="panel"
      />
    </div>
  );
}

export function DiagnosticsSection({
  diagnosticsContent,
  diagnosticsOpen,
  onToggleDiagnostics,
}: Pick<
  VideoEditorLibrarySectionProps,
  'diagnosticsContent' | 'diagnosticsOpen' | 'onToggleDiagnostics' | 'recordingId'
>) {
  return (
    <div className="grid gap-3" data-ui="video-editor.library.diagnostics-tab">
      <LibraryTabHeading title={translate('videoEditor.sidebar.diagnosticsTitle')} />
      <OptionRow
        active={diagnosticsOpen}
        label={
          diagnosticsOpen
            ? translate('videoEditor.sidebar.hideDiagnostics')
            : translate('videoEditor.sidebar.showDiagnostics')
        }
        onToggle={() => onToggleDiagnostics(!diagnosticsOpen)}
      />
      {diagnosticsOpen ? diagnosticsContent : null}
    </div>
  );
}

export function LibraryTabHeading({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <h3 className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
        {title}
      </h3>
      {meta ? (
        <span className="shrink-0 text-[11px] text-[var(--sniptale-color-text-muted)]">{meta}</span>
      ) : null}
    </div>
  );
}
