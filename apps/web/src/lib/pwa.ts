import { useSyncExternalStore } from 'react';

// Chrome and Edge on Android/desktop fire "beforeinstallprompt" when the app can be installed.
// Keep the event so the user menu can offer "Install app" at a moment of the user's choosing.
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

// ---------------------------------------------------------------- updates
// The service worker (vite-plugin-pwa, autoUpdate) installs a new version in the background and
// takes control straight away, but an open page keeps running the old code until it reloads.
// Announce the update instead of reloading by itself: a field officer may be halfway through a form.

const UPDATE_CHECK_MS = 60 * 60 * 1000;
let updateReady = false;
const updateListeners = new Set<() => void>();

export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || import.meta.env.DEV) return;
  // On a first install the new service worker takes control of a page that had none: that is
  // not an update. Every later change of controller is.
  let controlled = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    updateReady = true;
    updateListeners.forEach((l) => l());
  });

  const register = async () => {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
    if (!registration) return;
    let lastCheck = Date.now();
    const check = () => {
      if (!navigator.onLine) return;
      lastCheck = Date.now();
      registration.update().catch(() => {});
    };
    window.setInterval(check, UPDATE_CHECK_MS);
    // Timers pause while a phone app is in the background: check again when it comes back.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck > UPDATE_CHECK_MS) check();
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}

/** True once a new version has taken over and the page should be reloaded to use it. */
export function useUpdateReady() {
  return useSyncExternalStore(
    (cb) => {
      updateListeners.add(cb);
      return () => updateListeners.delete(cb);
    },
    () => updateReady,
  );
}

export function useInstallPrompt() {
  const available = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => deferred !== null,
  );
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    notify();
  };
  return { available, install };
}
