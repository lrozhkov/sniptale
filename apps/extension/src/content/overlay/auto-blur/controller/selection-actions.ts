import { useCallback, type Dispatch, type SetStateAction } from 'react';
import {
  AUTO_BLUR_CATEGORY_ORDER,
  type AutoBlurCategory,
} from '../../../../features/highlighter/contracts/auto-blur';
import type { AutoBlurMatch } from '../../../selection/auto-blur-runtime';

export function useSetToggle<T>(setter: Dispatch<SetStateAction<Set<T>>>) {
  return useCallback(
    (value: T) => {
      setter((current) => {
        const next = new Set(current);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        return next;
      });
    },
    [setter]
  );
}

export function useToggleCategorySelection(args: {
  matches: AutoBlurMatch[];
  setSelectedCategories: Dispatch<SetStateAction<Set<AutoBlurCategory>>>;
  setSelectedMatchIds: Dispatch<SetStateAction<Set<string>>>;
}) {
  const { matches, setSelectedCategories, setSelectedMatchIds } = args;

  return useCallback(
    (category: AutoBlurCategory) => {
      const categoryMatchIds = new Set(
        matches.filter((match) => match.category === category).map((match) => match.id)
      );
      setSelectedCategories((current) => {
        const next = new Set(current);
        if (next.has(category)) next.delete(category);
        else next.add(category);
        return next;
      });
      setSelectedMatchIds((current) => {
        const next = new Set(current);
        categoryMatchIds.forEach((matchId) => next.delete(matchId));
        return next;
      });
    },
    [matches, setSelectedCategories, setSelectedMatchIds]
  );
}

export function useToggleAllSelection(args: {
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
  setSelectedCategories: Dispatch<SetStateAction<Set<AutoBlurCategory>>>;
  setSelectedMatchIds: Dispatch<SetStateAction<Set<string>>>;
}) {
  const { selectedCategories, selectedMatchIds, setSelectedCategories, setSelectedMatchIds } = args;

  return useCallback(() => {
    const hasSelection = selectedCategories.size > 0 || selectedMatchIds.size > 0;
    setSelectedCategories(new Set(hasSelection ? [] : AUTO_BLUR_CATEGORY_ORDER));
    setSelectedMatchIds(new Set());
  }, [selectedCategories, selectedMatchIds, setSelectedCategories, setSelectedMatchIds]);
}
