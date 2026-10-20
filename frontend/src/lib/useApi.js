import { useCallback, useEffect, useEffectEvent, useState } from 'react';

// Loads data with `loader` when the component mounts and whenever `deps`
// change (deps must be plain values such as ids). Returns the last loaded
// data while reloading, so screens can keep showing content instead of a
// skeleton. setData updates the loaded value after a mutation.
export function useApi(loader, deps = []) {
  const [reloadCount, setReloadCount] = useState(0);
  const key = JSON.stringify([...deps, reloadCount]);
  const [result, setResult] = useState({ key: null, data: undefined, error: null });

  const load = useEffectEvent(() => loader());

  useEffect(() => {
    let cancelled = false;
    load().then(
      (data) => {
        if (!cancelled) setResult({ key, data, error: null });
      },
      (error) => {
        if (!cancelled) setResult((prev) => ({ key, data: prev.data, error }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [key]);

  const reload = useCallback(() => setReloadCount((n) => n + 1), []);

  const setData = useCallback((updater) => {
    setResult((prev) => ({
      ...prev,
      data: typeof updater === 'function' ? updater(prev.data) : updater,
    }));
  }, []);

  const loading = result.key !== key;

  return {
    data: result.data,
    error: loading ? null : result.error,
    loading,
    reload,
    setData,
  };
}
