import { GalleryProjectDetails } from '../ui/project-presentation';
import { GRID_GAP } from '../constants';
import { getGalleryGridCardHeight, getGalleryGridCardWidth } from '../grid-layout';
import { isGalleryMediaItem, isGallerySelectableItem, type GalleryItem } from '../items';
import {
  getGalleryItemKindLabel,
  getKindIcon,
  getRecordingGroupRoleLabel,
  MediaThumb,
} from '../ui';
import {
  GalleryGridDetails,
  GalleryListDetails,
  GalleryPreviewRecovery,
  isGalleryPreviewUnavailable,
} from './grid-card-details';
import type { GalleryMainContentProps } from './types';
import { translate } from '../../../platform/i18n';
import { Image as ImageIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatBytes, formatCompactBytes } from '../../../platform/i18n/format-bytes';
import { getGallerySelectionButtonClassName } from './selection-button-style';
import { GalleryGridCardDate } from './grid-card-date';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const GALLERY_LIST_LAYOUT_STYLE = {
  gridTemplateColumns:
    '32px 32px 128px minmax(160px, 1.35fr) 132px minmax(220px, 2fr) minmax(100px, 1fr) 88px',
} satisfies CSSProperties;

const GALLERY_LIST_ROW_CLASS_NAME = [
  'grid min-w-[1120px] items-center gap-3 px-3 py-2.5',
  'border border-[var(--sniptale-color-border-soft)]',
  'data-[selected=true]:border-[var(--sniptale-color-border-accent-strong)]',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

type GalleryPreviewOpenHandler = (
  item: GalleryItem,
  options?: { inspectorCollapsed?: boolean }
) => void;

type GalleryGridCardProps = {
  item: GalleryItem;
  onPreviewOpen: GalleryPreviewOpenHandler;
  onProjectOpen?: (item: GalleryItem) => void;
  previewRecoveryAllowed: boolean;
  onToggleSelection: (assetId: string, options?: { shiftKey?: boolean }) => void;
  selected: boolean;
  style?: { height?: string; left?: string; top?: string; width?: string };
  viewMode: GalleryMainContentProps['viewMode'];
};

type GalleryListUnit =
  | { kind: 'item'; item: GalleryItem }
  | { groupId: string; items: GalleryItem[]; kind: 'recording-group'; memberCount: number };

function buildGalleryListUnits(items: GalleryItem[]): GalleryListUnit[] {
  const groupedItems = new Map<string, GalleryItem[]>();
  items.forEach((item) => {
    if (!isGalleryMediaItem(item) || !item.recordingGroupView) return;
    const members = groupedItems.get(item.recordingGroupView.groupId) ?? [];
    members.push(item);
    groupedItems.set(item.recordingGroupView.groupId, members);
  });
  groupedItems.forEach((members) => {
    members.sort((left, right) => {
      if (!isGalleryMediaItem(left) || !isGalleryMediaItem(right)) return 0;
      return (left.recordingGroupView?.order ?? 0) - (right.recordingGroupView?.order ?? 0);
    });
  });

  const emittedGroups = new Set<string>();
  return items.flatMap((item): GalleryListUnit[] => {
    if (!isGalleryMediaItem(item) || !item.recordingGroupView) {
      return [{ item, kind: 'item' }];
    }
    const { groupId, memberCount } = item.recordingGroupView;
    if (emittedGroups.has(groupId)) return [];
    emittedGroups.add(groupId);
    return [
      {
        groupId,
        items: groupedItems.get(groupId) ?? [item],
        kind: 'recording-group',
        memberCount,
      },
    ];
  });
}

function getGalleryGridCardClassName(
  selected: boolean,
  viewMode: GalleryMainContentProps['viewMode']
) {
  return cx(
    'group overflow-hidden transition',
    viewMode === 'list'
      ? GALLERY_LIST_ROW_CLASS_NAME
      : [
          'flex flex-col',
          'rounded-[var(--sniptale-radius-lg)] border',
          'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent),',
          'color-mix(in_srgb,var(--sniptale-color-surface-canvas)_84%,transparent))]',
          'shadow-sm',
        ].join(' '),
    selected
      ? viewMode === 'list'
        ? 'border-[var(--sniptale-color-border-accent-strong)] bg-[var(--sniptale-color-accent-soft)]'
        : 'border-[var(--sniptale-color-border-accent-strong)]'
      : 'border-[var(--sniptale-color-border-soft)] hover:border-[var(--sniptale-color-border-strong)]'
  );
}

function GalleryGridCardMedia(props: GalleryGridCardProps) {
  const isList = props.viewMode === 'list';
  const canSelect = isGallerySelectableItem(props.item);

  return (
    <div
      className={cx(
        'relative overflow-hidden bg-[var(--sniptale-color-surface-canvas)]',
        isList
          ? [
              'h-[72px] w-32 shrink-0 rounded-[var(--sniptale-radius-md)]',
              'border border-[var(--sniptale-color-border-soft)]',
            ].join(' ')
          : 'min-h-0 w-full flex-1'
      )}
      data-ui={isList ? undefined : 'gallery.grid.thumbnail-viewport'}
      role={isList ? 'cell' : undefined}
    >
      <button
        type="button"
        onClick={() => props.onPreviewOpen(props.item)}
        className="absolute inset-0 z-0 cursor-pointer"
        aria-label={props.item.filename}
        title={props.item.filename}
      />
      <MediaThumb
        showProjectHint={!isList}
        item={props.item}
        fit="contain"
        deferUntilVisible={
          isList && (props.item.type === 'scenario' || props.item.type === 'video-project')
        }
      />
      {!isList && isGalleryPreviewUnavailable(props.item) ? (
        <GalleryPreviewRecovery
          {...(props.previewRecoveryAllowed && props.onProjectOpen
            ? { onOpen: () => props.onProjectOpen?.(props.item) }
            : {})}
        />
      ) : null}
      {!isList && props.item.tags.length > 0 ? (
        <div
          className="pointer-events-none absolute inset-x-2 bottom-2 z-10 truncate rounded-[6px]
            bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_82%,transparent)]
            px-2 py-1 text-[10px] font-medium text-[var(--sniptale-color-text-primary)]"
          title={props.item.tags.join(', ')}
        >
          {props.item.tags.join(', ')}
        </div>
      ) : null}
      <GalleryGridCardSelectionControl
        canSelect={canSelect}
        isList={isList}
        itemId={props.item.id}
        onToggleSelection={props.onToggleSelection}
        selected={props.selected}
      />
      {!isList ? <GalleryGridCardKindBadge kind={props.item.kind} /> : null}
    </div>
  );
}

function GalleryGridCardSelectionControl(props: {
  canSelect: boolean;
  isList: boolean;
  itemId: string;
  onToggleSelection: (assetId: string, options?: { shiftKey?: boolean }) => void;
  selected: boolean;
}) {
  if (!props.canSelect || props.isList) {
    return null;
  }

  return (
    <div className="absolute left-3 top-3 z-10">
      <button
        type="button"
        aria-label={translate('gallery.app.selectItem')}
        aria-pressed={props.selected}
        onClick={(event) =>
          props.onToggleSelection(props.itemId, {
            shiftKey: event.shiftKey,
          })
        }
        className={getGallerySelectionButtonClassName(props.selected)}
      >
        {props.selected ? '✓' : ''}
      </button>
    </div>
  );
}

function GalleryGridCardKindBadge(props: { kind: GalleryItem['kind'] }) {
  const Icon = getKindIcon(props.kind);

  return (
    <div
      className={cx(
        'absolute z-10 inline-flex items-center justify-center rounded-full border',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]',
        'text-[var(--sniptale-color-text-secondary)]',
        'right-3 top-3 h-8 w-8'
      )}
    >
      <Icon className="h-4 w-4" />
    </div>
  );
}

function GalleryListKindCell({ item }: { item: GalleryItem }) {
  const Icon = getKindIcon(item.kind);
  const label = getGalleryItemKindLabel(item.kind);

  return (
    <div
      className="flex h-8 w-8 items-center justify-center text-[var(--sniptale-color-text-secondary)]"
      title={label}
      aria-label={label}
      role="cell"
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </div>
  );
}

function GalleryGridCard(props: GalleryGridCardProps) {
  const isList = props.viewMode === 'list';

  return (
    <article
      style={
        isList
          ? { ...GALLERY_LIST_LAYOUT_STYLE, ...props.style }
          : props.style
            ? { position: 'absolute', ...props.style }
            : undefined
      }
      className={getGalleryGridCardClassName(props.selected, props.viewMode)}
      role={isList ? 'row' : undefined}
      data-ui={isList ? 'gallery.list.row' : undefined}
      data-selected={isList ? props.selected : undefined}
    >
      {isList ? (
        <>
          <div className="flex items-center justify-center" role="cell">
            {isGallerySelectableItem(props.item) ? (
              <button
                type="button"
                aria-label={translate('gallery.app.selectItem')}
                aria-pressed={props.selected}
                onClick={(event) =>
                  props.onToggleSelection(props.item.id, {
                    shiftKey: event.shiftKey,
                  })
                }
                className={getGallerySelectionButtonClassName(props.selected, true)}
              >
                {props.selected ? '✓' : ''}
              </button>
            ) : (
              <div className="h-8 w-8 shrink-0" />
            )}
          </div>
          <GalleryListKindCell item={props.item} />
          <GalleryGridCardMedia
            item={props.item}
            onPreviewOpen={props.onPreviewOpen}
            {...(props.onProjectOpen ? { onProjectOpen: props.onProjectOpen } : {})}
            previewRecoveryAllowed={props.previewRecoveryAllowed}
            onToggleSelection={props.onToggleSelection}
            selected={props.selected}
            viewMode={props.viewMode}
          />
          <GalleryListDetails
            item={props.item}
            onPreviewOpen={props.onPreviewOpen}
            {...(props.onProjectOpen ? { onProjectOpen: props.onProjectOpen } : {})}
            previewUnavailable={isGalleryPreviewUnavailable(props.item)}
            {...(isGalleryPreviewUnavailable(props.item) &&
            props.previewRecoveryAllowed &&
            props.onProjectOpen
              ? { onRetryPreview: () => props.onProjectOpen?.(props.item) }
              : {})}
          />
        </>
      ) : (
        <>
          <GalleryGridCardMedia
            item={props.item}
            onPreviewOpen={props.onPreviewOpen}
            {...(props.onProjectOpen ? { onProjectOpen: props.onProjectOpen } : {})}
            previewRecoveryAllowed={props.previewRecoveryAllowed}
            onToggleSelection={props.onToggleSelection}
            selected={props.selected}
            viewMode={props.viewMode}
          />
          {props.item.type !== 'scenario' && props.item.type !== 'video-project' ? (
            <GalleryGridDetails
              compact={props.viewMode === 'compact-grid'}
              item={props.item}
              onPreviewOpen={props.onPreviewOpen}
            />
          ) : null}
        </>
      )}
      {!isList ? (
        <GalleryProjectDetails
          item={props.item}
          viewMode={props.viewMode}
          onPreviewOpen={props.onPreviewOpen}
          {...(props.onProjectOpen ? { onOpen: props.onProjectOpen } : {})}
        />
      ) : null}
    </article>
  );
}

function getRecordingGroupItems(items: GalleryItem[], representative: GalleryItem) {
  if (!isGalleryMediaItem(representative) || !representative.recordingGroupView) {
    return [];
  }
  const groupId = representative.recordingGroupView.groupId;

  return items
    .filter(isGalleryMediaItem)
    .filter((item) => item.recordingGroupView?.groupId === groupId)
    .sort(
      (left, right) =>
        (left.recordingGroupView?.order ?? 0) - (right.recordingGroupView?.order ?? 0)
    );
}

function GalleryRecordingGroupDetails(props: {
  items: GalleryItem[];
  onRecordingGroupOpen?: (item: GalleryItem) => void;
  viewMode: GalleryGridCardProps['viewMode'];
}) {
  const firstItem = props.items[0];
  if (!firstItem) return null;

  const isCompact = props.viewMode === 'compact-grid';
  const editorItem = props.items.find(
    (item) => isGalleryMediaItem(item) && Boolean(item.recordingGroupView?.projectId)
  );
  const projectName = props.items.find(isGalleryMediaItem)?.recordingGroupView?.projectName;
  const totalSize = props.items.reduce((total, item) => total + item.size, 0);

  return (
    <div
      className={
        isCompact
          ? `h-10 shrink-0 border-t border-[var(--sniptale-color-border-soft)]
            px-3 py-3`
          : `grid h-[94px] shrink-0 grid-rows-[32px_minmax(0,1fr)_16px]
            border-t border-[var(--sniptale-color-border-soft)] px-4 py-3.5`
      }
      data-ui={isCompact ? 'gallery.compact.group-details' : 'gallery.large.group-details'}
    >
      {!isCompact ? (
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div
            className="truncate text-sm font-semibold
              text-[var(--sniptale-color-text-primary)]"
          >
            {projectName ?? translate('gallery.preview.multiTrackRecording')}
          </div>
          {props.onRecordingGroupOpen && editorItem ? (
            <button
              type="button"
              onClick={() => props.onRecordingGroupOpen?.(editorItem)}
              className="shrink-0 rounded-[8px] border border-[var(--sniptale-color-border-soft)]
                px-2.5 py-1.5 text-xs font-semibold text-[var(--sniptale-color-accent-emphasis)]
                hover:border-[var(--sniptale-color-border-strong)]"
            >
              {translate('gallery.preview.openRecordingGroupShort')}
            </button>
          ) : null}
        </div>
      ) : null}
      {!isCompact ? <div aria-hidden="true" /> : null}
      <div
        data-ui={isCompact ? 'gallery.compact.group-metadata' : 'gallery.large.group-metadata'}
        className="flex items-center justify-between gap-2 whitespace-nowrap text-xs
          text-[var(--sniptale-color-text-muted)]"
      >
        <GalleryGridCardDate items={props.items} compact={isCompact} />
        <span className="shrink-0">
          {totalSize > 0
            ? isCompact
              ? formatCompactBytes(totalSize)
              : formatBytes(totalSize)
            : '—'}
        </span>
      </div>
    </div>
  );
}

function GalleryRecordingGroupGridCard(props: {
  items: GalleryItem[];
  onPreviewOpen: GalleryPreviewOpenHandler;
  onRecordingGroupOpen?: (item: GalleryItem) => void;
  onToggleSelection: GalleryGridCardProps['onToggleSelection'];
  selectedIds: Set<string>;
  style: GalleryGridCardProps['style'];
  viewMode: GalleryGridCardProps['viewMode'];
}) {
  const selectableItems = props.items.filter(isGallerySelectableItem);
  const allSelected =
    selectableItems.length > 0 && selectableItems.every((item) => props.selectedIds.has(item.id));
  const firstItem = props.items[0];
  if (!firstItem) return null;

  return (
    <article
      style={props.style ? { position: 'absolute', ...props.style } : undefined}
      data-ui="gallery.recording-group.card"
      className={cx(
        'group flex flex-col overflow-hidden rounded-[var(--sniptale-radius-lg)]',
        'border shadow-sm transition',
        'border-[var(--sniptale-color-border-accent-soft)]',
        'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--sniptale-color-accent-soft)_34%,transparent),',
        'color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent))]',
        allSelected && 'border-[var(--sniptale-color-border-accent-strong)]'
      )}
    >
      <div
        className="relative grid min-h-0 w-full flex-1 overflow-hidden
          bg-[var(--sniptale-color-surface-canvas)]"
        data-ui="gallery.grid.thumbnail-viewport"
        style={{
          gridTemplateColumns: `repeat(${Math.min(3, Math.max(1, props.items.length))}, minmax(0, 1fr))`,
        }}
      >
        {props.items.map((item) => {
          const role = isGalleryMediaItem(item)
            ? getRecordingGroupRoleLabel(item.recordingGroupView?.role ?? 'display')
            : getGalleryItemKindLabel(item.kind);
          const sourceLabel = isGalleryMediaItem(item)
            ? item.recordingGroupView?.sourceLabel
            : null;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => props.onPreviewOpen(item)}
              aria-label={`${role}: ${sourceLabel ?? item.filename}`}
              className="relative min-h-0 min-w-0 cursor-pointer overflow-hidden border-r
                border-[var(--sniptale-color-border-soft)] last:border-r-0"
            >
              <MediaThumb item={item} fit="contain" />
              <span
                className="absolute inset-x-1.5 bottom-1.5 rounded-[6px]
                  bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-overlay)_82%,transparent)]
                  px-2 py-1 text-left text-[10px] leading-tight text-[var(--sniptale-color-text-primary)]"
              >
                <span className="block truncate font-semibold">{role}</span>
                {sourceLabel ? (
                  <span className="mt-0.5 block truncate text-[var(--sniptale-color-text-muted)]">
                    {sourceLabel}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
        <div className="absolute left-3 top-3 z-10">
          <button
            type="button"
            aria-label={translate('gallery.app.selectRecordingGroup')}
            aria-pressed={allSelected}
            onClick={() => {
              selectableItems.forEach((item) => {
                if (allSelected || !props.selectedIds.has(item.id)) {
                  props.onToggleSelection(item.id);
                }
              });
            }}
            className={getGallerySelectionButtonClassName(allSelected)}
          >
            {allSelected ? '✓' : ''}
          </button>
        </div>
      </div>
      <GalleryRecordingGroupDetails
        items={props.items}
        {...(props.onRecordingGroupOpen
          ? { onRecordingGroupOpen: props.onRecordingGroupOpen }
          : {})}
        viewMode={props.viewMode}
      />
    </article>
  );
}

export function GalleryMediaList(
  props: Pick<
    GalleryMainContentProps,
    | 'trashMode'
    | 'filteredItems'
    | 'onPreviewOpen'
    | 'onRecordingGroupOpen'
    | 'onProjectOpen'
    | 'onToggleSelection'
    | 'selectedIds'
  >
) {
  const units = buildGalleryListUnits(props.filteredItems);

  return (
    <div className="min-w-[1120px]" role="table">
      <div
        data-ui="gallery.list.header"
        style={GALLERY_LIST_LAYOUT_STYLE}
        className={cx(
          'sticky top-0 z-10 grid h-12 items-center gap-3 px-3',
          'border-b border-[var(--sniptale-color-border-strong)]',
          'bg-[var(--sniptale-color-surface-muted)]',
          'text-[11px] font-semibold uppercase tracking-[0.06em]',
          'text-[var(--sniptale-color-text-secondary)]'
        )}
        role="row"
      >
        <span className="min-w-0" role="columnheader">
          <span className="sr-only">{translate('gallery.app.listColumnSelection')}</span>
        </span>
        <span className="min-w-0 truncate text-center leading-tight" role="columnheader">
          {translate('gallery.app.listColumnType')}
        </span>
        <span className="flex min-w-0 items-center justify-center" role="columnheader">
          <ImageIcon className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">{translate('gallery.app.listColumnPreview')}</span>
        </span>
        <span className="min-w-0 truncate" role="columnheader">
          {translate('gallery.app.listColumnSource')}
        </span>
        <span className="min-w-0 truncate" role="columnheader">
          {translate('gallery.app.listColumnCreated')}
        </span>
        <span className="min-w-0 truncate" role="columnheader">
          {translate('gallery.app.listColumnName')}
        </span>
        <span className="min-w-0 truncate" role="columnheader">
          {translate('gallery.app.listColumnTags')}
        </span>
        <span className="min-w-0 truncate text-right" role="columnheader">
          {translate('gallery.app.listColumnSize')}
        </span>
      </div>
      {units.map((unit) => {
        if (unit.kind === 'item') {
          return (
            <GalleryGridCard
              key={unit.item.id}
              item={unit.item}
              onPreviewOpen={props.onPreviewOpen}
              {...(props.onProjectOpen ? { onProjectOpen: props.onProjectOpen } : {})}
              onToggleSelection={props.onToggleSelection}
              selected={props.selectedIds.has(unit.item.id)}
              previewRecoveryAllowed={!props.trashMode}
              viewMode="list"
            />
          );
        }
        const editorItem = unit.items.find(
          (item) => isGalleryMediaItem(item) && Boolean(item.recordingGroupView?.projectId)
        );
        const projectName = unit.items.find(isGalleryMediaItem)?.recordingGroupView?.projectName;
        const selectableItems = unit.items.filter(isGallerySelectableItem);
        const allSelected =
          selectableItems.length > 0 &&
          selectableItems.every((item) => props.selectedIds.has(item.id));

        return (
          <div
            key={unit.groupId}
            className={cx(
              'my-2 overflow-hidden rounded-[8px] border',
              'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_28%,transparent)]',
              allSelected
                ? 'border-[var(--sniptale-color-border-accent-strong)]'
                : 'border-[var(--sniptale-color-border-accent-soft)]'
            )}
            role="rowgroup"
          >
            <div
              style={GALLERY_LIST_LAYOUT_STYLE}
              className={cx('grid min-w-[1120px] items-center gap-3 px-3 py-2')}
              role="row"
            >
              <div
                className="col-span-full flex items-center justify-between gap-3 text-xs"
                role="cell"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-semibold text-[var(--sniptale-color-text-primary)]">
                    {projectName ?? translate('gallery.preview.multiTrackRecording')}
                  </span>
                  <span className="shrink-0 text-[var(--sniptale-color-text-muted)]">
                    {translate('gallery.preview.multiTrackRecording')} ·{' '}
                    {translate('gallery.preview.recordingGroup')} {unit.memberCount}
                  </span>
                </div>
                {!props.trashMode && props.onRecordingGroupOpen && editorItem ? (
                  <button
                    type="button"
                    className="shrink-0 font-semibold text-[var(--sniptale-color-accent-emphasis)]
                      hover:underline focus-visible:outline-none focus-visible:ring-2
                      focus-visible:ring-[var(--sniptale-color-focus-ring)]"
                    onClick={() => props.onRecordingGroupOpen?.(editorItem)}
                  >
                    {translate('gallery.preview.openRecordingGroupShort')}
                  </button>
                ) : null}
              </div>
            </div>
            {unit.items.map((item) => (
              <GalleryGridCard
                key={item.id}
                item={item}
                onPreviewOpen={props.onPreviewOpen}
                {...(props.onProjectOpen ? { onProjectOpen: props.onProjectOpen } : {})}
                onToggleSelection={props.onToggleSelection}
                selected={props.selectedIds.has(item.id)}
                previewRecoveryAllowed={!props.trashMode}
                viewMode="list"
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function resolveGalleryGridCardStyle(args: {
  absoluteIndex: number;
  cardHeight: number;
  cardWidth: number;
  columnCount: number;
  rowTops: number[];
}) {
  const row = Math.floor(args.absoluteIndex / args.columnCount);
  const column = args.absoluteIndex % args.columnCount;

  return {
    height: `${args.cardHeight}px`,
    top: `${args.rowTops[row] ?? 0}px`,
    left: `${column * (args.cardWidth + GRID_GAP)}px`,
    width: `${args.cardWidth}px`,
  };
}

export function GalleryGridCanvas(
  props: Pick<
    GalleryMainContentProps,
    | 'trashMode'
    | 'filteredItems'
    | 'gridMetrics'
    | 'gridWidth'
    | 'onPreviewOpen'
    | 'onRecordingGroupOpen'
    | 'onProjectOpen'
    | 'onToggleSelection'
    | 'selectedIds'
    | 'viewMode'
    | 'visibleItems'
  >
) {
  const { gridMetrics, gridWidth, onPreviewOpen, onToggleSelection, selectedIds, viewMode } = props;
  const cardWidth = getGalleryGridCardWidth(gridWidth, gridMetrics.columnCount);
  const gridMode = viewMode === 'large-grid' ? 'large-grid' : 'compact-grid';

  return (
    <div
      style={{
        height: `${gridMetrics.rowTops[gridMetrics.totalRows] ?? 0}px`,
        position: 'relative',
      }}
    >
      {props.visibleItems.map((item, index) => {
        const absoluteIndex = gridMetrics.startRow * gridMetrics.columnCount + index;
        const groupItems = getRecordingGroupItems(props.filteredItems, item);
        const style = resolveGalleryGridCardStyle({
          absoluteIndex,
          cardHeight: getGalleryGridCardHeight(item, gridMode, cardWidth),
          cardWidth,
          columnCount: gridMetrics.columnCount,
          rowTops: gridMetrics.rowTops,
        });

        if (groupItems.length > 0) {
          return (
            <GalleryRecordingGroupGridCard
              key={`recording-group:${isGalleryMediaItem(item) ? item.recordingGroupView?.groupId : item.id}`}
              items={groupItems}
              onPreviewOpen={onPreviewOpen}
              {...(!props.trashMode && props.onRecordingGroupOpen
                ? { onRecordingGroupOpen: props.onRecordingGroupOpen }
                : {})}
              onToggleSelection={onToggleSelection}
              selectedIds={selectedIds}
              style={style}
              viewMode={viewMode}
            />
          );
        }

        return (
          <GalleryGridCard
            key={item.id}
            item={item}
            onPreviewOpen={onPreviewOpen}
            {...(props.onProjectOpen ? { onProjectOpen: props.onProjectOpen } : {})}
            onToggleSelection={onToggleSelection}
            selected={selectedIds.has(item.id)}
            previewRecoveryAllowed={!props.trashMode}
            style={style}
            viewMode={viewMode}
          />
        );
      })}
    </div>
  );
}
