import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { isContentEventWithinElement } from '../../platform/dom-host';
import type { ViewportPreset } from '../../../contracts/settings';

function useViewportMenuOutsideClick(
  showMenu: boolean,
  wrapperRef: React.RefObject<HTMLDivElement | null>,
  setShowMenu: React.Dispatch<React.SetStateAction<boolean>>
) {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isContentEventWithinElement(event, wrapperRef.current)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [setShowMenu, showMenu, wrapperRef]);
}

export function useViewportSelectorMenu(props: {
  disabled: boolean;
  onMenuStateChange?: (isOpen: boolean) => void;
  onViewportChange: (
    viewport: {
      presetId: string;
      target: 'viewport' | 'window';
      width: number;
      height: number;
    } | null,
    activationEvent?: Event
  ) => void;
}) {
  const { disabled, onMenuStateChange, onViewportChange } = props;
  const [showMenu, setShowMenu] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onMenuStateChange?.(showMenu);
  }, [onMenuStateChange, showMenu]);

  useViewportMenuOutsideClick(showMenu, wrapperRef, setShowMenu);

  const handleToggleMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    if (!disabled) {
      setShowMenu(!showMenu);
    }
  };

  const handleSelectNative = (event: React.MouseEvent<HTMLButtonElement>) => {
    onViewportChange(null, event.nativeEvent);
    setShowMenu(false);
  };

  const handleSelectPreset = (
    preset: ViewportPreset,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    onViewportChange(
      {
        presetId: preset.id,
        target: preset.target,
        width: preset.width,
        height: preset.height,
      },
      event.nativeEvent
    );
    setShowMenu(false);
  };

  return {
    handleSelectNative,
    handleSelectPreset,
    handleToggleMenu,
    menuRef,
    setShowMenu,
    showMenu,
    wrapperRef,
  };
}
