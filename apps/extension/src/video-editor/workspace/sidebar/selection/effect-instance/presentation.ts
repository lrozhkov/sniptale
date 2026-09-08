import type { EffectV1Document, ControlDefinition } from '@sniptale/runtime-contracts/effect-v1';
import { translate } from '../../../../../platform/i18n';

/** Presentation only: graph values and behaviour remain owned by the imported document. */
export function getEffectControlSections(document: EffectV1Document) {
  const axes = new Set(
    document.objectLayout?.handles?.flatMap((handle) => [handle.xControl, handle.yControl]) ?? []
  );
  const controls = document.controls.filter((control) => !axes.has(control.id));
  if (!isCallout(document.id)) return [{ label: '', advanced: false, controls }];
  const sections = [
    {
      label: translate('videoEditor.effectsLibrary.objectText'),
      ids: ['title', 'subtitle'],
      advanced: false,
    },
    {
      label: translate('videoEditor.effectsLibrary.objectAppearance'),
      ids: ['accent', 'surface', 'ink', 'font', 'bodyFont'],
      advanced: false,
    },
    {
      label: translate('videoEditor.effectsLibrary.objectAnimation'),
      ids: ['sequence', 'entry', 'traceShare'],
      advanced: false,
    },
    {
      label: translate('videoEditor.effectsLibrary.objectAdvanced'),
      ids: ['spark'],
      advanced: true,
    },
  ];
  const known = new Set(sections.flatMap((section) => section.ids));
  return [
    ...sections.map((section) => ({
      ...section,
      controls: section.ids.flatMap((id) => controls.filter((control) => control.id === id)),
    })),
    { label: '', advanced: false, controls: controls.filter((control) => !known.has(control.id)) },
  ].filter((section) => section.controls.length > 0);
}

export function getEffectSequenceOptions(documentId: string, control: ControlDefinition) {
  if (
    !isCallout(documentId) ||
    control.id !== 'sequence' ||
    control.kind !== 'number' ||
    control.min !== 0 ||
    control.max !== 2 ||
    control.step !== 1
  )
    return null;
  return [
    { value: '0', label: translate('videoEditor.effectsLibrary.lineThenText') },
    { value: '1', label: translate('videoEditor.effectsLibrary.textThenLine') },
    { value: '2', label: translate('videoEditor.effectsLibrary.together') },
  ];
}

function isCallout(id: string) {
  return id === 'sniptale-callout-light' || id === 'sniptale-callout-dark';
}
