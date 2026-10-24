import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PictureInPicture2 } from 'lucide-react';
import { translate } from '../../platform/i18n';
import { CameraWindowButton } from './button';

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow(options: { width: number; height: number }): Promise<Window>;
    };
  }
}

/** Keeps one React surface alive while its DOM moves into an always-on-top window. */
export function FloatingRecordingWindow({ children }: { children: ReactNode }) {
  const [container] = useState(() => {
    const element = document.createElement('div');
    element.dataset['recordingSurface'] = '';
    return element;
  });
  const dock = useRef<HTMLDivElement>(null);
  const pip = useRef<Window | null>(null);
  const floatButton = useRef<HTMLButtonElement>(null);
  const opening = useRef(false);
  const active = useRef(true);
  const [floating, setFloating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);

  useLayoutEffect(() => {
    dock.current?.append(container);
    return () => container.remove();
  }, [container]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pip.current?.close();
      pip.current = null;
    };
  }, []);

  const open = () => {
    if (opening.current || pip.current) return;
    const api = window.documentPictureInPicture;
    if (!api) return;
    opening.current = true;
    setPending(true);
    setError(false);
    // requestWindow must run in this user gesture, before any asynchronous work.
    void api
      .requestWindow({ width: 480, height: 640 })
      .then((next) => {
        if (!active.current || next.closed) {
          next.close();
          return;
        }
        pip.current = next;
        next.document.title = document.title;
        next.document.documentElement.className = document.documentElement.className;
        for (const attribute of ['data-theme', 'lang', 'dir']) {
          const value = document.documentElement.getAttribute(attribute);
          if (value !== null) next.document.documentElement.setAttribute(attribute, value);
        }
        next.document.documentElement.style.cssText = document.documentElement.style.cssText;
        document.querySelectorAll('link[rel="stylesheet"], style').forEach((sheet) => {
          next.document.head.append(sheet.cloneNode(true));
        });
        next.document.body.style.margin = '0';
        next.document.body.append(container);
        container.dispatchEvent(new Event('sniptale-recording-surface-change'));
        setFloating(true);
        next.addEventListener(
          'pagehide',
          () => {
            if (pip.current !== next) return;
            pip.current = null;
            if (active.current) {
              dock.current?.append(container);
              container.dispatchEvent(new Event('sniptale-recording-surface-change'));
              floatButton.current?.focus({ preventScroll: true });
              setFloating(false);
            }
          },
          { once: true }
        );
      })
      .catch(() => {
        if (active.current) setError(true);
      })
      .finally(() => {
        opening.current = false;
        if (active.current) setPending(false);
      });
  };

  return (
    <>
      <div ref={dock} />
      {floating ? (
        <p className="p-3 text-sm text-[var(--sniptale-color-text-secondary)]">
          {translate('popup.video.teleprompterFloatingHint')}
        </p>
      ) : null}
      {createPortal(
        <div
          className={[
            'flex h-screen min-h-0 flex-col bg-[var(--sniptale-color-surface-canvas)]',
            'text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
        >
          <div className="shrink-0 p-3 pb-0">
            <CameraWindowButton
              ref={floatButton}
              icon={PictureInPicture2}
              label={translate(
                floating ? 'popup.video.teleprompterDock' : 'popup.video.teleprompterFloat'
              )}
              disabled={pending || (!floating && !window.documentPictureInPicture)}
              onClick={() => (floating ? pip.current?.close() : open())}
            />
            {!window.documentPictureInPicture ? (
              <p role="status" className="my-2 text-sm">
                {translate('popup.video.teleprompterUnsupported')}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="my-2 text-sm">
                {translate('popup.video.teleprompterFloatError')}
              </p>
            ) : null}
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </div>,
        container
      )}
    </>
  );
}
