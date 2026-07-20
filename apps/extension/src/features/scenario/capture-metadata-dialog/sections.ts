import { translate } from '../../../platform/i18n';
import type {
  ScenarioCaptureMetadata,
  ScenarioPageDescriptor,
  ScenarioPoint,
  ScenarioRect,
  ScenarioTargetDescriptor,
} from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioCaptureMetadataView, ScenarioMetadataSection } from './types';

function formatPoint(point: ScenarioPoint | null): string {
  return point
    ? `${Math.round(point.x)} × ${Math.round(point.y)}`
    : translate('scenario.common.metadata.empty');
}

function formatRect(rect: ScenarioRect | null | undefined): string {
  return rect
    ? `${Math.round(rect.x)}, ${Math.round(rect.y)} • ${Math.round(rect.width)} × ${Math.round(rect.height)}`
    : translate('scenario.common.metadata.empty');
}

function formatPageScroll(page: ScenarioPageDescriptor): string {
  return `${Math.round(page.scrollX)} × ${Math.round(page.scrollY)}`;
}

function formatSourceKind(sourceKind: ScenarioCaptureMetadataView['sourceKind']): string {
  return sourceKind === 'auto-click'
    ? translate('scenario.common.metadata.values.sourceAutoClick')
    : translate('scenario.common.metadata.values.sourceManual');
}

function formatCaptureSurface(
  captureSurface: ScenarioCaptureMetadataView['captureSurface']
): string {
  if (captureSurface === 'full') {
    return translate('scenario.common.metadata.values.surfaceFull');
  }
  if (captureSurface === 'selection') {
    return translate('scenario.common.metadata.values.surfaceSelection');
  }
  return translate('scenario.common.metadata.values.surfaceVisible');
}

function formatTrigger(trigger: ScenarioCaptureMetadata['trigger']): string {
  return trigger === 'keyboard-enter'
    ? translate('scenario.common.metadata.values.triggerKeyboardEnter')
    : translate('scenario.common.metadata.values.triggerPointerUp');
}

function formatPointerDistance(distance: number | null): string {
  return distance === null
    ? translate('scenario.common.metadata.empty')
    : `${Math.round(distance)} px`;
}

function formatDuration(durationMs: number | null): string {
  return durationMs === null
    ? translate('scenario.common.metadata.empty')
    : `${Math.round(durationMs)} ms`;
}

function buildTargetSection(target: ScenarioTargetDescriptor | null): ScenarioMetadataSection {
  return {
    title: translate('scenario.common.metadata.groups.target'),
    items: [
      {
        label: translate('scenario.common.metadata.fields.selector'),
        value: target?.selector ?? translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.iframeSelector'),
        value: target?.iframeSelector ?? translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.tagName'),
        value: target?.tagName ?? translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.role'),
        value: target?.role ?? translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.text'),
        value: target?.text ?? translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.ariaLabel'),
        value: target?.ariaLabel ?? translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.title'),
        value: target?.title ?? translate('scenario.common.metadata.empty'),
      },
      { label: translate('scenario.common.metadata.fields.rect'), value: formatRect(target?.rect) },
    ],
  };
}

function buildPageSection(page: ScenarioPageDescriptor): ScenarioMetadataSection {
  return {
    title: translate('scenario.common.metadata.groups.page'),
    items: [
      {
        label: translate('scenario.common.metadata.fields.pageTitle'),
        value: page.title ?? translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.url'),
        value: page.url ?? translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.viewport'),
        value: formatRect(page.viewport),
      },
      {
        label: translate('scenario.common.metadata.fields.pageScroll'),
        value: formatPageScroll(page),
      },
      {
        label: translate('scenario.common.metadata.fields.devicePixelRatio'),
        value: page.devicePixelRatio.toFixed(2),
      },
    ],
  };
}

function buildCaptureSection(view: ScenarioCaptureMetadataView): ScenarioMetadataSection {
  return {
    title: translate('scenario.common.metadata.groups.capture'),
    items: [
      {
        label: translate('scenario.common.metadata.fields.captureSurface'),
        value: formatCaptureSurface(view.captureSurface),
      },
      {
        label: translate('scenario.common.metadata.fields.sourceKind'),
        value: formatSourceKind(view.sourceKind),
      },
      {
        label: translate('scenario.common.metadata.fields.trigger'),
        value: formatTrigger(view.captureMetadata.trigger),
      },
      {
        label: translate('scenario.common.metadata.fields.interactionPoint'),
        value: formatPoint(view.interactionPoint),
      },
      {
        label: translate('scenario.common.metadata.fields.cursorPoint'),
        value: formatPoint(view.cursorPoint),
      },
    ],
  };
}

function buildPointerSection(metadata: ScenarioCaptureMetadata): ScenarioMetadataSection {
  const pointerRange = metadata.pointerRange;
  return {
    title: translate('scenario.common.metadata.groups.pointer'),
    items: [
      {
        label: translate('scenario.common.metadata.fields.start'),
        value: formatPoint(pointerRange?.start ?? null),
      },
      {
        label: translate('scenario.common.metadata.fields.end'),
        value: formatPoint(pointerRange?.end ?? null),
      },
      {
        label: translate('scenario.common.metadata.fields.distance'),
        value: formatPointerDistance(pointerRange?.distance ?? null),
      },
      {
        label: translate('scenario.common.metadata.fields.duration'),
        value: formatDuration(pointerRange?.durationMs ?? null),
      },
      {
        label: translate('scenario.common.metadata.fields.bounds'),
        value: pointerRange
          ? [
              `${Math.round(pointerRange.minX)}, ${Math.round(pointerRange.minY)}`,
              `${Math.round(pointerRange.maxX)} × ${Math.round(pointerRange.maxY)}`,
            ].join(' • ')
          : translate('scenario.common.metadata.empty'),
      },
    ],
  };
}

function buildScrollSection(metadata: ScenarioCaptureMetadata): ScenarioMetadataSection {
  const scroll = metadata.scroll;
  return {
    title: translate('scenario.common.metadata.groups.scroll'),
    items: [
      {
        label: translate('scenario.common.metadata.fields.start'),
        value: scroll
          ? `${Math.round(scroll.startX)} × ${Math.round(scroll.startY)}`
          : translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.end'),
        value: scroll
          ? `${Math.round(scroll.endX)} × ${Math.round(scroll.endY)}`
          : translate('scenario.common.metadata.empty'),
      },
      {
        label: translate('scenario.common.metadata.fields.delta'),
        value: scroll
          ? `${Math.round(scroll.deltaX)} × ${Math.round(scroll.deltaY)}`
          : translate('scenario.common.metadata.empty'),
      },
    ],
  };
}

export function buildMetadataSections(
  view: ScenarioCaptureMetadataView
): ScenarioMetadataSection[] {
  return [
    buildTargetSection(view.target),
    buildPageSection(view.page),
    buildCaptureSection(view),
    buildPointerSection(view.captureMetadata),
    buildScrollSection(view.captureMetadata),
  ];
}
