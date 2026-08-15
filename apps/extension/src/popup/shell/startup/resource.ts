// policyStateIds: [] - this popup-local module cache is reconstructible and grants no authority.
import type { ComponentType } from 'react';
import type { PopupPage } from '../navigation/actions';
import type { PopupStartupDescriptor } from './descriptor';

export type PopupRouteProps = {
  startup: PopupStartupDescriptor;
  navigateToDescriptor(descriptor: PopupStartupDescriptor): void;
};

type PopupRoute = ComponentType<PopupRouteProps>;
const resolved = new Map<PopupPage, PopupRoute>();
const pending = new Map<PopupPage, Promise<PopupRoute>>();

function loader(page: PopupPage): Promise<PopupRoute> {
  if (page === 'screenshots')
    return import('../home/route').then((module) => module.ScreenshotsRoute);
  if (page === 'video')
    return import('../../recording/video/route').then((module) => module.VideoRoute);
  if (page === 'menu') return import('../menu/route').then((module) => module.MenuRoute);
  if (page === 'tools') return import('../tools/route').then((module) => module.ToolsRoute);
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
