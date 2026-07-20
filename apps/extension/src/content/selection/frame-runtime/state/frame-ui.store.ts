/**
 * Frame UI Store — Zustand store для управления состоянием tooltip/popover рамок
 *
 * Архитектура:
 * - Единый источник истины для UI состояния рамок
 * - Иерархия: tooltip (родитель) → popover (ребёнок)
 * - Popover не может быть открыт без tooltip
 *
 * Принципы:
 * - Store управляет только UI состоянием (tooltip, popover)
 * - EffectMode хранится в FrameData, store только кэширует для оптимизации
 * - Флаги highlighter.ts синхронизируются через useEffect в useFrameUIController
 */

import { create } from 'zustand';
import { createFrameUIActions, createFrameUIComputed } from './frame-ui.store.helpers';
import type { FrameUIState } from './frame-ui.store.types';

export const useFrameUIStore = create<FrameUIState>((set, get) => ({
  activeFrameId: null,
  popoverFrameId: null,
  effectModeCache: {},
  ...createFrameUIActions(set, get),
  ...createFrameUIComputed(get),
}));
