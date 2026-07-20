import { translate } from '../../../platform/i18n';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { AnnotatableImageSurface } from '@sniptale/ui/annotatable-image-surface';
import { useWorkspacePreviewAsset } from './preview-asset';
import { WorkspacePreviewSvg } from './preview-svg';

export function ScenarioWorkspacePreview(props: { step: ScenarioCaptureStep }) {
  const assetState = useWorkspacePreviewAsset(props.step);

  if (assetState.hasLoadError) {
    return (
      <AnnotatableImageSurface className="flex h-[420px] w-[720px] items-center justify-center px-6">
        <p
          role="alert"
          className="max-w-[420px] text-center text-sm font-medium text-[var(--sniptale-color-text-muted)]"
        >
          {translate('scenario.editor.workspacePreviewLoadError')}
        </p>
      </AnnotatableImageSurface>
    );
  }

  return (
    <AnnotatableImageSurface className="h-[420px] w-[720px]">
      <WorkspacePreviewSvg
        assetDataUrl={assetState.dataUrl}
        assetDimensions={assetState.dimensions}
        step={props.step}
      />
    </AnnotatableImageSurface>
  );
}
