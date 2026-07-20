import type React from 'react';
import { translate } from '../../../../../../platform/i18n';
import { ProductDropdownDivider, ProductDropdownItem } from '@sniptale/ui/product-menus/dropdown';
import { ContentStrokeIcon } from '../../../../icons/icons';
import { blurPromptIfFocused, createTemplateMenuClickHandler } from '../helpers';
import type { TemplateMenuItemsProps } from '../types';

function stopTemplateMenuEvent(event: React.MouseEvent) {
  event.stopPropagation();
  blurPromptIfFocused();
}

function EditTemplateIcon() {
  return (
    <ContentStrokeIcon size={13} strokeWidth="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </ContentStrokeIcon>
  );
}

function DeleteTemplateIcon() {
  return (
    <ContentStrokeIcon size={13} strokeWidth="2">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </ContentStrokeIcon>
  );
}

export function TemplateMenuActionItems({
  isLoading,
  onDelete,
  onEdit,
  template,
}: TemplateMenuItemsProps) {
  return (
    <>
      <ProductDropdownItem
        onClick={createTemplateMenuClickHandler(onEdit, template)}
        onMouseDown={stopTemplateMenuEvent}
        disabled={isLoading}
      >
        <EditTemplateIcon />
        {translate('common.actions.edit')}
      </ProductDropdownItem>

      <ProductDropdownDivider />

      <ProductDropdownItem
        onClick={createTemplateMenuClickHandler(onDelete, template)}
        onMouseDown={stopTemplateMenuEvent}
        disabled={isLoading}
        danger
      >
        <DeleteTemplateIcon />
        {translate('common.actions.delete')}
      </ProductDropdownItem>
    </>
  );
}
