import type {
  BorderPreset,
  FocusSettings,
  FrameData,
} from '../../../../features/highlighter/contracts';
import { createCompositeSelector } from '../../../platform/frame/selectors';
import { createDocumentPagePlacement } from '../../../platform/frame';
import {
  DEFAULT_BORDER_PRESET,
  DEFAULT_FOCUS_SETTINGS,
} from '../../../../composition/persistence/highlighter';
import { invalidateFrameCache } from '../../highlighter';
import {
  hasBlurFrameForRect,
  isFrameOverlappingAutoBlurRect,
  type AutoBlurApplyInput,
  type AutoBlurClearInput,
  type AutoBlurSyncInput,
} from '../../auto-blur-runtime';
import type { UseFrameMutationActionHelperOptions } from './types';
import { createGenerateFrameId } from './frame-factory';
import { useFrameUIStore } from '../state/frame-ui.store';
import { calculateFrameContainerCoords, createFrameCalcSettings } from '../coords';
import { calculateFrameOffsetFromElement } from '../manager/coords';

type CreateAddAutoBlurFramesHandlerArgs = Pick<
  UseFrameMutationActionHelperOptions,
  | 'framesRef'
  | 'hostLayoutServiceRef'
  | 'highlighterSettingsCacheRef'
  | 'sessionFocusSettingsRef'
  | 'setFrames'
>;

type HighlighterSettingsSnapshot =
  CreateAddAutoBlurFramesHandlerArgs['highlighterSettingsCacheRef']['current'];

function resolveDefaultBorderPreset(settings: HighlighterSettingsSnapshot) {
  if (!settings) {
    return { ...DEFAULT_BORDER_PRESET };
  }

  const preset =
    settings.borderPresets.find((item) => item.id === settings.defaultBorderPresetId) ??
    DEFAULT_BORDER_PRESET;
  return { ...preset };
}

function cloneFocusSettings(settings: FocusSettings | undefined): FocusSettings {
  return { ...(settings ?? DEFAULT_FOCUS_SETTINGS) };
}

function createLinkedElementSelector(element: HTMLElement): string {
  const selector = createCompositeSelector(element);
  return selector.iframeSelector
    ? `${selector.iframeSelector} => ${selector.elementSelector}`
    : selector.elementSelector;
}

function createAutoBlurFrame(args: {
  borderSettings: BorderPreset;
  focusSettings: FocusSettings;
  generateFrameId: () => string;
  target: AutoBlurApplyInput['targets'][number];
  blurSettings: AutoBlurApplyInput['blurSettings'];
}): FrameData {
  const frameCoords = calculateFrameContainerCoords(
    args.target.rect,
    createFrameCalcSettings(args.borderSettings)
  );

  const pagePlacement = createDocumentPagePlacement(
    args.target.element.ownerDocument,
    frameCoords.x,
    frameCoords.y
  );
  return {
    id: args.generateFrameId(),
    createdBy: 'auto-blur',
    ...frameCoords,
    linkedElementSelector: createLinkedElementSelector(args.target.element),
    ...(pagePlacement ? { pagePlacement } : {}),
    offset: calculateFrameOffsetFromElement(frameCoords, args.target.element),
    effectMode: 'blur',
    borderSettings: args.borderSettings,
    blurSettings: { ...args.blurSettings },
    focusSettings: args.focusSettings,
  };
}

function shouldRemoveAutoBlurFrame(frame: FrameData, input: AutoBlurClearInput): boolean {
  if (frame.createdBy !== 'auto-blur') {
    return false;
  }

  if (input.targets.length === 0) {
    return true;
  }

  return input.targets.some((target) => isFrameOverlappingAutoBlurRect(frame, target.rect));
}

function shouldPruneAutoBlurFrame(args: {
  anchorNode: HTMLElement | undefined;
  frame: FrameData;
  targets: AutoBlurSyncInput['targets'];
}): boolean {
  if (args.frame.createdBy !== 'auto-blur') {
    return false;
  }

  if (!args.anchorNode?.isConnected) {
    return true;
  }

  return !args.targets.some((target) => isFrameOverlappingAutoBlurRect(args.frame, target.rect));
}

function removeAutoBlurFrames(
  args: Pick<
    CreateAddAutoBlurFramesHandlerArgs,
    'framesRef' | 'hostLayoutServiceRef' | 'setFrames'
  >,
  shouldRemoveFrame: (frame: FrameData) => boolean,
  invalidateOnRemove = true
): string[] {
  const removedIds = args.framesRef.current.filter(shouldRemoveFrame).map((frame) => frame.id);
  if (removedIds.length === 0) return [];
  const removedIdSet = new Set(removedIds);
  const frames = args.framesRef.current.filter((frame) => !removedIdSet.has(frame.id));
  args.framesRef.current = frames;
  args.setFrames(frames);

  removedIds.forEach((frameId) => {
    args.hostLayoutServiceRef.current.unlink(frameId);
    useFrameUIStore.getState().dismissFrame(frameId);
  });

  if (invalidateOnRemove && removedIds.length > 0) {
    invalidateFrameCache();
  }

  return removedIds;
}

export function createAddAutoBlurFramesHandler(args: CreateAddAutoBlurFramesHandlerArgs) {
  const generateFrameId = createGenerateFrameId();

  return (input: AutoBlurApplyInput) => {
    const addedFrames: FrameData[] = [];
    const borderSettings = resolveDefaultBorderPreset(args.highlighterSettingsCacheRef.current);
    const focusSettings = cloneFocusSettings(args.sessionFocusSettingsRef.current);

    input.targets.forEach((target) => {
      if (hasBlurFrameForRect([...args.framesRef.current, ...addedFrames], target.rect)) {
        return;
      }
      if (!target.element.isConnected) return;

      const frame = createAutoBlurFrame({
        borderSettings,
        blurSettings: input.blurSettings,
        focusSettings,
        generateFrameId,
        target,
      });
      if (!frame.pagePlacement || !frame.linkedElementSelector) return;
      const accepted = args.hostLayoutServiceRef.current.link(
        frame.id,
        target.element,
        frame.linkedElementSelector,
        {
          pagePlacement: frame.pagePlacement,
          rect: { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
        },
        { requireAcceptedInitial: input.allowDeferredInitialPlacement !== true }
      );
      if (!accepted && input.allowDeferredInitialPlacement !== true) return;
      addedFrames.push({
        ...frame,
        ...(accepted?.rect ?? {}),
        pagePlacement: accepted?.pagePlacement ?? frame.pagePlacement,
      });
    });

    if (addedFrames.length > 0) {
      const frames = [...args.framesRef.current, ...addedFrames];
      args.framesRef.current = frames;
      args.setFrames(frames);
    }

    if (addedFrames.length > 0) {
      invalidateFrameCache();
    }

    return {
      addedCount: addedFrames.length,
      skippedCount: input.targets.length - addedFrames.length,
    };
  };
}

export function createClearAutoBlurFramesHandler(
  args: Pick<CreateAddAutoBlurFramesHandlerArgs, 'framesRef' | 'hostLayoutServiceRef' | 'setFrames'>
) {
  return (input: AutoBlurClearInput) => {
    const removedIds = removeAutoBlurFrames(args, (frame) =>
      shouldRemoveAutoBlurFrame(frame, input)
    );

    return { removedCount: removedIds.length };
  };
}

export function createSyncAutoBlurFramesHandler(args: CreateAddAutoBlurFramesHandlerArgs) {
  const addAutoBlurFrames = createAddAutoBlurFramesHandler(args);

  return (input: AutoBlurSyncInput) => {
    const removedIds = removeAutoBlurFrames(
      args,
      (frame) =>
        shouldPruneAutoBlurFrame({
          anchorNode: args.hostLayoutServiceRef.current.getNode(frame.id) ?? undefined,
          frame,
          targets: input.targets,
        }),
      false
    );
    const addResult = addAutoBlurFrames(input);

    if (removedIds.length > 0) {
      invalidateFrameCache();
    }

    return {
      ...addResult,
      removedCount: removedIds.length,
    };
  };
}
