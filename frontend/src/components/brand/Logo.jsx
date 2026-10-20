import { useId } from 'react';
import { cx } from '../../lib/cx';
import styles from './Logo.module.css';

// The StudyVault mark: an open book with a small spark, on the brand gradient.
export function LogoMark({ size = 32, className }) {
  // useId output can contain characters that break url(#id) references
  const gradientId = `sv-logo-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8576f2" />
          <stop offset="1" stopColor="#5443d0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradientId})`} />
      <path d="M8 10.4c2.6-1 5.1-.7 7.2.8v11.6c-2.1-1.4-4.6-1.7-7.2-.9z" fill="#fff" fillOpacity="0.96" />
      <path d="M24 10.4c-2.6-1-5.1-.7-7.2.8v11.6c2.1-1.4 4.6-1.7 7.2-.9z" fill="#fff" fillOpacity="0.72" />
      <path d="M24.2 4.6l.75 1.95 1.95.75-1.95.75-.75 1.95-.75-1.95-1.95-.75 1.95-.75z" fill="#f4c27a" />
    </svg>
  );
}

function Logo({ size = 32, showWordmark = true, className }) {
  return (
    <span className={cx(styles.logo, className)}>
      <LogoMark size={size} />
      {showWordmark && <span className={styles.wordmark}>StudyVault</span>}
    </span>
  );
}

export default Logo;
