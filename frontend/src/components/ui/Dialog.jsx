import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, m } from 'motion/react';
import { X } from 'lucide-react';
import { cx } from '../../lib/cx';
import { overlay, scaleIn, sheetLeft } from '../../motion/presets';
import IconButton from './IconButton';
import styles from './Dialog.module.css';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Keeps Tab and Shift+Tab inside the dialog
function trapFocus(event, container) {
  const items = [...container.querySelectorAll(FOCUSABLE)];
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function DialogPanel({ onClose, title, description, hideTitle, size, variant, initialFocusRef, footer, className, children }) {
  const panelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const panel = panelRef.current;
    const target = initialFocusRef?.current ?? panel?.querySelector(FOCUSABLE) ?? panel;
    target?.focus({ preventScroll: true });

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus({ preventScroll: true });
    };
  }, [initialFocusRef]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    } else if (event.key === 'Tab' && panelRef.current) {
      trapFocus(event, panelRef.current);
    }
  };

  const isSheet = variant === 'sheet';

  return (
    <div className={cx(styles.root, isSheet && styles.sheetRoot)} onKeyDown={onKeyDown}>
      <m.div
        className={styles.overlay}
        variants={overlay}
        initial="hidden"
        animate="show"
        exit="exit"
        onClick={onClose}
        aria-hidden="true"
      />
      <m.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(styles.panel, styles[size], isSheet && styles.sheet, className)}
        variants={isSheet ? sheetLeft : scaleIn}
        initial="hidden"
        animate="show"
        exit="exit"
      >
        <div className={cx(styles.header, hideTitle && styles.headerBare)}>
          <div className={hideTitle ? 'sr-only' : styles.headings}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className={styles.description}>
                {description}
              </p>
            )}
          </div>
          <IconButton icon={X} label="Close" size="sm" onClick={onClose} className={styles.close} />
        </div>
        {children && <div className={styles.body}>{children}</div>}
        {footer && <div className={styles.footer}>{footer}</div>}
      </m.div>
    </div>
  );
}

// An accessible modal: traps focus, closes on Escape or a click outside, locks
// page scrolling and returns focus to where it was. variant: center | sheet
function Dialog({ open, size = 'md', variant = 'center', ...props }) {
  return createPortal(
    <AnimatePresence>{open && <DialogPanel key="dialog" size={size} variant={variant} {...props} />}</AnimatePresence>,
    document.body
  );
}

export default Dialog;
