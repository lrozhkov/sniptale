import type { RefObject } from 'react';
import type { GalleryItem } from '../items';
import { hasGalleryKeyboardLayer } from '../keyboard/context';
import type { GalleryGridMetrics, GalleryViewMode } from '../types';
import {
  getGalleryGridUnitBounds,
  getGalleryVisibleScroll,
  type GalleryKeyboardUnit,
} from './keyboard-navigation';

export interface GalleryGridFocusOptions {
  units: GalleryKeyboardUnit[];
  gridRef: RefObject<HTMLDivElement | null>;
  metrics: GalleryGridMetrics;
  viewMode: GalleryViewMode;
  visibleItems: GalleryItem[];
  enabled: boolean;
  previewOpen: boolean;
  context: string;
}
type Position = { id: string | null; index: number };
const materialSelector = '[data-gallery-keyboard-id]';
const layerSelector = '[role="dialog"], [role="menu"], [role="listbox"]';
function materialId(element: HTMLElement): string | undefined {
  return element.closest<HTMLElement>(materialSelector)?.dataset['galleryKeyboardId'];
}

/** One local focus transaction, including virtualization and preview restoration. */
export class GalleryGridFocusController {
  readonly active: { current: Position };
  private pending: string | null = null;
  private ownsFocus = false;
  private origin: Position | null = null;
  private previous: { order: string; context: string; previewOpen: boolean };
  constructor(
    public options: GalleryGridFocusOptions,
    private publish: (id: string | null) => void
  ) {
    this.active = { current: { id: options.units[0]?.id ?? null, index: 0 } };
    this.previous = {
      order: this.order(),
      context: options.context,
      previewOpen: options.previewOpen,
    };
  }
  private order() {
    return this.options.units.map((unit) => unit.id).join('\0');
  }
  private material(id: string) {
    return Array.from(
      this.options.gridRef.current?.querySelectorAll<HTMLElement>(materialSelector) ?? []
    ).find((element) => element.dataset['galleryKeyboardId'] === id);
  }
  private resolve(position: Position) {
    return (
      this.options.units.find(
        (unit) => unit.id === position.id || unit.selectableIds.includes(position.id ?? '')
      ) ?? this.options.units[Math.min(position.index, Math.max(0, this.options.units.length - 1))]
    );
  }
  private setActive(unit: GalleryKeyboardUnit | undefined) {
    this.active.current = {
      id: unit?.id ?? null,
      index: unit ? this.options.units.indexOf(unit) : 0,
    };
    this.publish(this.active.current.id);
  }
  private ensureVisible(id: string, element?: HTMLElement) {
    const { gridRef, units, metrics, viewMode } = this.options;
    const grid = gridRef.current;
    const index = units.findIndex((unit) => unit.id === id);
    if (!grid || index < 0) return;
    const padding = Number.parseFloat(getComputedStyle(grid).paddingTop) || 0;
    const bounds =
      viewMode === 'list' && element
        ? {
            top:
              element.getBoundingClientRect().top -
              grid.getBoundingClientRect().top +
              grid.scrollTop,
            bottom:
              element.getBoundingClientRect().bottom -
              grid.getBoundingClientRect().top +
              grid.scrollTop,
          }
        : getGalleryGridUnitBounds(index, metrics, padding);
    const stickyHeight =
      viewMode === 'list'
        ? (grid.querySelector('[data-ui="gallery.list.header"]')?.getBoundingClientRect().height ??
          48)
        : 0;
    grid.scrollTop = getGalleryVisibleScroll({
      ...bounds,
      scrollTop: grid.scrollTop,
      height: grid.clientHeight,
      stickyHeight,
    });
  }
  private finishPending() {
    if (!this.pending || !this.options.enabled || hasGalleryKeyboardLayer()) return;
    const element = this.material(this.pending);
    if (!element) return;
    this.ensureVisible(this.pending, element);
    this.pending = null;
    element.focus({ preventScroll: true });
  }
  readonly focusUnit = (id: string) => {
    const unit = this.options.units.find((unit) => unit.id === id);
    if (!unit || !this.options.enabled || hasGalleryKeyboardLayer()) return;
    this.setActive(unit);
    this.pending = id;
    this.ensureVisible(id, this.material(id));
    this.finishPending();
  };
  private returnFromPreview() {
    const opener = this.origin;
    if (!opener || !this.options.enabled) return;
    this.origin = null;
    if (hasGalleryKeyboardLayer()) return;
    const restored = this.resolve(opener);
    if (restored) this.focusUnit(restored.id);
    else this.options.gridRef.current?.focus({ preventScroll: true });
  }
  private repairFocusedMaterial(next: GalleryKeyboardUnit | undefined) {
    if (
      !this.ownsFocus ||
      !this.options.enabled ||
      this.options.previewOpen ||
      hasGalleryKeyboardLayer()
    )
      return;
    const grid = this.options.gridRef.current;
    if (!next) {
      grid?.focus({ preventScroll: true });
      return;
    }
    const focused = document.activeElement;
    if (
      focused instanceof HTMLElement &&
      grid?.contains(focused) &&
      materialId(focused) === next.id
    ) {
      this.ensureVisible(next.id, this.material(next.id));
    } else this.focusUnit(next.id);
  }
  reconcile() {
    const { context, previewOpen, enabled } = this.options;
    const before = this.previous;
    const order = this.order();
    const changed = before.order !== order || before.context !== context;
    this.previous = { order, context, previewOpen };
    if (previewOpen && !before.previewOpen && this.ownsFocus)
      this.origin = { ...this.active.current };
    if (!enabled || changed) this.pending = null;
    const next = this.resolve(this.active.current);
    this.setActive(next);
    if (!previewOpen && this.origin) this.returnFromPreview();
    else if (changed) this.repairFocusedMaterial(next);
    this.finishPending();
  }
  private cancel() {
    this.ownsFocus = false;
    this.pending = null;
    this.origin = null;
  }
  private focusWithin(target: HTMLElement, grid: HTMLElement) {
    this.ownsFocus = true;
    const id = materialId(target);
    if (id) {
      const unit = this.options.units.find((unit) => unit.id === id);
      if (unit) this.setActive(unit);
    } else if (target === grid && this.active.current.id) this.focusUnit(this.active.current.id);
  }
  private readonly onFocus = (event: FocusEvent) => {
    const target = event.target;
    const grid = this.options.gridRef.current;
    if (!(target instanceof HTMLElement) || !grid) return;
    if (grid.contains(target)) this.focusWithin(target, grid);
    else if (!target.closest(layerSelector)) this.cancel();
    else if (!this.options.previewOpen) this.pending = null;
  };
  private readonly onPointer = (event: PointerEvent) => {
    this.pending = null;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      !this.options.gridRef.current?.contains(target) &&
      !target.closest(layerSelector)
    )
      this.cancel();
  };
  listen() {
    document.addEventListener('focusin', this.onFocus);
    document.addEventListener('pointerdown', this.onPointer, true);
    return () => {
      document.removeEventListener('focusin', this.onFocus);
      document.removeEventListener('pointerdown', this.onPointer, true);
    };
  }
}
