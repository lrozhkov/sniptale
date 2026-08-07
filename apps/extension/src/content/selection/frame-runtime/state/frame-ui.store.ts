/**
 * Frame UI Store — Zustand store для управления hover/selection/popover рамок
 *
 * Архитектура:
 * - Hover winner и selected frame — независимые состояния
 * - Toolbar-popover принадлежит selected frame; quick-popover может жить без selection
 *
 * Принципы:
 * - Store управляет только transient UI состоянием рамок
 */

import { create, type StateCreator } from 'zustand';
import { createLogger } from '@sniptale/platform/observability/logger';

type FramePopoverKind = 'frame-settings' | 'step-badge' | 'callout-settings';
export type ActiveFramePopover = { frameId: string; kind: FramePopoverKind; calloutIndex?: number };

export interface FrameUIState {
  hoveredFrameId: string | null;
  selectedFrameId: string | null;
  toolbarAnchorOffset: { x: number; y: number } | null;
  activePopover: ActiveFramePopover | null;
  resizeFrameId: string | null;
  hoverFrame: (frameId: string) => void;
  scheduleHoverFrameHide: (frameId: string) => void;
  clearHoverFrame: () => void;
  selectFrame: (frameId: string, anchorOffset?: { x: number; y: number }) => void;
  clearSelection: () => void;
  dismissFrame: (frameId: string) => void;
  dismissFrameUi: () => void;
  togglePopover: (frameId: string, kind: FramePopoverKind, calloutIndex?: number) => void;
  toggleQuickPopover: (frameId: string, kind: FramePopoverKind, calloutIndex?: number) => void;
  closePopover: () => void;
  setResizeFrame: (frameId: string | null) => void;
  reset: () => void;
}

type FrameStoreSet = Parameters<StateCreator<FrameUIState>>[0];
type FrameStoreGet = Parameters<StateCreator<FrameUIState>>[1];

const logger = createLogger({ namespace: 'ContentFrameUiStore' });
const HOVER_HIDE_DELAY_MS = 250;
let hoverHideTimer: ReturnType<typeof setTimeout> | null = null;
let hoverHideFrameId: string | null = null;
let calloutEditRequestFrameId: string | null = null;

export function requestFrameCalloutEdit(frameId: string): void {
  calloutEditRequestFrameId = frameId;
}

export function consumeFrameCalloutEditRequest(frameId: string): boolean {
  if (calloutEditRequestFrameId !== frameId) return false;
  calloutEditRequestFrameId = null;
  return true;
}

function cancelHoverHideTimer(frameId?: string) {
  if (hoverHideTimer === null) return;
  if (frameId !== undefined && hoverHideFrameId !== frameId) return;
  clearTimeout(hoverHideTimer);
  hoverHideTimer = null;
  hoverHideFrameId = null;
}

function createOpenPopoverAction(set: FrameStoreSet, get: FrameStoreGet) {
  return (frameId: string, kind: FramePopoverKind, calloutIndex?: number) => {
    const state = get();
    logger.debug('openPopover called', {
      frameId,
      kind,
      currentSelectedFrameId: state.selectedFrameId,
      currentPopover: state.activePopover,
    });

    if (state.selectedFrameId !== frameId) {
      logger.debug('openPopover auto-selecting frame', frameId);
      set({
        hoveredFrameId: null,
        selectedFrameId: frameId,
        toolbarAnchorOffset: null,
        activePopover: { frameId, kind, ...(calloutIndex === undefined ? {} : { calloutIndex }) },
        resizeFrameId: null,
      });
      return;
    }

    logger.debug('openPopover succeeded', frameId);
    set({
      activePopover: { frameId, kind, ...(calloutIndex === undefined ? {} : { calloutIndex }) },
      resizeFrameId: null,
    });
  };
}

function createFrameUIVisibilityActions(set: FrameStoreSet, get: FrameStoreGet) {
  return {
    hoverFrame: (frameId: string) => {
      cancelHoverHideTimer();
      if (get().hoveredFrameId === frameId) return;
      logger.debug('hoverFrame', frameId);
      set({ hoveredFrameId: frameId });
    },

    scheduleHoverFrameHide: (frameId: string) => {
      if (get().hoveredFrameId !== frameId || hoverHideTimer !== null) return;
      hoverHideFrameId = frameId;
      hoverHideTimer = setTimeout(() => {
        hoverHideTimer = null;
        hoverHideFrameId = null;
        if (get().hoveredFrameId === frameId) set({ hoveredFrameId: null });
      }, HOVER_HIDE_DELAY_MS);
    },

    clearHoverFrame: () => {
      cancelHoverHideTimer();
      if (get().hoveredFrameId !== null) set({ hoveredFrameId: null });
    },

    selectFrame: (frameId: string, anchorOffset?: { x: number; y: number }) => {
      cancelHoverHideTimer();
      logger.debug('selectFrame', frameId);
      set({
        hoveredFrameId: null,
        selectedFrameId: frameId,
        toolbarAnchorOffset: anchorOffset ?? null,
        activePopover: null,
      });
    },

    clearSelection: () => {
      logger.debug('clearSelection');
      set({ selectedFrameId: null, toolbarAnchorOffset: null, activePopover: null });
    },

    dismissFrame: (frameId: string) => {
      const state = get();
      const ownsHover = state.hoveredFrameId === frameId;
      const ownsSelection = state.selectedFrameId === frameId;
      const ownsPopover = state.activePopover?.frameId === frameId;
      const ownsResize = state.resizeFrameId === frameId;
      if (!ownsHover && !ownsSelection && !ownsPopover && !ownsResize) return;
      if (ownsHover) cancelHoverHideTimer(frameId);
      set({
        ...(ownsHover ? { hoveredFrameId: null } : {}),
        ...(ownsSelection
          ? { selectedFrameId: null, toolbarAnchorOffset: null, activePopover: null }
          : {}),
        ...(!ownsSelection && ownsPopover ? { activePopover: null } : {}),
        ...(ownsResize ? { resizeFrameId: null } : {}),
      });
    },

    dismissFrameUi: () => {
      cancelHoverHideTimer();
      logger.debug('dismissFrameUi');
      set({
        hoveredFrameId: null,
        selectedFrameId: null,
        toolbarAnchorOffset: null,
        activePopover: null,
      });
    },

    togglePopover: (frameId: string, kind: FramePopoverKind, calloutIndex?: number) => {
      const state = get();
      if (
        state.activePopover?.frameId === frameId &&
        state.activePopover.kind === kind &&
        state.activePopover.calloutIndex === calloutIndex
      ) {
        set({ activePopover: null });
        return;
      }
      createOpenPopoverAction(set, get)(frameId, kind, calloutIndex);
    },

    toggleQuickPopover: (frameId: string, kind: FramePopoverKind, calloutIndex?: number) => {
      const state = get();
      const activePopover = state.activePopover;
      if (state.selectedFrameId !== null) return;
      if (
        activePopover?.frameId === frameId &&
        activePopover.kind === kind &&
        activePopover.calloutIndex === calloutIndex
      ) {
        set({ activePopover: null });
        return;
      }
      set({
        activePopover: { frameId, kind, ...(calloutIndex === undefined ? {} : { calloutIndex }) },
        resizeFrameId: null,
      });
    },

    closePopover: () => {
      logger.debug('closePopover');
      set({ activePopover: null });
    },

    setResizeFrame: (frameId: string | null) => {
      if (get().resizeFrameId !== frameId) {
        set({ resizeFrameId: frameId });
      }
    },

    reset: () => {
      cancelHoverHideTimer();
      calloutEditRequestFrameId = null;
      logger.debug('reset');
      set({
        hoveredFrameId: null,
        selectedFrameId: null,
        toolbarAnchorOffset: null,
        activePopover: null,
        resizeFrameId: null,
      });
    },
  };
}

export const useFrameUIStore = create<FrameUIState>((set, get) => ({
  hoveredFrameId: null,
  selectedFrameId: null,
  toolbarAnchorOffset: null,
  activePopover: null,
  resizeFrameId: null,
  ...createFrameUIVisibilityActions(set, get),
}));
