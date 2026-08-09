import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnnotationTemplateTag } from '@sniptale/runtime-contracts/highlighter/annotation-template-tags';
import { toast } from '@sniptale/ui/product-feedback/toast-service';
import {
  createAnnotationTemplateTag,
  deleteAnnotationTemplateTag,
  mergeAnnotationTemplateTag,
  renameAnnotationTemplateTag,
} from '../../../../../composition/persistence/annotation-template-tags';
import {
  loadCalloutPresetCatalog,
  subscribeToCalloutPresetCatalog,
} from '../../../../../composition/persistence/callout-presets';
import {
  loadStepBadgePresetCatalog,
  subscribeToStepBadgePresetCatalog,
} from '../../../../../composition/persistence/step-badge-presets';
import {
  loadHighlighterSettings,
  subscribeToHighlighterSettings,
} from '../../../../../composition/persistence/highlighter';
import { translate } from '../../../../../platform/i18n';
import { useAnnotationTemplateTagState } from '../../../../../ui/annotation-template-query';

type TaggedPreset = { tagIds: readonly string[] };

function countUsage(tags: readonly AnnotationTemplateTag[], catalogs: readonly TaggedPreset[][]) {
  const counts = new Map(tags.map((tag) => [tag.id, 0]));
  for (const preset of catalogs.flat()) {
    for (const tagId of preset.tagIds) counts.set(tagId, (counts.get(tagId) ?? 0) + 1);
  }
  return counts;
}

export function useAnnotationTemplateTagsController() {
  const tagState = useAnnotationTemplateTagState();
  const [catalogs, setCatalogs] = useState<[TaggedPreset[], TaggedPreset[], TaggedPreset[]]>([
    [],
    [],
    [],
  ]);
  useEffect(() => {
    let active = true;
    const observed = [false, false, false];
    void Promise.all([
      loadHighlighterSettings(),
      loadStepBadgePresetCatalog(),
      loadCalloutPresetCatalog(),
    ])
      .then(([frame, step, callout]) => {
        if (!active) return;
        setCatalogs((current) => [
          observed[0] ? current[0] : frame.borderPresets,
          observed[1] ? current[1] : step.presets,
          observed[2] ? current[2] : callout.presets,
        ]);
      })
      .catch(() => undefined);
    const unsubscribers = [
      subscribeToHighlighterSettings((next) => {
        observed[0] = true;
        setCatalogs((current) => [next.borderPresets, current[1], current[2]]);
      }),
      subscribeToStepBadgePresetCatalog((next) => {
        observed[1] = true;
        setCatalogs((current) => [current[0], next.presets, current[2]]);
      }),
      subscribeToCalloutPresetCatalog((next) => {
        observed[2] = true;
        setCatalogs((current) => [current[0], current[1], next.presets]);
      }),
    ];
    return () => {
      active = false;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);
  const usage = useMemo(
    () => countUsage(tagState.state.tags, catalogs),
    [catalogs, tagState.state.tags]
  );
  const mutate = useCallback(async (operation: () => Promise<{ outcome: string }>) => {
    try {
      const result = await operation();
      if (result.outcome === 'applied' || result.outcome === 'unchanged') return true;
    } catch {
      // The user-facing error below intentionally excludes storage details and tag labels.
    }
    toast.error(translate('highlighter.templateTags.saveError'));
    return false;
  }, []);
  return {
    error: tagState.error,
    isLoading: tagState.isLoading,
    state: tagState.state,
    usage,
    actions: {
      create: (label: string) => mutate(() => createAnnotationTemplateTag(label)),
      delete: (id: string) => mutate(() => deleteAnnotationTemplateTag(id)),
      merge: (sourceId: string, targetId: string) =>
        mutate(() => mergeAnnotationTemplateTag(sourceId, targetId)),
      rename: (id: string, label: string) => mutate(() => renameAnnotationTemplateTag(id, label)),
    },
  };
}
