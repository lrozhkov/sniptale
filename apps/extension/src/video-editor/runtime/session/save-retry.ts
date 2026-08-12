import { useSyncExternalStore } from 'react';

let retryGeneration = 0;
let listeners: Array<() => void> = [];

export function requestVideoEditorSaveRetry(): void {
  retryGeneration += 1;
  for (const listener of listeners) listener();
}

function getRetryGeneration(): number {
  return retryGeneration;
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((candidate) => candidate !== listener);
  };
}

export function useVideoEditorSaveRetryGeneration(): number {
  return useSyncExternalStore(subscribe, getRetryGeneration, getRetryGeneration);
}
