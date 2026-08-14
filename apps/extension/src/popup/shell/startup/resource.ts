// policyStateIds: [] - this popup-local module cache is reconstructible and grants no authority.
import type { ComponentType } from 'react';
import type { PopupPage } from '../navigation/actions';
import type { PopupStartupDescriptor } from './descriptor';

type PopupRoute = ComponentType<{ startup: PopupStartupDescriptor }>;
const resolved = new Map<PopupPage, PopupRoute>();
const pending = new Map<PopupPage, Promise<PopupRoute>>();

function loader(page: PopupPage): Promise<PopupRoute> {
  if (page === 'home') return import('../home/route').then((module) => module.HomeRoute);
  if (page === 'video')
    return import('../../recording/video/route').then((module) => module.VideoRoute);
  return import('../export/route').then((module) => module.ExportRoute);
}

export function preloadPopupPage(page: PopupPage): Promise<PopupRoute> {
  const cached = resolved.get(page);
  if (cached) return Promise.resolve(cached);
  const current = pending.get(page);
  if (current) return current;
  const mark = `sniptale-popup-route-preload-${page}-${performance.now()}`;
  performance.mark(mark);
  const request = loader(page).then(
    (component) => {
      pending.delete(page);
      resolved.set(page, component);
      performance.measure(`sniptale-popup-route-preload-${page}`, mark);
      return component;
    },
    (error) => {
      pending.delete(page);
      throw error;
    }
  );
  pending.set(page, request);
  return request;
}

export function loadPopupRoute(startup: PopupStartupDescriptor): Promise<PopupRoute> {
  return preloadPopupPage(startup.page);
}
