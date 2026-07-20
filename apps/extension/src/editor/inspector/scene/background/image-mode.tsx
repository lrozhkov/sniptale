import type React from 'react';

import type { EditorFrameSettings } from '../../../../features/editor/document/types';
import { translate } from '../../../../platform/i18n';
import { SelectField } from '../../../chrome/ui';

type EditorInspectorFrameBackgroundImageModeProps = {
  applyFramePatch: (patch: Partial<EditorFrameSettings>) => void;
  frameBackgroundImageFitOptions: Array<{
    value: EditorFrameSettings['backgroundImageFit'];
    label: string;
  }>;
  frameDraft: EditorFrameSettings;
};

export function EditorInspectorFrameBackgroundImageMode(
  props: EditorInspectorFrameBackgroundImageModeProps
): React.ReactElement {
  const { applyFramePatch, frameBackgroundImageFitOptions, frameDraft } = props;

  return (
    <SelectField
      label={translate('editor.scene.backgroundImageModeAria')}
      options={frameBackgroundImageFitOptions}
      value={frameDraft.backgroundImageFit}
      onChange={(value) => applyFramePatch({ backgroundImageFit: value })}
    />
  );
}
