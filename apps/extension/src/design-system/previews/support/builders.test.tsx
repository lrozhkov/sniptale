import { Children, type ReactElement, type ReactNode, isValidElement } from 'react';
import { describe, expect, it } from 'vitest';

import { buildAnnotatableImageSurfaceSharedPreviews } from '../annotatable-image-surface/design-system';
import { buildCompactInspectorControlsSharedPreviews } from '../compact-inspector-controls/design-system';
import { buildEditorChromeSharedPreviews } from '../editor-chrome/design-system';
import { buildGlassSelectSharedPreviews } from '../glass-select/design-system';
import { buildInspectorShellSharedPreviews } from '../inspector-shell/design-system';
import { buildPopupActionButtonSharedPreviews } from '../popup-shell/action-button/design-system';
import { buildPopupFooterSharedPreviews } from '../popup-shell/footer/preview';
import { buildPopupSelectSharedPreviews } from '../popup-shell/select/design-system';

function expectPreviewShapes(
  previews: Array<{
    previewId: string;
    componentId: string;
    variantId: string;
    preview: React.ReactNode;
  }>,
  expectedPreviewIds: string[]
) {
  expect(previews.map((preview) => preview.previewId)).toEqual(expectedPreviewIds);
  expect(previews.every((preview) => isValidElement(preview.preview))).toBe(true);
}

function toElement(node: ReactNode): ReactElement<any> {
  if (!isValidElement(node)) {
    throw new Error('Expected a valid React element');
  }

  return node;
}

function childElements(node: ReactNode): ReactElement<any>[] {
  return Children.toArray(toElement(node).props.children)
    .filter(isValidElement)
    .map((child) => child);
}

function expectElementAt<T>(items: T[], index: number, label: string): T {
  const item = items[index];
  if (!item) {
    throw new Error(`Expected ${label}`);
  }

  return item;
}

function verifiesGlassSelectPreviews() {
  const previews = buildGlassSelectSharedPreviews('ru');

  expectPreviewShapes(previews, [
    'shared.ui.glass-select.default',
    'shared.ui.glass-select.popup-flat',
    'shared.ui.glass-select.portal',
    'shared.ui.glass-select.sm',
    'shared.ui.glass-select.md',
  ]);

  toElement(
    expectElementAt(previews, 0, 'default glass-select preview').preview
  ).props.children.props.onChange();
  expectElementAt(
    childElements(expectElementAt(previews, 2, 'portal glass-select preview').preview),
    0,
    'portal glass-select option'
  ).props.onChange();
  toElement(
    expectElementAt(previews, 3, 'small glass-select preview').preview
  ).props.children.props.onChange();
}

function verifiesEditorChromePreviews() {
  const previews = buildEditorChromeSharedPreviews('en');

  expectPreviewShapes(previews, [
    'shared.ui.editor-chrome.icon-button',
    'shared.ui.editor-chrome.danger-icon-button',
    'shared.ui.editor-chrome.value-badge',
  ]);

  expectElementAt(
    childElements(expectElementAt(previews, 0, 'editor chrome icon preview').preview),
    0,
    'editor chrome icon button'
  ).props.onClick();
  expectElementAt(
    childElements(expectElementAt(previews, 1, 'editor chrome danger preview').preview),
    0,
    'editor chrome danger button'
  ).props.onClick();
}

function verifiesCompactInspectorControlsPreviews() {
  const previews = buildCompactInspectorControlsSharedPreviews('en');

  expectPreviewShapes(previews, [
    'shared.ui.compact-inspector-controls.input',
    'shared.ui.compact-inspector-controls.text-field',
    'shared.ui.compact-inspector-controls.select',
    'shared.ui.compact-inspector-controls.select-field',
    'shared.ui.compact-inspector-controls.range',
    'shared.ui.compact-inspector-controls.panel-header',
    'shared.ui.compact-inspector-controls.numeric-row',
    'shared.ui.compact-inspector-controls.toggle-row',
    'shared.ui.compact-inspector-controls.toggle-grid',
    'shared.ui.compact-inspector-controls.preset-list',
    'shared.ui.compact-inspector-controls.reference-panel',
    'shared.ui.compact-inspector-controls.color-option',
  ]);
}

function verifiesAnnotatableImageSurfacePreviews() {
  const previews = buildAnnotatableImageSurfaceSharedPreviews('ru');

  expectPreviewShapes(previews, [
    'shared.ui.annotatable-image-surface.surface',
    'shared.ui.annotatable-image-surface.toolbar',
  ]);
}

function verifiesInspectorShellPreviews() {
  const previews = buildInspectorShellSharedPreviews('en');

  expectPreviewShapes(previews, [
    'shared.ui.inspector-shell.frame',
    'shared.ui.inspector-shell.panel',
    'shared.ui.inspector-shell.header-action',
  ]);

  const actionRow = expectElementAt(
    childElements(expectElementAt(previews, 2, 'inspector shell header-action preview').preview),
    1,
    'inspector shell action row'
  );
  const headerActions = childElements(actionRow);

  expectElementAt(headerActions, 0, 'first inspector shell action').props.onClick();
  expectElementAt(headerActions, 1, 'second inspector shell action').props.onClick();
}

function verifiesPopupActionButtonPreviews() {
  const previews = buildPopupActionButtonSharedPreviews('ru');

  expectPreviewShapes(previews, [
    'shared.ui.popup-action-button.primary',
    'shared.ui.popup-action-button.secondary',
    'shared.ui.popup-action-button.gallery',
    'shared.ui.popup-action-button.compact',
  ]);

  toElement(
    expectElementAt(previews, 0, 'primary popup action button preview').preview
  ).props.onClick();
  expectElementAt(
    childElements(expectElementAt(previews, 3, 'compact popup action button preview').preview),
    0,
    'compact popup action button'
  ).props.onClick();
}

function verifiesPopupFooterPreviews() {
  const previews = buildPopupFooterSharedPreviews('en');

  expectPreviewShapes(previews, [
    'shared.ui.popup-footer-action.default',
    'shared.ui.popup-footer-action.compact',
    'shared.ui.popup-footer.default',
  ]);

  const footerActions = childElements(
    expectElementAt(previews, 0, 'default footer action preview').preview
  );

  expectElementAt(footerActions, 0, 'default footer primary action').props.onClick();
  expectElementAt(footerActions, 1, 'default footer secondary action').props.onClick();
  toElement(expectElementAt(previews, 1, 'compact footer preview').preview).props.onClick();
  toElement(
    expectElementAt(previews, 2, 'default footer preview').preview
  ).props.onOpenDesignSystem();
  toElement(expectElementAt(previews, 2, 'default footer preview').preview).props.onOpenGithub();
  toElement(expectElementAt(previews, 2, 'default footer preview').preview).props.onOpenSettings();
}

function verifiesPopupSelectPreviews() {
  const previews = buildPopupSelectSharedPreviews('ru');

  expectPreviewShapes(previews, ['shared.ui.popup-select.default']);
  toElement(
    expectElementAt(previews, 0, 'popup select preview').preview
  ).props.children.props.onChange();
}

describe('shared design-system preview builders', () => {
  it(
    'builds localized AnnotatableImageSurface previews from shared preview ownership',
    verifiesAnnotatableImageSurfacePreviews
  );
  it(
    'builds localized GlassSelect previews from shared preview ownership',
    verifiesGlassSelectPreviews
  );
  it(
    'builds localized EditorChrome previews from shared preview ownership',
    verifiesEditorChromePreviews
  );
  it(
    'builds localized CompactInspectorControls previews from shared preview ownership',
    verifiesCompactInspectorControlsPreviews
  );
  it(
    'builds localized InspectorShell previews from shared preview ownership',
    verifiesInspectorShellPreviews
  );
  it(
    'builds localized PopupActionButton previews from shared preview ownership',
    verifiesPopupActionButtonPreviews
  );
  it(
    'builds localized PopupFooter previews from shared preview ownership',
    verifiesPopupFooterPreviews
  );
  it(
    'builds localized PopupSelect previews from shared preview ownership',
    verifiesPopupSelectPreviews
  );
});
