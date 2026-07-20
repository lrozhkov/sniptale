import type {
  BorderPreset,
  FocusSettings,
  FrameData,
} from '../../../../features/highlighter/contracts';
import { createCompositeSelector } from '../../../platform/frame/selectors';
import { getAbsolutePosition } from '../../../platform/frame';
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
import { shouldDropLinkedElement } from '../roots/scroll/linked-elements';
import type { UseFrameMutationActionHelperOptions } from './types';
import { createGenerateFrameId } from './frame-factory';

type CreateAddAutoBlurFramesHandlerArgs = Pick<
  UseFrameMutationActionHelperOptions,
  | 'framesRef'
  | 'linkedElementsRef'
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

function createFrameOffset(target: AutoBlurApplyInput['targets'][number]) {
  const elementPosition = getAbsolutePosition(target.element);
  return {
    x: target.rect.x - elementPosition.x,
    y: target.rect.y - elementPosition.y,
    width: target.rect.width - elementPosition.width,
    height: target.rect.height - elementPosition.height,
  };
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
  return {
    id: args.generateFrameId(),
    createdBy: 'auto-blur',
    x: args.target.rect.x,
    y: args.target.rect.y,
    width: args.target.rect.width,
    height: args.target.rect.height,
    linkedElement: args.target.element,
    linkedElementSelector: createLinkedElementSelector(args.target.element),
    offset: createFrameOffset(args.target),
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
  frame: FrameData;
  linkedElement: HTMLElement | undefined;
  targets: AutoBlurSyncInput['targets'];
}): boolean {
  if (args.frame.createdBy !== 'auto-blur') {
    return false;
  }

  if (!args.linkedElement || shouldDropLinkedElement(args.linkedElement)) {
    return true;
  }

  return !args.targets.some((target) => isFrameOverlappingAutoBlurRect(args.frame, target.rect));
}

function removeAutoBlurFrames(
  args: Pick<CreateAddAutoBlurFramesHandlerArgs, 'linkedElementsRef' | 'setFrames'>,
  shouldRemoveFrame: (frame: FrameData) => boolean,
  invalidateOnRemove = true
): string[] {
  let removedIds: string[] = [];

  args.setFrames((prev) => {
    removedIds = prev.filter(shouldRemoveFrame).map((frame) => frame.id);
    return removedIds.length > 0 ? prev.filter((frame) => !removedIds.includes(frame.id)) : prev;
  });

  removedIds.forEach((frameId) => args.linkedElementsRef.current.delete(frameId));

  if (invalidateOnRemove && removedIds.length > 0) {
    invalidateFrameCache();
  }

  return removedIds;
}

export function createAddAutoBlurFramesHandler(args: CreateAddAutoBlurFramesHandlerArgs) {
  const generateFrameId = createGenerateFrameId();

  return (input: AutoBlurApplyInput) => {
    let addedFrames: FrameData[] = [];

    args.setFrames((prev) => {
      const availableTargets = input.targets.filter(
        (target) => !hasBlurFrameForRect([...prev, ...addedFrames], target.rect)
      );
      const borderSettings = resolveDefaultBorderPreset(args.highlighterSettingsCacheRef.current);
      const focusSettings = cloneFocusSettings(args.sessionFocusSettingsRef.current);

      addedFrames = availableTargets.map((target) =>
        createAutoBlurFrame({
          borderSettings,
          blurSettings: input.blurSettings,
          focusSettings,
          generateFrameId,
          target,
        })
      );

      return addedFrames.length > 0 ? [...prev, ...addedFrames] : prev;
    });

    addedFrames.forEach((frame) => {
      if (frame.linkedElement) {
        args.linkedElementsRef.current.set(frame.id, frame.linkedElement);
      }
    });

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
  args: Pick<CreateAddAutoBlurFramesHandlerArgs, 'linkedElementsRef' | 'setFrames'>
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
          frame,
          linkedElement: args.linkedElementsRef.current.get(frame.id) ?? frame.linkedElement,
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
