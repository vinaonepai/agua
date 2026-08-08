const RELOAD_STORAGE_KEY = 'agua-plus-app-version-reload';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

const currentAppVersion = import.meta.env.VITE_APP_VERSION;

const clearBrowserCaches = async () => {
  if (!('caches' in window)) {
    return;
  }

  const cacheNames = await window.caches.keys();
  await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
};

const fetchPublishedVersion = async () => {
  const response = await fetch(`/app-version.json?t=${Date.now()}`, {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return typeof payload?.version === 'string' ? payload.version : null;
};

const reloadWithVersion = async (publishedVersion) => {
  if (sessionStorage.getItem(RELOAD_STORAGE_KEY) === publishedVersion) {
    return false;
  }

  sessionStorage.setItem(RELOAD_STORAGE_KEY, publishedVersion);
  await clearBrowserCaches();

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('app_v', publishedVersion);
  window.location.replace(nextUrl.toString());
  return true;
};

export const checkForAppUpdate = async () => {
  try {
    const publishedVersion = await fetchPublishedVersion();

    if (!publishedVersion) {
      return false;
    }

    if (publishedVersion !== currentAppVersion) {
      return reloadWithVersion(publishedVersion);
    }

    sessionStorage.removeItem(RELOAD_STORAGE_KEY);
    return false;
  } catch {
    return false;
  }
};

export const startAppVersionMonitor = () => {
  window.setInterval(checkForAppUpdate, CHECK_INTERVAL_MS);
  window.addEventListener('focus', () => checkForAppUpdate());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForAppUpdate();
    }
  });
};
