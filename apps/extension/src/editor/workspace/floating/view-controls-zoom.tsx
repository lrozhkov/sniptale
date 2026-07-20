import { ZoomIn, ZoomOut } from 'lucide-react';
import { ContentToolbarButton, ContentToolbarGroup } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { getDocumentRequiredTitle } from '../toolbar/section-helpers';

function ZoomPercentButton(props: { hasImage: boolean; zoomPercent: number }) {
  const controller = useEditorController();
  const shouldFitToWindow = props.zoomPercent === 100;
  const nextActionTitle = shouldFitToWindow
    ? translate('editor.toolbar.fitToWindow')
    : translate('editor.toolbar.resetZoomPrefix');
  const title = getDocumentRequiredTitle(
    `${nextActionTitle} · ${translate('editor.toolbar.zoomCurrentPrefix')} ${props.zoomPercent}%`,
    props.hasImage
  );
  const handleClick = () => {
    if (!props.hasImage) {
      return;
    }
    if (shouldFitToWindow) {
      controller.zoomToFit();
      return;
    }
    controller.resetZoom();
  };

  return (
    <ContentToolbarButton
      title={title}
      disabled={!props.hasImage}
      onClick={handleClick}
      dataUi="editor.floating.view-controls.zoom"
    >
      <span className="min-w-11 text-center text-[11px] font-semibold tabular-nums">
        {props.zoomPercent}%
      </span>
    </ContentToolbarButton>
  );
}

export function ViewZoomControls(props: { hasImage: boolean; zoomPercent: number }) {
  const controller = useEditorController();

  return (
    <ContentToolbarGroup className="gap-1.5" dataUi="editor.floating.view-controls.zoom-group">
      <ContentToolbarButton
        title={getDocumentRequiredTitle(translate('editor.toolbar.zoomOut'), props.hasImage)}
        disabled={!props.hasImage}
        onClick={() => controller.zoomOut()}
        dataUi="editor.floating.view-controls.zoom-out"
      >
        <ZoomOut size={15} strokeWidth={2} />
      </ContentToolbarButton>
      <ZoomPercentButton hasImage={props.hasImage} zoomPercent={props.zoomPercent} />
      <ContentToolbarButton
        title={getDocumentRequiredTitle(translate('editor.toolbar.zoomIn'), props.hasImage)}
        disabled={!props.hasImage}
        onClick={() => controller.zoomIn()}
        dataUi="editor.floating.view-controls.zoom-in"
      >
        <ZoomIn size={15} strokeWidth={2} />
      </ContentToolbarButton>
    </ContentToolbarGroup>
  );
}
