import { lazy, type ComponentType } from 'react';
import {
  createRetryableModuleLoader,
  preloadModule,
} from '../../../../platform/module-loader/retryable-module-loader';
import type { AIModalProps } from './types';

type AIModalModule = {
  default: ComponentType<AIModalProps>;
};

const aiModalModuleLoader = createRetryableModuleLoader<AIModalModule>(() => import('.'));

export function preloadAIModal(): Promise<void> {
  return preloadModule(aiModalModuleLoader);
}

export const LazyAIModal = lazy(aiModalModuleLoader.load);
