import { MonitorCog, PanelRight } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { useVideoEditorHeaderController } from '../../runtime/controller/composition/hooks';

export function VideoEditorWorkspaceHeaderActions(props: {
  inspectorOpen: boolean;
  onOpenInspector: () => void;
}) {
  const header = useVideoEditorHeaderController();
  if (!header) return null;
  return (
    <div className="flex shrink-0 items-center gap-1">
      <ContentToolbarButton
        className="!h-9 !w-9 !min-w-9 !px-0"
        dataUi="video-editor.viewer.scene"
        title={translate('videoEditor.sidebar.sceneProperties')}
        onClick={header.onSelectScene}
      >
        <MonitorCog size={17} />
      </ContentToolbarButton>
      {!props.inspectorOpen && (
        <ContentToolbarButton
          className="!h-9 !w-9 !min-w-9 !px-0"
          dataUi="video-editor.viewer.open-inspector"
          title={translate('videoEditor.app.expandInspector')}
          onClick={props.onOpenInspector}
        >
          <PanelRight size={17} />
        </ContentToolbarButton>
      )}
    </div>
  );
}
