/**
 * AI Modal Store — Zustand store для сохранения состояния AI Modal
 *
 * Архитектура:
 * - In-memory хранилище (только для текущей сессии)
 * - Сохраняет последний введённый промпт
 * - Не персистентно между перезагрузками браузера
 */

import { create } from 'zustand';

interface AIModalState {
  /**
   * Последний введённый промпт
   * Сохраняется при закрытии модала и восстанавливается при открытии
   */
  lastPrompt: string;

  /**
   * Сохранить промпт
   */
  setLastPrompt: (prompt: string) => void;

  /**
   * Очистить сохранённый промпт
   */
  clearPrompt: () => void;
}

export const useAIModalStore = create<AIModalState>((set) => ({
  lastPrompt: '',

  setLastPrompt: (prompt: string) => {
    set({ lastPrompt: prompt });
  },

  clearPrompt: () => {
    set({ lastPrompt: '' });
  },
}));

// Селектор для оптимизации re-render
export const selectLastPrompt = (state: AIModalState) => state.lastPrompt;
