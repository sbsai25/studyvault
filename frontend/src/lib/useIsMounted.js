import { useCallback, useEffect, useRef } from 'react';

// Returns a function telling whether the component is still on screen, for
// long requests whose result should only navigate if the user stayed put.
export function useIsMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return useCallback(() => mounted.current, []);
}
