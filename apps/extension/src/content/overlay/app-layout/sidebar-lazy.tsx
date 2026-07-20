import { lazy } from 'react';
import {
  createRetryableModuleLoader,
  preloadModule,
} from '../../platform/module-loader/retryable-module-loader';

type SidebarModule = typeof import('./sidebar');

const contentScenarioRecorderSidebarModuleLoader = createRetryableModuleLoader<SidebarModule>(
  () => import('./sidebar')
);

export function preloadContentScenarioRecorderSidebar(): Promise<void> {
  return preloadModule(contentScenarioRecorderSidebarModuleLoader);
}

export const LazyContentScenarioRecorderSidebar = lazy(async () => {
  const module = await contentScenarioRecorderSidebarModuleLoader.load();
  return {
    default: module.ContentScenarioRecorderSidebar,
  };
});
