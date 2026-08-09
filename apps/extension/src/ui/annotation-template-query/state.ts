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

export function useAnnotationTemplateTagState(enabled = true) {
  const [state, setState] = useState<AnnotationTemplateTagState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const generationRef = useRef(0);
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
      setState(next);
      setError(false);
      setIsLoading(false);
    });
    return () => {
      generationRef.current += 1;
      unsubscribe();
    };
  }, [enabled]);
  const setActiveFilterTagIds = useCallback(async (tagIds: AnnotationTemplateTagId[]) => {
    try {
      const result = await setActiveAnnotationTemplateTagFilter(tagIds);
      if (result.outcome !== 'applied' && result.outcome !== 'unchanged') {
        toast.error(translate('highlighter.templateTags.saveError'));
      }
    } catch {
      toast.error(translate('highlighter.templateTags.saveError'));
    }
  }, []);
  return { error, isLoading, setActiveFilterTagIds, state };
}
