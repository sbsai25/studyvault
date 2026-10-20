import { useEffect, useMemo, useState } from 'react';
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react';
import {
  MotionPreferenceContext,
  applyMotionAttribute,
  readMotionPreference,
  resolveReducedMotion,
  storeMotionPreference,
  systemPrefersReducedMotion,
  watchSystemReducedMotion,
} from './motionPreference';

// Loads Motion's DOM animation features once (components use the light `m.*`
// elements) and applies the viewer's reduced-motion preference to both
// Motion and CSS.
function MotionProvider({ children }) {
  const [preference, setPreferenceState] = useState(readMotionPreference);
  const [systemReduced, setSystemReduced] = useState(systemPrefersReducedMotion);

  useEffect(() => watchSystemReducedMotion(setSystemReduced), []);

  const reduced = resolveReducedMotion(preference, systemReduced);

  useEffect(() => {
    applyMotionAttribute(reduced);
  }, [reduced]);

  const value = useMemo(
    () => ({
      preference,
      reduced,
      systemReduced,
      setPreference: (next) => {
        storeMotionPreference(next);
        setPreferenceState(next);
      },
    }),
    [preference, reduced, systemReduced]
  );

  return (
    <MotionPreferenceContext.Provider value={value}>
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>
      </LazyMotion>
    </MotionPreferenceContext.Provider>
  );
}

export default MotionProvider;
