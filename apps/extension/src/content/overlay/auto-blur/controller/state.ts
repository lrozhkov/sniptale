import { useCallback, useReducer, useRef } from 'react';
import type {
  AutoBlurCategory,
  AutoBlurSettings,
} from '../../../../features/highlighter/contracts/auto-blur';
import { AUTO_BLUR_CATEGORY_ORDER } from '../../../../features/highlighter/contracts/auto-blur';
import type { BlurSettings } from '../../../../features/highlighter/contracts';
import type { TranslationKey } from '../../../../platform/i18n';
import type { AutoBlurMatch } from '../../../selection/auto-blur-runtime';
import { DEFAULT_AUTO_BLUR_SETTINGS } from '../persistence';

type AutoBlurStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

type AutoBlurSessionState = {
  autoApplyEnabled: boolean;
  blurSettings: BlurSettings;
  errorMessage: TranslationKey | null;
  isApplying: boolean;
  isOpen: boolean;
  matches: AutoBlurMatch[];
  selectedCategories: Set<AutoBlurCategory>;
  selectedMatchIds: Set<string>;
  status: AutoBlurStatus;
};

type AutoBlurSessionAction =
  | { type: 'apply-failed'; message: TranslationKey }
  | { type: 'apply-finished' }
  | { type: 'apply-started' }
  | { type: 'auto-apply-changed'; enabled: boolean }
  | { type: 'blur-settings-changed'; settings: BlurSettings }
  | { type: 'closed' }
  | { type: 'error-reported'; message: TranslationKey }
  | { type: 'mode-closed' }
  | { type: 'opened' }
  | { type: 'scan-failed' }
  | { type: 'scan-started'; settings: AutoBlurSettings }
  | { type: 'scan-succeeded'; matches: AutoBlurMatch[]; settings: AutoBlurSettings }
  | { type: 'selection-reset'; settings: AutoBlurSettings }
  | { type: 'toggle-all' }
  | { type: 'toggle-category'; category: AutoBlurCategory }
  | { type: 'toggle-match'; matchId: string };

function createInitialState(): AutoBlurSessionState {
  return {
    autoApplyEnabled: DEFAULT_AUTO_BLUR_SETTINGS.autoApplyEnabled,
    blurSettings: { ...DEFAULT_AUTO_BLUR_SETTINGS.blurSettings },
    errorMessage: null,
    isApplying: false,
    isOpen: false,
    matches: [],
    selectedCategories: new Set(),
    selectedMatchIds: new Set(),
    status: 'idle',
  };
}

function resetSelection(
  state: AutoBlurSessionState,
  settings: AutoBlurSettings
): AutoBlurSessionState {
  return {
    ...state,
    autoApplyEnabled: settings.autoApplyEnabled,
    blurSettings: { ...settings.blurSettings },
    selectedCategories: new Set(settings.selectedCategories),
    selectedMatchIds: new Set(),
  };
}

function toggleCategory(state: AutoBlurSessionState, category: AutoBlurCategory) {
  const selectedCategories = new Set(state.selectedCategories);
  if (selectedCategories.has(category)) selectedCategories.delete(category);
  else selectedCategories.add(category);

  const categoryMatchIds = new Set(
    state.matches.filter((match) => match.category === category).map((match) => match.id)
  );
  const selectedMatchIds = new Set(state.selectedMatchIds);
  categoryMatchIds.forEach((matchId) => selectedMatchIds.delete(matchId));
  return { ...state, selectedCategories, selectedMatchIds };
}

function reduceAutoBlurSession(
  state: AutoBlurSessionState,
  action: AutoBlurSessionAction
): AutoBlurSessionState {
  switch (action.type) {
    case 'apply-failed':
      return { ...state, errorMessage: action.message, isApplying: false };
    case 'apply-finished':
      return { ...state, isApplying: false };
    case 'apply-started':
      return { ...state, errorMessage: null, isApplying: true };
    case 'auto-apply-changed':
      return { ...state, autoApplyEnabled: action.enabled };
    case 'blur-settings-changed':
      return { ...state, blurSettings: action.settings };
    case 'closed':
      return { ...state, errorMessage: null, isApplying: false, isOpen: false };
    case 'error-reported':
      return { ...state, errorMessage: action.message };
    case 'mode-closed':
      return { ...state, isOpen: false };
    case 'opened':
      return { ...state, isOpen: true };
    case 'scan-failed':
      return { ...state, matches: [], status: 'error' };
    case 'scan-started':
      return { ...resetSelection(state, action.settings), errorMessage: null, status: 'loading' };
    case 'scan-succeeded': {
      const next = resetSelection(state, action.settings);
      return {
        ...next,
        matches: action.matches,
        status: action.matches.length > 0 ? 'ready' : 'empty',
      };
    }
    case 'selection-reset':
      return resetSelection(state, action.settings);
    case 'toggle-all': {
      const hasSelection = state.selectedCategories.size > 0 || state.selectedMatchIds.size > 0;
      return {
        ...state,
        selectedCategories: new Set(hasSelection ? [] : AUTO_BLUR_CATEGORY_ORDER),
        selectedMatchIds: new Set(),
      };
    }
    case 'toggle-category':
      return toggleCategory(state, action.category);
    case 'toggle-match': {
      const selectedMatchIds = new Set(state.selectedMatchIds);
      if (selectedMatchIds.has(action.matchId)) selectedMatchIds.delete(action.matchId);
      else selectedMatchIds.add(action.matchId);
      return { ...state, selectedMatchIds };
    }
  }
}

export function useAutoBlurSession() {
  const [state, dispatch] = useReducer(reduceAutoBlurSession, undefined, createInitialState);
  const scanVersionRef = useRef(0);

  const reset = useCallback((settings: AutoBlurSettings) => {
    dispatch({ type: 'selection-reset', settings });
  }, []);
  const close = useCallback(() => {
    scanVersionRef.current += 1;
    dispatch({ type: 'closed' });
  }, []);
  const closeForMode = useCallback(() => {
    scanVersionRef.current += 1;
    dispatch({ type: 'mode-closed' });
  }, []);

  return {
    scanVersionRef,
    state,
    transitions: {
      beginApplying: useCallback(() => dispatch({ type: 'apply-started' }), []),
      close,
      closeForMode,
      completeScan: useCallback((settings: AutoBlurSettings, matches: AutoBlurMatch[]) => {
        dispatch({ type: 'scan-succeeded', matches, settings });
      }, []),
      failApplying: useCallback(
        (message: TranslationKey) => dispatch({ type: 'apply-failed', message }),
        []
      ),
      failScan: useCallback(() => dispatch({ type: 'scan-failed' }), []),
      finishApplying: useCallback(() => dispatch({ type: 'apply-finished' }), []),
      open: useCallback(() => dispatch({ type: 'opened' }), []),
      reportError: useCallback(
        (message: TranslationKey) => dispatch({ type: 'error-reported', message }),
        []
      ),
      reset,
      setAutoApplyEnabled: useCallback(
        (enabled: boolean) => dispatch({ type: 'auto-apply-changed', enabled }),
        []
      ),
      setBlurSettings: useCallback(
        (settings: BlurSettings) => dispatch({ type: 'blur-settings-changed', settings }),
        []
      ),
      startScan: useCallback((settings: AutoBlurSettings) => {
        dispatch({ type: 'scan-started', settings });
      }, []),
      toggleAll: useCallback(() => dispatch({ type: 'toggle-all' }), []),
      toggleCategory: useCallback(
        (category: AutoBlurCategory) => dispatch({ type: 'toggle-category', category }),
        []
      ),
      toggleMatch: useCallback(
        (matchId: string) => dispatch({ type: 'toggle-match', matchId }),
        []
      ),
    },
  };
}
