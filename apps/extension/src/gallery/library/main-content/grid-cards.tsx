import { GRID_GAP, GRID_ROW_HEIGHT_BY_MODE } from '../constants';
import { isGalleryMediaItem, isGallerySelectableItem, type GalleryItem } from '../items';
import {
  formatDate,
  getGalleryItemKindLabel,
  getKindIcon,
  getRecordingGroupRoleLabel,
  MediaThumb,
} from '../ui';
import { GalleryGridDetails, GalleryListDetails } from './grid-card-details';
import type { GalleryMainContentProps } from './types';
import { translate } from '../../../platform/i18n';
import { Image as ImageIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { formatBytes, formatCompactBytes } from '../../../platform/i18n/format-bytes';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const GALLERY_LIST_LAYOUT_STYLE = {
  gridTemplateColumns: '32px 32px 48px minmax(240px, 2.2fr) minmax(100px, 1fr) 132px 88px',
} satisfies CSSProperties;

const GALLERY_LIST_ROW_CLASS_NAME = [
  'grid min-w-[860px] items-center gap-3 px-3 py-2.5',
  'border-b border-[var(--sniptale-color-border-soft)] last:border-b-0',
  'hover:bg-[var(--sniptale-color-surface-hover)]',
].join(' ');

type GalleryPreviewOpenHandler = (
  item: GalleryItem,
  options?: { inspectorCollapsed?: boolean }
) => void;

type GalleryGridCardProps = {
  item: GalleryItem;
  onPreviewOpen: GalleryPreviewOpenHandler;
  onToggleSelection: (assetId: string, options?: { shiftKey?: boolean }) => void;
  selected: boolean;
  style?: { left?: string; top?: string; width?: string };
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
          'rounded-[var(--sniptale-radius-lg)] border',
          'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent),',
          'color-mix(in_srgb,var(--sniptale-color-surface-canvas)_84%,transparent))]',
          'shadow-sm',
        ].join(' '),
    selected
      ? viewMode === 'list'
        ? 'bg-[var(--sniptale-color-accent-soft)]'
        : 'border-[var(--sniptale-color-border-accent-strong)]'
      : viewMode !== 'list' &&
          'border-[var(--sniptale-color-border-soft)] hover:border-[var(--sniptale-color-border-strong)]'
  );
}

function getGallerySelectionButtonClassName(selected: boolean, alwaysVisible = false) {
  return cx(
    'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border text-xs font-semibold transition',
    selected
      ? [
          'border-[var(--sniptale-color-border-accent-strong)]',
          'bg-[var(--sniptale-color-accent-soft)]',
          'text-[var(--sniptale-color-accent-emphasis)]',
        ].join(' ')
      : [
          'border-[var(--sniptale-color-border-soft)]',
          'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]',
          'text-[var(--sniptale-color-text-primary)]',
          alwaysVisible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        ].join(' ')
  );
}

function GalleryGridCardMedia(
  props: Pick<
    GalleryGridCardProps,
    'item' | 'onPreviewOpen' | 'onToggleSelection' | 'selected' | 'viewMode'
  >
) {
  const isList = props.viewMode === 'list';
  const canSelect = isGallerySelectableItem(props.item);

  return (
    <div
      className={cx(
        'relative overflow-hidden bg-[var(--sniptale-color-surface-canvas)]',
        isList
          ? 'h-12 w-12 shrink-0 rounded-[var(--sniptale-radius-md)] border border-[var(--sniptale-color-border-soft)]'
          : 'aspect-[16/10]'
      )}
      role={isList ? 'cell' : undefined}
    >
      <button
        type="button"
        onClick={() => props.onPreviewOpen(props.item)}
        className="absolute inset-0 z-0 cursor-pointer"
        aria-label={props.item.filename}
        title={props.item.filename}
      />
      <MediaThumb item={props.item} />
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
            onToggleSelection={props.onToggleSelection}
            selected={props.selected}
            viewMode={props.viewMode}
          />
          <GalleryListDetails item={props.item} onPreviewOpen={props.onPreviewOpen} />
        </>
      ) : (
        <>
          <GalleryGridCardMedia
            item={props.item}
            onPreviewOpen={props.onPreviewOpen}
            onToggleSelection={props.onToggleSelection}
            selected={props.selected}
            viewMode={props.viewMode}
          />
          <GalleryGridDetails
            compact={props.viewMode === 'compact-grid'}
            item={props.item}
            onPreviewOpen={props.onPreviewOpen}
          />
        </>
      )}
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
  const editorItem = props.items.find(
    (item) => isGalleryMediaItem(item) && Boolean(item.recordingGroupView?.projectId)
  );
  const totalSize = props.items.reduce((total, item) => total + item.size, 0);
  const firstItem = props.items[0];
  const projectName = props.items.find(isGalleryMediaItem)?.recordingGroupView?.projectName;

  if (!firstItem) return null;

  return (
    <article
      style={props.style ? { position: 'absolute', ...props.style } : undefined}
      data-ui="gallery.recording-group.card"
      className={cx(
        'group overflow-hidden rounded-[var(--sniptale-radius-lg)] border shadow-sm transition',
        'border-[var(--sniptale-color-border-accent-soft)]',
        'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--sniptale-color-accent-soft)_34%,transparent),',
        'color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent))]',
        allSelected && 'border-[var(--sniptale-color-border-accent-strong)]'
      )}
    >
      <div
        className="relative grid aspect-[16/10] overflow-hidden bg-[var(--sniptale-color-surface-canvas)]"
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
              <MediaThumb item={item} />
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
      <div className="px-4 py-3.5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-[var(--sniptale-color-text-primary)]">
              {projectName ?? translate('gallery.preview.multiTrackRecording')}
            </div>
            <div className="mt-1 text-xs text-[var(--sniptale-color-text-muted)]">
              {translate('gallery.preview.multiTrackRecording')} ·{' '}
              {translate('gallery.preview.recordingGroup')} {props.items.length}
            </div>
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
        <div
          className="mt-2 flex items-center justify-between gap-2 whitespace-nowrap text-xs
            text-[var(--sniptale-color-text-muted)]"
        >
          <span className="shrink-0">{formatDate(firstItem.createdAt)}</span>
          <span className="shrink-0">
            {totalSize > 0
              ? props.viewMode === 'compact-grid'
                ? formatCompactBytes(totalSize)
                : formatBytes(totalSize)
              : '—'}
          </span>
        </div>
      </div>
    </article>
  );
}

export function GalleryMediaList(
  props: Pick<
    GalleryMainContentProps,
    'filteredItems' | 'onPreviewOpen' | 'onRecordingGroupOpen' | 'onToggleSelection' | 'selectedIds'
  >
) {
  const units = buildGalleryListUnits(props.filteredItems);

  return (
    <div className="min-w-[860px]" role="table">
      <div
        data-ui="gallery.list.header"
        style={GALLERY_LIST_LAYOUT_STYLE}
        className={cx(
          'sticky top-0 z-10 grid items-center gap-3',
          'border-b border-[var(--sniptale-color-border-strong)]',
          'bg-[var(--sniptale-color-surface-panel)] px-3 pb-2 pt-1',
          'text-[11px] font-semibold uppercase tracking-wide',
          'text-[var(--sniptale-color-text-muted)]'
        )}
        role="row"
      >
        <span className="min-w-0" role="columnheader">
          <span className="sr-only">{translate('gallery.app.listColumnSelection')}</span>
        </span>
        <span className="min-w-0 truncate text-center" role="columnheader">
          {translate('gallery.app.listColumnType')}
        </span>
        <span className="flex min-w-0 items-center justify-center" role="columnheader">
          <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">{translate('gallery.app.listColumnPreview')}</span>
        </span>
        <span className="min-w-0 truncate" role="columnheader">
          {translate('gallery.app.listColumnName')}
        </span>
        <span className="min-w-0 truncate" role="columnheader">
          {translate('gallery.app.listColumnTags')}
        </span>
        <span className="min-w-0 truncate" role="columnheader">
          {translate('gallery.app.listColumnCreated')}
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
              onToggleSelection={props.onToggleSelection}
              selected={props.selectedIds.has(unit.item.id)}
              viewMode="list"
            />
          );
        }
        const editorItem = unit.items.find(
          (item) => isGalleryMediaItem(item) && Boolean(item.recordingGroupView?.projectId)
        );
        const projectName = unit.items.find(isGalleryMediaItem)?.recordingGroupView?.projectName;

        return (
          <div
            key={unit.groupId}
            className="my-2 overflow-hidden rounded-[8px] border
              border-[var(--sniptale-color-border-accent-soft)]
              bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_28%,transparent)]"
            role="rowgroup"
          >
            <div
              style={GALLERY_LIST_LAYOUT_STYLE}
              className={cx('grid min-w-[860px] items-center gap-3 px-3 py-2')}
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
                {props.onRecordingGroupOpen && editorItem ? (
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
                onToggleSelection={props.onToggleSelection}
                selected={props.selectedIds.has(item.id)}
                viewMode="list"
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function resolveGalleryGridCanvasLayout(args: {
  gridMetrics: GalleryMainContentProps['gridMetrics'];
  gridWidth: number;
  viewMode: GalleryMainContentProps['viewMode'];
}) {
  const rowHeight =
    GRID_ROW_HEIGHT_BY_MODE[args.viewMode === 'large-grid' ? 'large-grid' : 'compact-grid'];
  const cardWidth = Math.max(
    0,
    (args.gridWidth - GRID_GAP * Math.max(0, args.gridMetrics.columnCount - 1)) /
      args.gridMetrics.columnCount
  );

  return { cardWidth, rowHeight };
}

function resolveGalleryGridCardStyle(args: {
  absoluteIndex: number;
  cardWidth: number;
  columnCount: number;
  rowHeight: number;
}) {
  const row = Math.floor(args.absoluteIndex / args.columnCount);
  const column = args.absoluteIndex % args.columnCount;

  return {
    top: `${row * args.rowHeight}px`,
    left: `${column * (args.cardWidth + GRID_GAP)}px`,
    width: `${args.cardWidth}px`,
  };
}

export function GalleryGridCanvas(
  props: Pick<
    GalleryMainContentProps,
    | 'filteredItems'
    | 'gridMetrics'
    | 'gridWidth'
    | 'onPreviewOpen'
    | 'onRecordingGroupOpen'
    | 'onToggleSelection'
    | 'selectedIds'
    | 'viewMode'
    | 'visibleItems'
  >
) {
  const { gridMetrics, gridWidth, onPreviewOpen, onToggleSelection, selectedIds, viewMode } = props;
  const { cardWidth, rowHeight } = resolveGalleryGridCanvasLayout({
    gridMetrics,
    gridWidth,
    viewMode,
  });

  return (
    <div
      style={{
        height: `${Math.max(gridMetrics.totalRows * rowHeight, rowHeight)}px`,
        position: 'relative',
      }}
    >
      {props.visibleItems.map((item, index) => {
        const absoluteIndex = gridMetrics.startRow * gridMetrics.columnCount + index;
        const groupItems = getRecordingGroupItems(props.filteredItems, item);
        const style = resolveGalleryGridCardStyle({
          absoluteIndex,
          cardWidth,
          columnCount: gridMetrics.columnCount,
          rowHeight,
        });

        if (groupItems.length > 0) {
          return (
            <GalleryRecordingGroupGridCard
              key={`recording-group:${isGalleryMediaItem(item) ? item.recordingGroupView?.groupId : item.id}`}
              items={groupItems}
              onPreviewOpen={onPreviewOpen}
              {...(props.onRecordingGroupOpen
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
            onToggleSelection={onToggleSelection}
            selected={selectedIds.has(item.id)}
            style={style}
            viewMode={viewMode}
          />
        );
      })}
    </div>
  );
}
