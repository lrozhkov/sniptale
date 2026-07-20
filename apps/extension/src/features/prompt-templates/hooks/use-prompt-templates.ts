import { useCallback, useEffect, useState } from 'react';

import type { PromptTemplate } from '../../../contracts/settings';
import {
  getPromptTemplateErrorMessage,
  touchPromptTemplateSelection,
  updatePromptTemplateList,
} from '../helpers';
import {
  createPromptTemplateRecord,
  deletePromptTemplateRecord,
  loadPromptTemplateList,
  savePromptTemplatePatch,
  touchPromptTemplateRecord,
} from '../service';

export interface PromptTemplatesState {
  templates: PromptTemplate[];
  isLoading: boolean;
  isMutating: boolean;
  error: string | null;
  addTemplate: (name: string, content: string) => Promise<void>;
  updateTemplate: (id: string, data: Partial<PromptTemplate>) => Promise<void>;
  removeTemplate: (id: string) => Promise<void>;
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

function usePromptTemplateLoader(state: ReturnType<typeof usePromptTemplateStateValues>) {
  const { setError, setIsLoading, setTemplates } = state;
  const loadTemplates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      setTemplates(await loadPromptTemplateList());
    } catch (error) {
      setError(getPromptTemplateErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [setError, setIsLoading, setTemplates]);

  useEffect(() => {
    void loadTemplates();
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

function usePromptTemplateCrudActions(state: ReturnType<typeof usePromptTemplateStateValues>) {
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
  const loadTemplates = usePromptTemplateLoader(state);
  const actions = usePromptTemplateCrudActions(state);
  const selectTemplate = usePromptTemplateSelectionAction(state);

  return {
    templates: state.templates,
    isLoading: state.isLoading,
    isMutating: state.isMutating,
    error: state.error,
    addTemplate: actions.addTemplate,
    updateTemplate: actions.updateTemplate,
    removeTemplate: actions.removeTemplate,
    selectTemplate,
    refreshTemplates: loadTemplates,
  };
}
