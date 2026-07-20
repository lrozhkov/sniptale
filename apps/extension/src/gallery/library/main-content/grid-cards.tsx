import { GRID_GAP, GRID_ROW_HEIGHT_BY_MODE } from '../constants';
import { isGallerySelectableItem, type GalleryItem } from '../items';
import { getKindIcon, MediaThumb } from '../ui';
import { GalleryGridDetails, GalleryListDetails } from './grid-card-details';
import type { GalleryMainContentProps } from './types';

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

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

function getGalleryGridCardClassName(
  selected: boolean,
  viewMode: GalleryMainContentProps['viewMode']
) {
  return cx(
    'group overflow-hidden rounded-[16px] border',
    'bg-[linear-gradient(180deg,color-mix(in_srgb,var(--sniptale-color-surface-panel)_96%,transparent),',
    'color-mix(in_srgb,var(--sniptale-color-surface-canvas)_84%,transparent))]',
    'shadow-sm transition',
    selected
      ? 'border-[var(--sniptale-color-border-accent-strong)]'
      : 'border-[var(--sniptale-color-border-soft)] hover:border-[var(--sniptale-color-border-strong)]',
    viewMode === 'list' && 'px-4 py-3'
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
          ? 'h-12 w-12 shrink-0 rounded-[12px] border border-[var(--sniptale-color-border-soft)]'
          : 'aspect-[16/10]'
      )}
    >
      <button
        type="button"
        onClick={() => props.onPreviewOpen(props.item, { inspectorCollapsed: true })}
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
      <GalleryGridCardKindBadge isList={isList} kind={props.item.kind} />
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

function GalleryGridCardKindBadge(props: { isList: boolean; kind: GalleryItem['kind'] }) {
  const Icon = getKindIcon(props.kind);

  return (
    <div
      className={cx(
        'absolute z-10 inline-flex items-center justify-center rounded-full border',
        'border-[var(--sniptale-color-border-soft)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_90%,transparent)]',
        'text-[var(--sniptale-color-text-secondary)]',
        props.isList ? 'right-2 top-2 h-6 w-6' : 'right-3 top-3 h-8 w-8'
      )}
    >
      <Icon className={props.isList ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </div>
  );
}

function GalleryGridCard(props: GalleryGridCardProps) {
  const isList = props.viewMode === 'list';

  return (
    <article
      style={props.style ? { position: 'absolute', ...props.style } : undefined}
      className={getGalleryGridCardClassName(props.selected, props.viewMode)}
    >
      {isList ? (
        <div className="flex items-center gap-3">
          {isGallerySelectableItem(props.item) ? (
            <button
              type="button"
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
          <GalleryGridCardMedia
            item={props.item}
            onPreviewOpen={props.onPreviewOpen}
            onToggleSelection={props.onToggleSelection}
            selected={props.selected}
            viewMode={props.viewMode}
          />
          <GalleryListDetails item={props.item} onPreviewOpen={props.onPreviewOpen} />
        </div>
      ) : (
        <>
          <GalleryGridCardMedia
            item={props.item}
            onPreviewOpen={props.onPreviewOpen}
            onToggleSelection={props.onToggleSelection}
            selected={props.selected}
            viewMode={props.viewMode}
          />
          <GalleryGridDetails item={props.item} onPreviewOpen={props.onPreviewOpen} />
        </>
      )}
    </article>
  );
}

export function GalleryMediaList(
  props: Pick<
    GalleryMainContentProps,
    'filteredItems' | 'onPreviewOpen' | 'onToggleSelection' | 'selectedIds'
  >
) {
  return (
    <div className="grid gap-2">
      {props.filteredItems.map((item) => (
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
    | 'gridMetrics'
    | 'gridWidth'
    | 'onPreviewOpen'
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

        return (
          <GalleryGridCard
            key={item.id}
            item={item}
            onPreviewOpen={onPreviewOpen}
            onToggleSelection={onToggleSelection}
            selected={selectedIds.has(item.id)}
            style={resolveGalleryGridCardStyle({
              absoluteIndex,
              cardWidth,
              columnCount: gridMetrics.columnCount,
              rowHeight,
            })}
            viewMode={viewMode}
          />
        );
      })}
    </div>
  );
}
