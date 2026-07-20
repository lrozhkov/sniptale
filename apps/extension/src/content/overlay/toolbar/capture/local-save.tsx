import { AlertCircle, Check, LoaderCircle, Save, TriangleAlert } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import {
  usePagePreparationLocalSave,
  type PagePreparationLocalSaveStatus,
} from '../../../parser/page-preparation/local-save/hook';

const LOCAL_SAVE_ICONS: Record<PagePreparationLocalSaveStatus, LucideIcon> = {
  error: AlertCircle,
  idle: Save,
  saved: Check,
  saving: LoaderCircle,
  warning: TriangleAlert,
};

export function ToolbarLocalSaveControl() {
  const saveState = usePagePreparationLocalSave();
  if (!saveState.visible) {
    return null;
  }

  const Icon = LOCAL_SAVE_ICONS[saveState.status];

  return (
    <ContentToolbarButton
      type="button"
      dataUi="content.toolbar.local-html-save-button"
      data-status={saveState.status}
      title={saveState.title}
      aria-label={saveState.title}
      disabled={saveState.disabled}
      onClick={() => {
        void saveState.onSave();
      }}
    >
      <Icon size={18} strokeWidth={2} />
    </ContentToolbarButton>
  );
}
