import { Bold, Italic, Strikethrough, Underline } from 'lucide-react';
import type React from 'react';
import { translate } from '../../../../platform/i18n';
import { ToggleGrid } from '../../../chrome/ui';
import type { TextControlsProps, TextSettings } from './types';

function preventTextboxSelectionLoss(event: React.MouseEvent<HTMLDivElement>): void {
  event.preventDefault();
}

export function renderTextTypographyGrid(props: TextControlsProps, settings: TextSettings) {
  return (
    <div onMouseDown={preventTextboxSelectionLoss}>
      <ToggleGrid
        ariaLabel={translate('editor.compact.typography')}
        options={[
          {
            active: settings.fontWeight === 'bold',
            label: translate('editor.compact.bold'),
            icon: <Bold size={15} strokeWidth={2.2} />,
            onToggle: () => props.applyTextStyle('bold'),
          },
          {
            active: settings.fontStyle === 'italic',
            label: translate('editor.compact.italic'),
            icon: <Italic size={15} strokeWidth={2.2} />,
            onToggle: () => props.applyTextStyle('italic'),
          },
          {
            active: settings.underline,
            label: translate('editor.compact.underline'),
            icon: <Underline size={15} strokeWidth={2.2} />,
            onToggle: () => props.applyTextStyle('underline'),
          },
          {
            active: settings.linethrough,
            label: translate('editor.compact.strikethrough'),
            icon: <Strikethrough size={15} strokeWidth={2.2} />,
            onToggle: () => props.applyTextStyle('linethrough'),
          },
        ]}
      />
    </div>
  );
}
