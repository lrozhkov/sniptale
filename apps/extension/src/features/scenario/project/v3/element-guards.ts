import type { ScenarioElement } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  SCENARIO_ELEMENT_ANIMATIONS,
  SCENARIO_V3_ELEMENT_KINDS,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  isStringEnumValue,
  isStringLiteralValue,
} from '@sniptale/runtime-contracts/validation/string-literals';
import { isScenarioColorToken } from './color-token';
import { isCaptureContext, isPoint } from './element-guards.capture.ts';
import { SCENARIO_V3_LIMITS } from './limits';
import {
  hasScenarioElementBaseFields,
  isBoundedString,
  isFiniteNumber,
  isNumberInRange,
  isRecord,
  isScenarioV3Coordinate,
  isScenarioV3Id,
} from './value-guards';

const TEXT_ALIGNS = ['center', 'left', 'right'] as const;
const IMAGE_FITS = ['contain', 'cover', 'fill', 'original'] as const;
const SHAPES = ['ellipse', 'rect'] as const;
const STROKE_DASHES = ['dashed', 'dotted', 'solid'] as const;
const ARROW_HEADS = ['both', 'end', 'start'] as const;

export function isSupportedScenarioElementKind(value: unknown): value is ScenarioElement['kind'] {
  return isStringEnumValue(value, SCENARIO_V3_ELEMENT_KINDS);
}

export function isScenarioElementV3(value: unknown): value is ScenarioElement {
  if (
    !isRecord(value) ||
    !isElementAnimation(value['animation']) ||
    !isElementBuild(value['build']) ||
    !hasScenarioElementBaseFields(value, isSupportedScenarioElementKind) ||
    !isElementRole(value['role']) ||
    !isFiniteNumber(value['createdAt']) ||
    !isFiniteNumber(value['updatedAt'])
  ) {
    return false;
  }

  switch (value['kind']) {
    case SCENARIO_V3_ELEMENT_KINDS.arrow:
      return isConnector(value) && isEnumValue(value['head'], ARROW_HEADS);
    case SCENARIO_V3_ELEMENT_KINDS.callout:
      return (
        isCalloutConnector(value['connector']) &&
        isPanel(value['panel']) &&
        isBoundedString(value['text'], SCENARIO_V3_LIMITS.maxTextLength)
      );
    case SCENARIO_V3_ELEMENT_KINDS.code:
      return (
        isBoundedString(value['code'], SCENARIO_V3_LIMITS.maxCodeLength) &&
        isBoundedString(value['language'], SCENARIO_V3_LIMITS.maxNameLength) &&
        isCodeStyle(value['style'])
      );
    case SCENARIO_V3_ELEMENT_KINDS.image:
      return isImageElementPayload(value);
    case SCENARIO_V3_ELEMENT_KINDS.line:
      return isConnector(value);
    case SCENARIO_V3_ELEMENT_KINDS.shape:
      return isShapeElementPayload(value);
    case SCENARIO_V3_ELEMENT_KINDS.text:
      return (
        isTextStyle(value['style']) &&
        isBoundedString(value['text'], SCENARIO_V3_LIMITS.maxTextLength)
      );
  }

  return false;
}

function isImageElementPayload(value: Record<string, unknown>): boolean {
  return (
    isAssetRef(value['assetRef']) &&
    isCaptureContext(value['captureContext']) &&
    isContentTransform(value['contentTransform']) &&
    isElementEditDocumentId(value['editDocumentId']) &&
    isEnumValue(value['fit'], IMAGE_FITS)
  );
}

function isShapeElementPayload(value: Record<string, unknown>): boolean {
  return (
    isNumberInRange(value['cornerRadius'], 0, SCENARIO_V3_LIMITS.maxCanvasDimension) &&
    isColorToken(value['fillColor']) &&
    isEnumValue(value['shape'], SHAPES) &&
    isColorToken(value['strokeColor']) &&
    isStrokeWidth(value['strokeWidth'])
  );
}

function isElementBuild(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumberInRange(value['order'], 0, SCENARIO_V3_LIMITS.maxClickCount) &&
    isNumberInRange(value['showAtClick'], 0, SCENARIO_V3_LIMITS.maxClickCount) &&
    (value['hideAtClick'] === null ||
      isNumberInRange(value['hideAtClick'], 0, SCENARIO_V3_LIMITS.maxClickCount))
  );
}

function isElementAnimation(value: unknown): boolean {
  return (
    isRecord(value) &&
    isStringEnumValue(value['preset'], SCENARIO_ELEMENT_ANIMATIONS) &&
    isNumberInRange(value['durationMs'], 0, SCENARIO_V3_LIMITS.maxAnimationDurationMs) &&
    isBoundedString(value['easing'], SCENARIO_V3_LIMITS.maxEasingLength)
  );
}

function isElementRole(value: unknown): boolean {
  return value === null || isBoundedString(value, SCENARIO_V3_LIMITS.maxNameLength);
}

function isElementEditDocumentId(value: unknown): boolean {
  return value === null || isScenarioV3Id(value);
}

function isTextStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isEnumValue(value['align'], TEXT_ALIGNS) &&
    isColorToken(value['color']) &&
    isFontSize(value['fontSize']) &&
    isNumberInRange(value['fontWeight'], 1, 1_000)
  );
}

function isCodeStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    isColorToken(value['backgroundColor']) &&
    isFontSize(value['fontSize']) &&
    isColorToken(value['textColor'])
  );
}

function isPanel(value: unknown): boolean {
  return (
    isRecord(value) &&
    isColorToken(value['backgroundColor']) &&
    isColorToken(value['borderColor']) &&
    isStrokeWidth(value['borderWidth']) &&
    isColorToken(value['textColor'])
  );
}

function isConnector(value: Record<string, unknown>): boolean {
  return (
    isEnumValue(value['dash'], STROKE_DASHES) &&
    isPoint(value['end']) &&
    isPoint(value['start']) &&
    isColorToken(value['strokeColor']) &&
    isStrokeWidth(value['strokeWidth'])
  );
}

function isCalloutConnector(value: unknown): boolean {
  return value === null || (isRecord(value) && isPoint(value['end']) && isPoint(value['start']));
}

function isAssetRef(value: unknown): boolean {
  return (
    isRecord(value) &&
    isBoundedString(value['assetId'], SCENARIO_V3_LIMITS.maxAssetIdLength) &&
    (value['galleryAssetId'] === null ||
      isBoundedString(value['galleryAssetId'], SCENARIO_V3_LIMITS.maxAssetIdLength))
  );
}

function isContentTransform(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNumberInRange(value['scale'], 0.01, 100) &&
    isScenarioV3Coordinate(value['x']) &&
    isScenarioV3Coordinate(value['y'])
  );
}

function isColorToken(value: unknown): value is string {
  return isScenarioColorToken(value);
}

function isFontSize(value: unknown): value is number {
  return isNumberInRange(value, 1, SCENARIO_V3_LIMITS.maxFontSize);
}

function isStrokeWidth(value: unknown): value is number {
  return isNumberInRange(value, 0, SCENARIO_V3_LIMITS.maxStrokeWidth);
}

function isEnumValue<TValue extends string>(
  value: unknown,
  allowedValues: readonly TValue[]
): value is TValue {
  return isStringLiteralValue(value, allowedValues);
}
