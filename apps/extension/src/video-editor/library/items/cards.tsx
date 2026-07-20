import type { ReactNode } from 'react';
import { Film, Image, Library, Trash2, FolderOpen } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { EmptyState } from '../../../ui/compact-inspector-controls';

type LibraryItemVariant = 'row' | 'card';
type LibraryItemActionTone = 'neutral' | 'danger' | 'accent';
type LibraryPreviewFallback = 'project' | 'recording';

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

const ROW_SHELL_CLASS_NAME = 'grid grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-[10px] px-3 py-3';
const CARD_SHELL_CLASS_NAME = 'rounded-[16px] px-3 py-3';

const ACTIVE_ITEM_CLASS_NAME = [
  'border-[color:var(--sniptale-color-border-accent-strong)]',
  'bg-[color:var(--sniptale-color-accent-soft)]',
].join(' ');

const DEFAULT_ITEM_CLASS_NAME =
  'border-[color:var(--sniptale-color-border-soft)] bg-[color:var(--sniptale-color-surface-panel)]';

const ACTION_ICON_SIZE: Record<LibraryItemVariant, number> = {
  card: 14,
  row: 13,
};

const ACTION_HEIGHT_CLASS_NAME: Record<LibraryItemVariant, string> = {
  card: 'h-10',
  row: '!h-8 !min-h-8',
};

const ACTION_JUSTIFY_CLASS_NAME: Record<LibraryItemVariant, string> = {
  card: 'justify-center',
  row: '',
};

function resolveActionTone(tone: LibraryItemActionTone): 'primary' | 'secondary' | 'danger' {
  if (tone === 'accent') {
    return 'primary';
  }

  if (tone === 'danger') {
    return 'danger';
  }

  return 'secondary';
}

export function formatDimensions(width: number | null, height: number | null): string | null {
  return width && height ? `${width}x${height}` : null;
}

export function LibraryItemShell(props: {
  active?: boolean;
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  role?: string;
  tabIndex?: number;
  variant: LibraryItemVariant;
}) {
  return (
    <div
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
      role={props.role}
      tabIndex={props.tabIndex}
      className={cx(
        'border',
        props.variant === 'row' ? ROW_SHELL_CLASS_NAME : CARD_SHELL_CLASS_NAME,
        props.active ? ACTIVE_ITEM_CLASS_NAME : DEFAULT_ITEM_CLASS_NAME,
        props.active && props.variant === 'card' ? 'shadow-sm' : null,
        props.className
      )}
    >
      {props.children}
    </div>
  );
}

export function LibraryItemTitle({ children }: { children: ReactNode }) {
  return (
    <p className="truncate text-sm font-medium text-[var(--sniptale-color-text-primary)]">
      {children}
    </p>
  );
}

export function LibraryItemMetadataLine({ values }: { values: Array<string | null | undefined> }) {
  const visibleValues = values.filter(Boolean);

  return (
    <p className="truncate text-xs text-[var(--sniptale-color-text-secondary)]">
      {visibleValues.join(' · ')}
    </p>
  );
}

export function LibraryPreviewSlot(props: {
  alt: string;
  fallback: LibraryPreviewFallback;
  compact?: boolean;
  hero?: boolean;
  thumbnailUrl: string | undefined;
}) {
  const Icon = props.fallback === 'project' ? Image : Film;
  const sizeClassName = props.hero
    ? 'aspect-video w-full'
    : props.compact
      ? 'h-12 w-[4.5rem]'
      : 'h-16 w-24';

  return (
    <div
      className={[
        'relative shrink-0 overflow-hidden rounded-[8px] border',
        sizeClassName,
        'border-[color:var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-canvas)_72%,#000_28%)]',
      ].join(' ')}
      data-ui="library-thumbnail"
    >
      {props.thumbnailUrl ? (
        <img className="h-full w-full object-cover" src={props.thumbnailUrl} alt={props.alt} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[var(--sniptale-color-text-dim)]">
          <Icon size={20} strokeWidth={1.8} aria-hidden />
        </div>
      )}
    </div>
  );
}

function LibraryItemActionButton(props: {
  children: ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  icon: ReactNode;
  onClick: () => void;
  tone: LibraryItemActionTone;
  variant: LibraryItemVariant;
}) {
  return (
    <ProductActionButton
      type="button"
      disabled={props.disabled}
      tone={resolveActionTone(props.tone)}
      compact={props.variant === 'row'}
      data-ui="video-editor.library.item-action"
      className={cx(
        'gap-1.5 px-2.5 text-xs',
        ACTION_HEIGHT_CLASS_NAME[props.variant],
        ACTION_JUSTIFY_CLASS_NAME[props.variant],
        props.fullWidth ? 'w-full' : null,
        'disabled:cursor-not-allowed disabled:opacity-40'
      )}
      onClick={props.onClick}
    >
      {props.icon}
      {props.children}
    </ProductActionButton>
  );
}

export function OpenProjectAction(props: {
  disabled: boolean;
  onOpenProject: (projectId: string) => void | Promise<void>;
  projectId: string;
  variant: LibraryItemVariant;
}) {
  return (
    <LibraryItemActionButton
      disabled={props.disabled}
      icon={<FolderOpen size={ACTION_ICON_SIZE[props.variant]} strokeWidth={2} />}
      onClick={() => void props.onOpenProject(props.projectId)}
      tone="neutral"
      variant={props.variant}
    >
      {translate('videoEditor.sidebar.openButton')}
    </LibraryItemActionButton>
  );
}

export function DeleteProjectAction(props: {
  onDeleteProject: (projectId: string) => void | Promise<void>;
  projectId: string;
  variant: LibraryItemVariant;
}) {
  return (
    <LibraryItemActionButton
      icon={<Trash2 size={ACTION_ICON_SIZE[props.variant]} strokeWidth={2} />}
      onClick={() => void props.onDeleteProject(props.projectId)}
      tone="danger"
      variant={props.variant}
    >
      {translate('videoEditor.sidebar.deleteButton')}
    </LibraryItemActionButton>
  );
}

export function AddRecordingAction(props: {
  fullWidth?: boolean;
  onAddRecording: (recordingId: string) => void;
  recordingId: string;
  variant: LibraryItemVariant;
}) {
  return (
    <LibraryItemActionButton
      fullWidth={props.fullWidth === true}
      icon={<Library size={ACTION_ICON_SIZE[props.variant]} strokeWidth={2} />}
      onClick={() => props.onAddRecording(props.recordingId)}
      tone="accent"
      variant={props.variant}
    >
      {translate('videoEditor.sidebar.addToTimeline')}
    </LibraryItemActionButton>
  );
}

export function EmptyLibrarySection({ message }: { message: string }) {
  return <EmptyState>{message}</EmptyState>;
}
