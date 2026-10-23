import { useEffect, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { onServerWaking } from '../../api/client';
import { toastMotion } from '../../motion/presets';
import Spinner from '../ui/Spinner';
import styles from './ServerWakeNotice.module.css';

// Shown while the free API host starts up after sleeping, so a request that
// hangs for up to a minute doesn't look broken
function ServerWakeNotice() {
  const [waking, setWaking] = useState(false);

  useEffect(() => onServerWaking(setWaking), []);

  return (
    <div className={styles.region} role="status" aria-live="polite">
      <AnimatePresence>
        {waking && (
          <m.div
            className={styles.notice}
            variants={toastMotion}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <Spinner size={18} className={styles.spinner} />
            <div>
              <p className={styles.title}>Waking up the server</p>
              <p className={styles.description}>
                The free host sleeps when idle, so this can take up to a minute.
              </p>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ServerWakeNotice;
