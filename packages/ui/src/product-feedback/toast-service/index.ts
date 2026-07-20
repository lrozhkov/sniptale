import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { createLazyDefaultOwner } from '@sniptale/foundation/default-owner';
import { ProductToast, type ProductToastTone } from '../toast';

type ToastType = ProductToastTone;

interface ActiveToastEntry {
  container: HTMLDivElement;
  root: Root;
}

export interface ToastHostAdapter {
  appendHost: (container: HTMLDivElement) => void;
  isHidden: () => boolean;
}

type ToastServiceState = {
  activeToasts: Set<ActiveToastEntry>;
  hostAdapter: ToastHostAdapter | null;
};

function createToastServiceState(): ToastServiceState {
  return {
    activeToasts: new Set<ActiveToastEntry>(),
    hostAdapter: null,
  };
}

function shouldRenderToast(type: ToastType): boolean {
  return type === 'error' || type === 'info' || type === 'success' || type === 'warning';
}

function appendToastHost(state: ToastServiceState, container: HTMLDivElement): void {
  if (state.hostAdapter) {
    state.hostAdapter.appendHost(container);
    return;
  }

  (document.body ?? document.documentElement).appendChild(container);
}

function getToastHostStyle(index: number): Partial<CSSStyleDeclaration> {
  return {
    position: 'fixed',
    top: `${60 + index * 64}px`,
    right: '20px',
    maxWidth: '400px',
    width: 'auto',
    zIndex: '2147483647',
    pointerEvents: 'auto',
  };
}

function applyToastPositions(state: ToastServiceState) {
  Array.from(state.activeToasts).forEach((entry, index) => {
    Object.assign(entry.container.style, getToastHostStyle(index));
  });
}

function removeToast(state: ToastServiceState, entry: ActiveToastEntry) {
  state.activeToasts.delete(entry);
  entry.root.unmount();
  entry.container.remove();
  applyToastPositions(state);
}

function createToastService() {
  const state = createToastServiceState();

  return {
    hideAllToasts(): void {
      Array.from(state.activeToasts).forEach((entry) => removeToast(state, entry));
    },
    setHostAdapter(adapter: ToastHostAdapter | null): void {
      state.hostAdapter = adapter;
    },
    showToast(message: string, type: ToastType = 'info', duration: number = 2000): void {
      if (state.hostAdapter?.isHidden()) {
        return;
      }

      if (!shouldRenderToast(type)) {
        return;
      }

      const container = document.createElement('div');
      container.dataset['ui'] = 'shared.toast.host';
      const root = createRoot(container);
      const entry: ActiveToastEntry = { container, root };

      appendToastHost(state, container);
      state.activeToasts.add(entry);
      applyToastPositions(state);

      root.render(
        createElement(ProductToast, {
          message,
          tone: type,
          duration,
          onClose: () => removeToast(state, entry),
        })
      );
    },
  };
}

const defaultToastService = createLazyDefaultOwner(createToastService);

export function configureToastHostAdapter(adapter: ToastHostAdapter | null): void {
  defaultToastService.getOwner().setHostAdapter(adapter);
}

export function hideAllToasts(): void {
  defaultToastService.getOwner().hideAllToasts();
}

export function showToast(
  message: string,
  type: ToastType = 'info',
  duration: number = 2000
): void {
  defaultToastService.getOwner().showToast(message, type, duration);
}

export const toast = {
  info: (message: string, duration?: number) => showToast(message, 'info', duration),
  success: (message: string, duration?: number) => showToast(message, 'success', duration),
  warning: (message: string, duration?: number) => showToast(message, 'warning', duration),
  error: (message: string, duration?: number) => showToast(message, 'error', duration),
};
