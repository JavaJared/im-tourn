import { Capacitor } from '@capacitor/core';

export const isNativeApp = () => Capacitor.isNativePlatform();

// An installed app's localhost origin is not a shareable website address.
export function publicOrigin() {
  return isNativeApp() ? 'https://imtourn.com' : window.location.origin;
}
