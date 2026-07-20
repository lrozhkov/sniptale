import type React from 'react';
import { useState } from 'react';

import type { EditorFrameSettings } from '../../../features/editor/document/types';
import { translate } from '../../../platform/i18n';
import { NumericRow, NumericValueField, cx } from '../../chrome/ui';
import { TablerIcon } from '../compact/tabler-icon';
import { PanelSection } from './shared';

type FramePaddingSide = keyof Pick<
  EditorFrameSettings,
  'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft'
>;

const FRAME_PADDING_FIELDS: ReadonlyArray<{
  ariaKey:
    | 'editor.scene.scenePaddingTopAria'
    | 'editor.scene.scenePaddingRightAria'
    | 'editor.scene.scenePaddingBottomAria'
    | 'editor.scene.scenePaddingLeftAria';
  key: FramePaddingSide;
  labelKey:
    | 'editor.scene.scenePaddingTopLabel'
    | 'editor.scene.scenePaddingRightLabel'
    | 'editor.scene.scenePaddingBottomLabel'
    | 'editor.scene.scenePaddingLeftLabel';
}> = [
  {
    ariaKey: 'editor.scene.scenePaddingTopAria',
    key: 'paddingTop',
    labelKey: 'editor.scene.scenePaddingTopLabel',
  },
  {
    ariaKey: 'editor.scene.scenePaddingRightAria',
    key: 'paddingRight',
    labelKey: 'editor.scene.scenePaddingRightLabel',
  },
  {
    ariaKey: 'editor.scene.scenePaddingBottomAria',
    key: 'paddingBottom',
    labelKey: 'editor.scene.scenePaddingBottomLabel',
  },
  {
    ariaKey: 'editor.scene.scenePaddingLeftAria',
    key: 'paddingLeft',
    labelKey: 'editor.scene.scenePaddingLeftLabel',
  },
] as const;

const LINKED_PADDING_BUTTON_CLASS_NAME =
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent)_16%,transparent)] ' +
  'text-[color:var(--sniptale-color-accent)]';

function updateFramePaddingSide(
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>,
  side: FramePaddingSide,
  value: number
) {
  setFrameDraft((frameDraft) => ({
    ...frameDraft,
    [side]: Math.max(0, value),
  }));
}

function updateUniformFramePadding(
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>,
  value: number
) {
  setFrameDraft((frameDraft) => {
    const padding = Math.max(0, value);

    return {
      ...frameDraft,
      paddingBottom: padding,
      paddingLeft: padding,
      paddingRight: padding,
      paddingTop: padding,
    };
  });
}

function resolveUniformPaddingValue(frameDraft: EditorFrameSettings): number {
  return frameDraft.paddingTop;
}

function FrameUniformPaddingField(props: {
  frameDraft: EditorFrameSettings;
  linked: boolean;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
  setLinked: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  return (
    <div className="flex items-end gap-2">
      <NumericRow
        label={translate('editor.scene.scenePaddingUniformLabel')}
        value={resolveUniformPaddingValue(props.frameDraft)}
        min={0}
        step={1}
        precision={0}
        unit="px"
        onPreviewValue={(value) => updateUniformFramePadding(props.setFrameDraft, value)}
        onCommitValue={(value) => updateUniformFramePadding(props.setFrameDraft, value)}
        scrub={{ min: 0, max: 512, step: 1 }}
        className="min-w-0 flex-1"
      />
      <button
        type="button"
        aria-label={translate('editor.scene.scenePaddingLinkAria')}
        aria-pressed={props.linked}
        onClick={() => props.setLinked((linked) => !linked)}
        className={cx(
          'grid h-8 w-8 shrink-0 place-items-center rounded-[8px] transition',
          props.linked
            ? LINKED_PADDING_BUTTON_CLASS_NAME
            : 'text-[color:var(--sniptale-color-text-muted)] hover:bg-[var(--sniptale-color-surface-hover)]'
        )}
      >
        <TablerIcon icon={props.linked ? 'tabler:link' : 'tabler:link-off'} size={17} />
      </button>
    </div>
  );
}

export function FramePaddingFields(props: {
  frameDraft: EditorFrameSettings;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
}) {
  const [linked, setLinked] = useState(true);

  return (
    <div className="space-y-3">
      <FrameUniformPaddingField {...props} linked={linked} setLinked={setLinked} />
      {!linked ? (
        <div className="grid grid-cols-4 gap-2">
          {FRAME_PADDING_FIELDS.map((field) => (
            <label key={field.key} className="space-y-1">
              <span
                className={
                  'block truncate text-[12px] font-semibold uppercase ' +
                  'text-[color:var(--sniptale-color-text-secondary)]'
                }
              >
                {translate(field.labelKey)}
              </span>
              <NumericValueField
                label={translate(field.ariaKey)}
                min={0}
                value={props.frameDraft[field.key]}
                step={1}
                precision={0}
                unit="px"
                onPreviewValue={(value) =>
                  updateFramePaddingSide(props.setFrameDraft, field.key, value)
                }
                onCommitValue={(value) =>
                  updateFramePaddingSide(props.setFrameDraft, field.key, value)
                }
                scrub={{ min: 0, max: 512, step: 1 }}
                className="!w-full"
              />
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FramePaddingSection(props: {
  frameDraft: EditorFrameSettings;
  framePaddingSummary?: string;
  setFrameDraft: React.Dispatch<React.SetStateAction<EditorFrameSettings>>;
}) {
  return (
    <PanelSection label={translate('editor.scene.scenePaddingSection')}>
      <FramePaddingFields frameDraft={props.frameDraft} setFrameDraft={props.setFrameDraft} />
    </PanelSection>
  );
}
