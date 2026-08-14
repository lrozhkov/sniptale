import '@sniptale/ui/styles/overlays';
import { CommandPalette } from '../../../ui/command-palette';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';
import { translate } from '../../../platform/i18n/popup';
import type { PopupPage } from '../navigation/actions';
import {
  openGallery,
  openGithubRepository,
  openImageEditor,
  openScenarioEditor,
  openSettings,
  openVideoEditor,
} from '../navigation/actions';

const pages: PopupPage[] = ['home', 'video', 'export'];

export function RouteFirstPopupCommandPalette({
  page,
  onClose,
  onNavigate,
}: {
  page: PopupPage | null;
  onClose: () => void;
  onNavigate: (page: PopupPage) => void;
}) {
  const navigationSection = translate('shared.ui.commandPaletteNavigationSection');
  const utilitySection = translate('shared.ui.commandPaletteUtilitySection');
  const labels: Record<PopupPage, string> = {
    home: translate('popup.tabs.home'),
    video: translate('popup.tabs.video'),
    export: translate('popup.tabs.export'),
  };
  const actions: CommandPaletteAction[] = [
    ...pages.map((target) => ({
      id: `popup-page-${target}`,
      title: labels[target],
      subtitle:
        page === target
          ? translate('shared.ui.commandPaletteCurrentPageHint')
          : translate('shared.ui.commandPaletteNavigationHint'),
      section: navigationSection,
      onSelect: () => onNavigate(target),
    })),
    ...[
      ['image-editor', translate('popup.home.imageEditorLabel'), openImageEditor],
      ['scenario-editor', translate('popup.home.scenarioEditorLabel'), openScenarioEditor],
      ['video-editor', translate('popup.video.videoEditorLabel'), openVideoEditor],
      ['gallery', translate('popup.home.galleryLabel'), openGallery],
      ['settings', translate('popup.common.footerSettings'), openSettings],
      ['github', translate('popup.common.footerGithub'), openGithubRepository],
    ].map(([id, title, onSelect]) => ({
      id: `popup-open-${id as string}`,
      title: title as string,
      subtitle: translate('shared.ui.commandPaletteUtilityHint'),
      section: utilitySection,
      onSelect: onSelect as () => void,
    })),
  ];

  return (
    <CommandPalette
      isOpen
      onClose={onClose}
      actions={actions}
      storageKey="sniptale.popup.command-palette"
      dataUi="popup.command-palette"
    />
  );
}
