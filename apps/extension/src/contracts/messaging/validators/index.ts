import type { MessageTypeWithString } from '../contracts/types';
import {
  hasOptionalField,
  hasRequiredField,
  isBoolean,
  isMessageWithType,
  isRecord,
  isString,
} from './primitives';

export {
  hasOptionalField,
  hasRequiredField,
  isBoolean,
  isClipboardTextWithinLimit,
  isImageDataUrl,
  isMessageWithType,
  isNullable,
  isNumber,
  isRecord,
  isString,
} from './primitives';
export { isCaptureActionType, isQuickActionOverlay, isShowToastPayload } from './ui';
export { isPageStyleCurrentPageRuleSummary, isPageStyleInspectorTab } from './page-style';
export {
  isCaptureMode,
  isProjectExportInputReference,
  isRecordingStateHealth,
  isRecordingTelemetrySnapshot,
  isCaptureSource,
  isSize2d,
  isVideoExportCapabilities,
  isVideoProject,
  isVideoProjectExportSettings,
  isVideoRecordingRuntimeState,
  isVideoRecordingSettings,
  isVideoViewportPresetSelection,
  isViewportInfo,
  isViewportRegion,
  isWebcamActualSettings,
} from '../video/validators';
export { isLiveVideoRecordingSettingsPatch } from '../video/validators.live-settings';

function validateFieldSet(args: {
  allowedFields: ReadonlySet<string>;
  input: Record<string, unknown>;
  required?: Record<string, (value: unknown) => boolean>;
  optional?: Record<string, (value: unknown) => boolean>;
}) {
  for (const key of Object.keys(args.input)) {
    if (!args.allowedFields.has(key)) {
      return false;
    }
  }

  for (const [key, validator] of Object.entries(args.required ?? {})) {
    if (!hasRequiredField(args.input, key, validator)) {
      return false;
    }
  }

  for (const [key, validator] of Object.entries(args.optional ?? {})) {
    if (!hasOptionalField(args.input, key, validator)) {
      return false;
    }
  }

  return true;
}

function createAllowedFieldSet(
  baseFields: readonly string[],
  required?: Record<string, (value: unknown) => boolean>,
  optional?: Record<string, (value: unknown) => boolean>
): ReadonlySet<string> {
  return new Set([...baseFields, ...Object.keys(required ?? {}), ...Object.keys(optional ?? {})]);
}

export function createMessageGuard<
  TType extends MessageTypeWithString,
  TMessage extends { type: TType },
>(args: {
  type: TType;
  required?: Record<string, (value: unknown) => boolean>;
  optional?: Record<string, (value: unknown) => boolean>;
}): (input: unknown) => input is TMessage {
  return (input): input is TMessage => {
    if (!isMessageWithType(input, args.type)) {
      return false;
    }

    return validateFieldSet({
      allowedFields: createAllowedFieldSet(['type'], args.required, args.optional),
      input,
      ...(args.required === undefined ? {} : { required: args.required }),
      ...(args.optional === undefined ? {} : { optional: args.optional }),
    });
  };
}

export function createRuntimeResponseGuard<TResponse>(
  args: {
    allowUndefined?: boolean;
    required?: Record<string, (value: unknown) => boolean>;
    optional?: Record<string, (value: unknown) => boolean>;
  } = {}
): (input: unknown) => input is TResponse {
  return (input): input is TResponse => {
    if (input === undefined) {
      return args.allowUndefined === true;
    }

    if (!isRecord(input)) {
      return false;
    }

    if (!hasOptionalField(input, 'success', isBoolean)) {
      return false;
    }

    if (!hasOptionalField(input, 'error', isString)) {
      return false;
    }

    return validateFieldSet({
      allowedFields: createAllowedFieldSet(['success', 'error'], args.required, args.optional),
      input,
      ...(args.required === undefined ? {} : { required: args.required }),
      ...(args.optional === undefined ? {} : { optional: args.optional }),
    });
  };
}
