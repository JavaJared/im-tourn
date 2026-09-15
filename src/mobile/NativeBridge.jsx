import { useEffect } from 'react';
import { isNativeApp } from './platform';

export function handleNativeBack({ canGoBack }, { document, history, minimize }) {
  // Existing dialogs already trap focus and handle Escape, including busy states.
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  } else if (canGoBack) {
    history.back();
  } else {
    // Keep the app alive at its root rather than losing unsaved local state.
    minimize();
  }
}

export default function NativeBridge() {
  useEffect(() => {
    if (!isNativeApp()) return;
    document.documentElement.classList.add('native-app');
    let disposed = false;
    let listener;
    import('@capacitor/app').then(async ({ App }) => {
      const handle = await App.addListener('backButton', event => handleNativeBack(event, {
        document, history: window.history, minimize: () => App.minimizeApp(),
      }));
      if (disposed) await handle.remove();
      else listener = handle;
    }).catch(error => console.error('Native back button setup failed', error));
    return () => {
      disposed = true;
      listener?.remove();
      document.documentElement.classList.remove('native-app');
    };
  }, []);
  return null;
}
