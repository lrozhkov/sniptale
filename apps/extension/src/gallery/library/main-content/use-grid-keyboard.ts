import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import { hasGalleryKeyboardLayer } from '../keyboard/context';
import type { GalleryMainContentProps } from './types';
import {
  buildGalleryKeyboardUnits,
  getGalleryNavigationIndex,
  getGalleryUnitRangeEndpoints,
} from './keyboard-navigation';
import { useGalleryGridFocus } from './use-grid-focus';

type KeyboardProps = Pick<
  GalleryMainContentProps,
  | 'filteredItems'
  | 'visibleItems'
  | 'viewMode'
  | 'gridMetrics'
  | 'gridViewportRef'
  | 'keyboardEnabled'
  | 'previewOpen'
  | 'navigationContext'
  | 'selectedIds'
  | 'onToggleSelection'
  | 'onSelectRange'
  | 'onPreviewOpen'
>;

function setsEqual(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

/** Ranges describe a gesture; the existing selection owner computes and publishes its result. */
export function useGalleryGridKeyboard(props: KeyboardProps) {
  const units = useMemo(
    () => buildGalleryKeyboardUnits(props.filteredItems, props.viewMode),
    [props.filteredItems, props.viewMode]
  );
  const orderedIds = useMemo(() => units.flatMap((unit) => unit.selectableIds), [units]);
  const focus = useGalleryGridFocus({
    units,
    gridRef: props.gridViewportRef,
    metrics: props.gridMetrics,
    viewMode: props.viewMode,
    visibleItems: props.visibleItems,
    enabled: props.keyboardEnabled,
    previewOpen: props.previewOpen,
    context: props.navigationContext,
  });
  const range = useRef<{
    anchorId: string;
    base: ReadonlySet<string>;
    applied: ReadonlySet<string>;
  } | null>(null);
  const orderKey = useMemo(() => orderedIds.join('\0'), [orderedIds]);
  const rangeContext = props.navigationContext + '\0' + orderKey;
  useEffect(() => {
    range.current = null;
  }, [rangeContext, props.keyboardEnabled]);
  useEffect(() => {
    if (range.current && !setsEqual(range.current.applied, props.selectedIds)) range.current = null;
  }, [props.selectedIds]);
  useEffect(() => {
    const reset = () => {
      range.current = null;
    };
    const release = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Shift') reset();
    };
    document.addEventListener('pointerdown', reset, true);
    window.addEventListener('keyup', release);
    return () => {
      document.removeEventListener('pointerdown', reset, true);
      window.removeEventListener('keyup', release);
    };
  }, []);

  const navigate = (event: KeyboardEvent<HTMLDivElement>, index: number) => {
    const current = units[index]!;
    const arrow = event.key.startsWith('Arrow');
    if (!arrow && event.key !== 'Home' && event.key !== 'End') return false;
    if (event.shiftKey && !arrow) return true;
    event.preventDefault();
    event.stopPropagation();
    const nextIndex = getGalleryNavigationIndex(
      event.key,
      index,
      units.length,
      props.viewMode === 'list' ? 1 : props.gridMetrics.columnCount
    );
    const next = units[nextIndex];
    if (!next) return true;
    if (event.shiftKey) {
      const session = range.current ?? {
        anchorId: current.id,
        base: new Set(props.selectedIds),
        applied: props.selectedIds,
      };
      range.current = session;
      const anchor = units.findIndex((unit) => unit.id === session.anchorId);
      const endpoints = getGalleryUnitRangeEndpoints(units, anchor, nextIndex);
      if (endpoints)
        session.applied = props.onSelectRange({
          ...endpoints,
          orderedIds,
          baseSelectedIds: session.base,
        });
    } else range.current = null;
    focus.focusUnit(next.id);
    return true;
  };
  const activate = (event: KeyboardEvent<HTMLDivElement>, current: (typeof units)[number]) => {
    if ((event.code === 'Space' || event.key === ' ' || event.key === 'Enter') && !event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      range.current = null;
      if (event.repeat) return;
      if (event.key === 'Enter') props.onPreviewOpen(current.item);
      else {
        const allSelected = current.selectableIds.every((id) => props.selectedIds.has(id));
        current.selectableIds.forEach((id) => {
          if (allSelected || !props.selectedIds.has(id)) props.onToggleSelection(id);
        });
      }
    } else if (event.key !== 'Shift') range.current = null;
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.key === 'Escape') {
      range.current = null;
      return;
    }
    if (
      !props.keyboardEnabled ||
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      hasGalleryKeyboardLayer()
    )
      return;
    const target = event.target;
    const material =
      target instanceof HTMLElement
        ? target.closest<HTMLElement>('[data-gallery-keyboard-id]')
        : null;
    if (target !== material && target !== props.gridViewportRef.current) {
      range.current = null;
      return;
    }
    const index = units.findIndex(
      (unit) => unit.id === (material?.dataset['galleryKeyboardId'] ?? focus.active.current.id)
    );
    const current = units[index];
    if (!current) return;
    if (!navigate(event, index)) activate(event, current);
  };

  return {
    navigation: { activeId: focus.activeId },
    onKeyDown,
    onPointerToggle: (id: string, options?: Parameters<KeyboardProps['onToggleSelection']>[1]) => {
      range.current = null;
      props.onToggleSelection(id, { ...options, orderedIds });
    },
  };
}
