import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, m } from 'motion/react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { cx } from '../../../lib/cx';
import { toastMotion } from '../../../motion/presets';
import { ToastContext } from './toastContext';
import styles from './Toast.module.css';

const ICONS = { success: CircleCheck, error: CircleAlert, info: Info };
const DURATION = { success: 4500, info: 4500, error: 7000 };
const MAX_TOASTS = 4;

let nextId = 1;

// Brief, announced notifications. They dismiss themselves, pause while
// hovered or focused, and can carry one action.
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const clearTimer = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id) => {
      clearTimer(id);
      setToasts((list) => list.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const schedule = useCallback(
    (id, ms) => {
      clearTimer(id);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), ms)
      );
    },
    [clearTimer, dismiss]
  );

  const show = useCallback(
    (tone, title, options = {}) => {
      const id = nextId++;
      setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { id, tone, title, ...options }]);
      schedule(id, options.duration ?? DURATION[tone]);
      return id;
    },
    [schedule]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo(
    () => ({
      success: (title, options) => show('success', title, options),
      error: (title, options) => show('error', title, options),
      info: (title, options) => show('info', title, options),
      dismiss,
    }),
    [show, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <section className={styles.viewport} aria-label="Notifications">
        <ol className={styles.list}>
          <AnimatePresence initial={false}>
            {toasts.map((toast) => {
              const Icon = ICONS[toast.tone];
              return (
                <m.li
                  key={toast.id}
                  className={cx(styles.toast, styles[toast.tone])}
                  role={toast.tone === 'error' ? 'alert' : 'status'}
                  variants={toastMotion}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  onMouseEnter={() => clearTimer(toast.id)}
                  onMouseLeave={() => schedule(toast.id, 2500)}
                  onFocus={() => clearTimer(toast.id)}
                  onBlur={() => schedule(toast.id, 2500)}
                >
                  <Icon className={styles.icon} size={20} aria-hidden="true" />
                  <div className={styles.content}>
                    <p className={styles.title}>{toast.title}</p>
                    {toast.description && <p className={styles.description}>{toast.description}</p>}
                    {toast.action && (
                      <button
                        type="button"
                        className={styles.action}
                        onClick={() => {
                          toast.action.onClick();
                          dismiss(toast.id);
                        }}
                      >
                        {toast.action.label}
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    className={styles.close}
                    onClick={() => dismiss(toast.id)}
                    aria-label="Dismiss notification"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                </m.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </section>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
