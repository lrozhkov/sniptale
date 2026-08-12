import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AnnotationTemplateTagId,
  AnnotationTemplateTagState,
} from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import {
  loadAnnotationTemplateTagState,
  setActiveAnnotationTemplateTagFilter,
  subscribeToAnnotationTemplateTagState,
} from '../../composition/persistence/annotation-template-tags';
import { translate } from '../../platform/i18n';

const EMPTY_STATE: AnnotationTemplateTagState = {
  activeFilterTagIds: [],
  schemaVersion: 1,
  tags: [],
};

function enqueueActiveFilterPersistence(
  queueRef: { current: Promise<void> },
  tagIds: AnnotationTemplateTagId[]
): Promise<void> {
  const operation = queueRef.current.then(async () => {
    const result = await setActiveAnnotationTemplateTagFilter(tagIds);
    if (result.outcome !== 'applied' && result.outcome !== 'unchanged') {
      throw new Error('Annotation template tag filter was not applied');
    }
  });
  queueRef.current = operation.then(
    () => undefined,
    () => undefined
  );
  return operation;
}

export function useAnnotationTemplateTagState(enabled = true) {
  const [state, setState] = useState<AnnotationTemplateTagState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const generationRef = useRef(0);
  const committedRef = useRef(EMPTY_STATE);
  const mutationRevisionRef = useRef(0);
  const pendingMutationCountRef = useRef(0);
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    if (!enabled) {
      setIsLoading(false);
      return;
    }
    const generation = ++generationRef.current;
    let observedNewerState = false;
    void loadAnnotationTemplateTagState()
      .then((next) => {
        if (generation !== generationRef.current || observedNewerState) return;
        committedRef.current = next;
        setState(next);
        setError(false);
      })
      .catch(() => {
        if (generation === generationRef.current) setError(true);
      })
      .finally(() => {
        if (generation === generationRef.current) setIsLoading(false);
      });
    const unsubscribe = subscribeToAnnotationTemplateTagState((next) => {
      if (generation !== generationRef.current) return;
      observedNewerState = true;
      committedRef.current = next;
      setState((current) =>
        pendingMutationCountRef.current > 0
          ? { ...next, activeFilterTagIds: current.activeFilterTagIds }
          : next
      );
      setError(false);
      setIsLoading(false);
    });
    return () => {
      generationRef.current += 1;
      unsubscribe();
    };
  }, [enabled]);
  const setActiveFilterTagIds = useCallback(async (tagIds: AnnotationTemplateTagId[]) => {
    const revision = ++mutationRevisionRef.current;
    pendingMutationCountRef.current += 1;
    setState((current) => ({ ...current, activeFilterTagIds: tagIds }));
    try {
      await enqueueActiveFilterPersistence(persistenceQueueRef, tagIds);
      committedRef.current = { ...committedRef.current, activeFilterTagIds: tagIds };
    } catch {
      toast.error(translate('highlighter.templateTags.saveError'));
      if (mutationRevisionRef.current === revision) setState(committedRef.current);
    } finally {
      pendingMutationCountRef.current = Math.max(0, pendingMutationCountRef.current - 1);
    }
  }, []);
  return { error, isLoading, setActiveFilterTagIds, state };
}
