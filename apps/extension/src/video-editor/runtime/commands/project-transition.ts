import { useSyncExternalStore } from 'react';

interface ProjectTransitionToken {
  complete: () => void;
  isCurrent: () => boolean;
}

let generation = 0;
let active = false;
let listeners: Array<() => void> = [];

function publishPending(nextPending: boolean): void {
  if (active === nextPending) return;
  active = nextPending;
  for (const listener of listeners) listener();
}

export function beginProjectTransition(): ProjectTransitionToken {
  generation += 1;
  const tokenGeneration = generation;
  publishPending(true);
  return {
    complete: () => {
      if (generation === tokenGeneration) publishPending(false);
    },
    isCurrent: () => generation === tokenGeneration,
  };
}

function isProjectTransitionPending(): boolean {
  return active;
}

function subscribeToProjectTransition(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((candidate) => candidate !== listener);
  };
}

export function useProjectTransitionPending(): boolean {
  return useSyncExternalStore(
    subscribeToProjectTransition,
    isProjectTransitionPending,
    isProjectTransitionPending
  );
}
