import { useCallback, useEffect, useRef, useState } from 'react';

import type { PromptTemplate } from '../../../contracts/settings';
import {
  getPromptTemplateErrorMessage,
  movePromptTemplateBefore,
  touchPromptTemplateSelection,
  updatePromptTemplateList,
} from '../helpers';
import {
  createPromptTemplateRecord,
  deletePromptTemplateRecord,
  loadPromptTemplateList,
  savePromptTemplatePatch,
  resetPromptTemplateRecord,
  savePromptTemplateOrder,
  setPromptTemplateEnabledRecord,
  touchPromptTemplateRecord,
} from '../service';
import { useAppLocale } from '../../../platform/i18n';

export interface PromptTemplatesState {
  templates: PromptTemplate[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  addTemplate: (name: string, content: string) => Promise<void>;
  updateTemplate: (id: string, data: Partial<PromptTemplate>) => Promise<void>;
  templateLifecycle: {
    move: (itemId: string, beforeItemId: string | null) => Promise<void>;
    remove: (id: string) => Promise<void>;
    restoreSystem: (id: string) => Promise<void>;
    setEnabled: (id: string, enabled: boolean) => Promise<void>;
  };
  selectTemplate: (template: PromptTemplate) => Promise<string>;
  refreshTemplates: () => Promise<void>;
}

function usePromptTemplateStateValues() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return {
    error,
    isLoading,
    isMutating,
    setError,
    setIsLoading,
    setIsMutating,
    setTemplates,
    templates,
  };
}

function usePromptTemplateLoader(
  state: ReturnType<typeof usePromptTemplateStateValues>,
  locale: ReturnType<typeof useAppLocale>
) {
  const requestGenerationRef = useRef(0);
  const { setError, setIsLoading, setTemplates } = state;
  const loadTemplates = useCallback(async () => {
    const requestGeneration = requestGenerationRef.current + 1;
    requestGenerationRef.current = requestGeneration;
    setIsLoading(true);
    setError(null);

    try {
      const templates = await loadPromptTemplateList(locale);
      if (requestGenerationRef.current === requestGeneration) {
        setTemplates(templates);
      }
    } catch (error) {
      if (requestGenerationRef.current === requestGeneration) {
        setError(getPromptTemplateErrorMessage(error));
      }
    } finally {
      if (requestGenerationRef.current === requestGeneration) {
        setIsLoading(false);
      }
    }
  }, [locale, setError, setIsLoading, setTemplates]);

  useEffect(() => {
    void loadTemplates();
    return () => {
      requestGenerationRef.current += 1;
    };
  }, [loadTemplates]);

  return loadTemplates;
}

function usePromptTemplateMutationRunner(
  setIsMutating: ReturnType<typeof usePromptTemplateStateValues>['setIsMutating']
) {
  return useCallback(
    async <T>(mutation: () => Promise<T>): Promise<T> => {
      setIsMutating(true);
      try {
        return await mutation();
      } finally {
        setIsMutating(false);
      }
    },
    [setIsMutating]
  );
}

function usePromptTemplateCrudActions(
  state: ReturnType<typeof usePromptTemplateStateValues>,
  locale: ReturnType<typeof useAppLocale>
) {
  const { setError, setIsMutating, setTemplates, templates } = state;
  const runMutation = usePromptTemplateMutationRunner(setIsMutating);

  return {
    addTemplate: useCallback(
      (name: string, content: string) =>
        runMutation(async () => {
          setError(null);
          try {
            const newTemplate = await createPromptTemplateRecord(name, content);
            setTemplates((previous) => [newTemplate, ...previous]);
          } catch (error) {
            setError(getPromptTemplateErrorMessage(error));
            throw error;
          }
        }),
      [runMutation, setError, setTemplates]
    ),
    removeTemplate: useCallback(
      (id: string) =>
        runMutation(async () => {
          setError(null);
          try {
            await deletePromptTemplateRecord(id);
            setTemplates((previous) => previous.filter((template) => template.id !== id));
          } catch (error) {
            setError(getPromptTemplateErrorMessage(error));
            throw error;
          }
        }),
      [runMutation, setError, setTemplates]
    ),
    updateTemplate: useCallback(
      (id: string, data: Partial<PromptTemplate>) =>
        runMutation(async () => {
          setError(null);
          try {
            const updatedTemplate = await savePromptTemplatePatch(templates, id, data);
            setTemplates((previous) => updatePromptTemplateList(previous, updatedTemplate));
          } catch (error) {
            setError(getPromptTemplateErrorMessage(error));
            throw error;
          }
        }),
      [runMutation, setError, setTemplates, templates]
    ),
    resetTemplate: useCallback(
      (id: string) =>
        runMutation(async () => {
          setError(null);
          try {
            const restoredTemplate = await resetPromptTemplateRecord(id, locale);
            setTemplates((previous) => updatePromptTemplateList(previous, restoredTemplate));
          } catch (error) {
            setError(getPromptTemplateErrorMessage(error));
            throw error;
          }
        }),
      [locale, runMutation, setError, setTemplates]
    ),
    setTemplateEnabled: useCallback(
      (id: string, enabled: boolean) =>
        runMutation(async () => {
          setError(null);
          try {
            const updatedTemplate = await setPromptTemplateEnabledRecord(id, enabled);
            setTemplates((previous) => updatePromptTemplateList(previous, updatedTemplate));
          } catch (error) {
            setError(getPromptTemplateErrorMessage(error));
            throw error;
          }
        }),
      [runMutation, setError, setTemplates]
    ),
    moveTemplate: useCallback(
      (itemId: string, beforeItemId: string | null) =>
        runMutation(async () => {
          setError(null);
          try {
            const nextTemplates = movePromptTemplateBefore(templates, itemId, beforeItemId);
            if (nextTemplates === templates) return;
            await savePromptTemplateOrder(nextTemplates);
            setTemplates(nextTemplates);
          } catch (error) {
            setError(getPromptTemplateErrorMessage(error));
            throw error;
          }
        }),
      [runMutation, setError, setTemplates, templates]
    ),
  };
}

function usePromptTemplateSelectionAction(state: ReturnType<typeof usePromptTemplateStateValues>) {
  const { setError, setIsMutating, setTemplates } = state;
  const runMutation = usePromptTemplateMutationRunner(setIsMutating);

  return useCallback(
    (template: PromptTemplate) =>
      runMutation(async () => {
        setError(null);
        try {
          const selection = await touchPromptTemplateRecord(template);
          setTemplates((previous) =>
            touchPromptTemplateSelection(previous, template, selection.lastUsedAt)
          );
          return selection.content;
        } catch (error) {
          setError(getPromptTemplateErrorMessage(error));
          throw error;
        }
      }),
    [runMutation, setError, setTemplates]
  );
}

export function usePromptTemplates(): PromptTemplatesState {
  const state = usePromptTemplateStateValues();
  const locale = useAppLocale();
  const loadTemplates = usePromptTemplateLoader(state, locale);
  const actions = usePromptTemplateCrudActions(state, locale);
  const selectTemplate = usePromptTemplateSelectionAction(state);

  return {
    templates: state.templates,
    isLoading: state.isLoading,
    isMutating: state.isMutating,
    error: state.error,
    addTemplate: actions.addTemplate,
    updateTemplate: actions.updateTemplate,
    templateLifecycle: {
      move: actions.moveTemplate,
      remove: actions.removeTemplate,
      restoreSystem: actions.resetTemplate,
      setEnabled: actions.setTemplateEnabled,
    },
    selectTemplate,
    refreshTemplates: loadTemplates,
  };
}
