import { m } from 'motion/react';
import { cx } from '../../lib/cx';
import { useMotionPreference } from '../../motion/motionPreference';
import styles from './ProgressRing.module.css';

const TONES = {
  primary: 'var(--color-primary)',
  success: 'var(--color-success)',
  warm: 'var(--color-warm)',
};

// A circular progress indicator for a real fraction (0-1). The arc draws in
// once on mount. `label` is the accessible description, e.g. "8 of 10 correct".
function ProgressRing({ value, size = 96, stroke = 8, tone = 'primary', label, className, children }) {
  const { reduced } = useMotionPreference();
  const fraction = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
  const radius = (size - stroke) / 2;
  const center = size / 2;

  return (
    <div
      className={cx(styles.ring, className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-surface-sunken)"
          strokeWidth={stroke}
        />
        {fraction > 0 && (
          <m.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={TONES[tone] ?? TONES.primary}
            strokeWidth={stroke}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
            // pathLength isn't a transform, so reduced motion is handled here
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: fraction }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          />
        )}
      </svg>
      {children && (
        <div className={styles.center} aria-hidden="true">
          {children}
        </div>
      )}
    </div>
  );
}

export default ProgressRing;
