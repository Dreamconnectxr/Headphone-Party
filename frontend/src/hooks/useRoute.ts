import { useEffect, useState } from 'react';

type RouteSnapshot = {
  pathname: string;
  search: string;
};

const buildSnapshot = (): RouteSnapshot => ({
  pathname: window.location.pathname,
  search: window.location.search,
});

export function useRoute(): RouteSnapshot {
  const [snapshot, setSnapshot] = useState<RouteSnapshot>(buildSnapshot);

  useEffect(() => {
    const handler = () => setSnapshot(buildSnapshot());
    const wrapHistory = (method: typeof history.pushState) =>
      function wrapped(this: History, ...args: Parameters<typeof history.pushState>) {
        const result = method.apply(this, args);
        handler();
        return result;
      };

    const originalPush = history.pushState;
    const originalReplace = history.replaceState;
    history.pushState = wrapHistory(history.pushState);
    history.replaceState = wrapHistory(history.replaceState);
    window.addEventListener('popstate', handler);
    return () => {
      history.pushState = originalPush;
      history.replaceState = originalReplace;
      window.removeEventListener('popstate', handler);
    };
  }, []);

  return snapshot;
}
