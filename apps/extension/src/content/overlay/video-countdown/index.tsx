// Компонент обратного отсчета перед записью видео

import React, { useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { appendToContentOverlayRoot } from '../../platform/dom-host';
import { applyIsolatedContentRootStyle } from '../../platform/dom-host/isolated';
import { translate } from '../../../platform/i18n';
import { getContentRuntimeServices } from '../../application/runtime-services/services';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

interface VideoCountdownProps {
  seconds: number;
  onComplete: () => void;
}

const VIDEO_COUNTDOWN_PULSE_CLASS_NAME = [
  'absolute inset-0 rounded-[24px] opacity-40 animate-ping',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_82%,transparent)]',
].join(' ');

const VIDEO_COUNTDOWN_CARD_CLASS_NAME = [
  'relative flex min-w-[280px] items-center gap-4 rounded-[24px] border',
  'border-[var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-panel)]',
  'px-5 py-4 shadow-[var(--sniptale-shadow-sm)]',
].join(' ');

const VIDEO_COUNTDOWN_NUMBER_CLASS_NAME = [
  'inline-flex h-20 w-20 items-center justify-center rounded-[20px] border',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-accent)_18%,transparent)]',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-accent-soft)_82%,var(--sniptale-color-surface-panel)_18%)]',
  'text-5xl font-bold tabular-nums text-[var(--sniptale-color-accent)]',
].join(' ');

const VIDEO_COUNTDOWN_LABEL_CLASS_NAME = [
  'text-xs font-semibold uppercase tracking-wider',
  'text-[var(--sniptale-color-text-dim)]',
].join(' ');

const VIDEO_COUNTDOWN_TITLE_CLASS_NAME = [
  'mt-1 text-lg font-semibold leading-tight text-[var(--sniptale-color-text-primary-strong)]',
].join(' ');

const VIDEO_COUNTDOWN_HINT_CLASS_NAME = [
  'mt-1 text-sm leading-6 text-[var(--sniptale-color-text-secondary)]',
].join(' ');

const VIDEO_COUNTDOWN_ROOT_CLASS_NAME = [
  'fixed inset-0 z-[99999] flex items-center justify-center',
  'bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_72%,transparent)]',
].join(' ');

const VideoCountdown: React.FC<VideoCountdownProps> = ({ seconds, onComplete }) => {
  const [count, setCount] = useState(seconds);

  useEffect(() => {
    if (count <= 0) {
      onComplete();
      return;
    }

    const timer = setTimeout(() => {
      setCount(count - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [count, onComplete]);

  return (
    <div className={VIDEO_COUNTDOWN_ROOT_CLASS_NAME}>
      <div className="relative">
        <div className={VIDEO_COUNTDOWN_PULSE_CLASS_NAME} />

        <div className={VIDEO_COUNTDOWN_CARD_CLASS_NAME}>
          <span className={VIDEO_COUNTDOWN_NUMBER_CLASS_NAME}>{count}</span>
          <div className="min-w-0">
            <div className={VIDEO_COUNTDOWN_LABEL_CLASS_NAME}>
              {translate('popup.labels.statusCountdown')}
            </div>
            <div className={VIDEO_COUNTDOWN_TITLE_CLASS_NAME}>
              {translate('content.interactiveFrame.countdownPrefix')}
            </div>
            <div className={VIDEO_COUNTDOWN_HINT_CLASS_NAME}>
              {translate('content.interactiveFrame.countdownSuffix')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

let activeRoot: Root | null = null;
let activeContainer: HTMLDivElement | null = null;
let activeToken = 0;

function notifyCountdownComplete(sessionId?: string): void {
  if (!sessionId) {
    return;
  }

  void getContentRuntimeServices()
    .messaging.sendRuntimeMessage({
      type: VideoMessageType.COUNTDOWN_COMPLETE,
      sessionId,
    })
    .catch(() => {});
}

function createCountdownContainer(): HTMLDivElement {
  const container = document.createElement('div');
  container.id = 'video-countdown-container';
  applyIsolatedContentRootStyle(
    container,
    `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 99999;
    `
  );
  appendToContentOverlayRoot(container);
  return container;
}

function teardownCountdown(): void {
  activeRoot?.unmount();
  activeRoot = null;

  activeContainer?.remove();
  activeContainer = null;
}

export function hideVideoCountdown(): void {
  activeToken += 1;
  teardownCountdown();
}

// Функция для создания и отображения countdown
export function showVideoCountdown(seconds: number, sessionId?: string): void {
  hideVideoCountdown();

  const localToken = activeToken;

  if (seconds <= 0) {
    window.setTimeout(() => {
      if (localToken !== activeToken) {
        return;
      }

      notifyCountdownComplete(sessionId);
    }, 0);
    return;
  }
  activeContainer = createCountdownContainer();

  activeRoot = createRoot(activeContainer);

  const handleComplete = () => {
    if (localToken !== activeToken) {
      return;
    }

    teardownCountdown();
    notifyCountdownComplete(sessionId);
  };

  activeRoot.render(<VideoCountdown seconds={seconds} onComplete={handleComplete} />);
}
