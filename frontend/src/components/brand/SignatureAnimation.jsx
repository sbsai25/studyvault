import { useId } from 'react';
import { cx } from '../../lib/cx';
import styles from './SignatureAnimation.module.css';

// StudyVault's signature motif: study documents flow into a glowing core and
// come out as a flashcard, an AI answer and a fill-in-the-blank exercise.
// Pure SVG + CSS keyframes; it plays once (~2.3s) and then stays still. With
// reduced motion it renders the final composition directly.

const DOCUMENTS = [
  { x: 34, y: 54, rotate: -6, delay: 0 },
  { x: 20, y: 126, rotate: 3, delay: 0.1 },
  { x: 44, y: 198, rotate: -2, delay: 0.2 },
];

// Particles travel in a straight line from each document to the core
const PARTICLES = [
  { x: 96, y: 92, delay: 0.6 },
  { x: 82, y: 160, delay: 0.72 },
  { x: 104, y: 230, delay: 0.84 },
];

const CORE = { x: 210, y: 150 };

function DocumentShape() {
  return (
    <>
      <rect width="58" height="74" rx="8" fill="#fff" stroke="#e7e5ef" />
      <path d="M44 0h6a8 8 0 0 1 8 8v6h-8a6 6 0 0 1-6-6z" fill="#f1f0f7" />
      <rect x="10" y="14" width="26" height="4" rx="2" fill="#d9d3fa" />
      <rect x="10" y="27" width="38" height="3.5" rx="1.75" fill="#ebe9f3" />
      <rect x="10" y="37" width="34" height="3.5" rx="1.75" fill="#ebe9f3" />
      <rect x="10" y="47" width="38" height="3.5" rx="1.75" fill="#ebe9f3" />
      <rect x="10" y="57" width="22" height="3.5" rx="1.75" fill="#ebe9f3" />
    </>
  );
}

function SignatureAnimation({ className, label }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids = {
    core: `sv-core-${uid}`,
    glow: `sv-glow-${uid}`,
    shadow: `sv-shadow-${uid}`,
  };

  return (
    <svg
      className={cx(styles.scene, className)}
      viewBox="0 0 420 300"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
      focusable="false"
    >
      <defs>
        <linearGradient id={ids.core} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8b7cf4" />
          <stop offset="1" stopColor="#5443d0" />
        </linearGradient>
        <radialGradient id={ids.glow}>
          <stop offset="0" stopColor="#6d5ce8" stopOpacity="0.38" />
          <stop offset="0.55" stopColor="#6d5ce8" stopOpacity="0.12" />
          <stop offset="1" stopColor="#6d5ce8" stopOpacity="0" />
        </radialGradient>
        <filter id={ids.shadow} x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#25233a" floodOpacity="0.08" />
        </filter>
      </defs>

      {/* Connections from the documents into the core */}
      <g className={styles.linesIn} fill="none" stroke="#d6d3e3" strokeWidth="1.5" strokeDasharray="2 6" strokeLinecap="round">
        <path d="M96 92 Q150 112 182 140" />
        <path d="M82 160 Q138 158 178 152" />
        <path d="M104 230 Q152 204 184 164" />
      </g>

      {/* Connections from the core to the outputs */}
      <g className={styles.linesOut} fill="none" stroke="#c9c1f7" strokeWidth="1.5" strokeLinecap="round">
        <path d="M240 136 Q262 102 282 84" />
        <path d="M244 151 L274 151" />
        <path d="M240 166 Q262 200 282 222" />
      </g>

      {DOCUMENTS.map((doc, i) => (
        <g key={i} transform={`translate(${doc.x} ${doc.y}) rotate(${doc.rotate})`}>
          <g className={styles.document} style={{ animationDelay: `${doc.delay}s` }} filter={`url(#${ids.shadow})`}>
            <DocumentShape />
          </g>
        </g>
      ))}

      {PARTICLES.map((p, i) => (
        <circle
          key={i}
          className={styles.particle}
          cx={p.x}
          cy={p.y}
          r="3.5"
          fill="#6d5ce8"
          style={{
            '--dx': `${CORE.x - p.x}px`,
            '--dy': `${CORE.y - p.y}px`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}

      {/* The core */}
      <circle className={styles.glow} cx={CORE.x} cy={CORE.y} r="78" fill={`url(#${ids.glow})`} />
      <circle className={styles.orbit} cx={CORE.x} cy={CORE.y} r="44" fill="none" stroke="#e4e0fb" strokeWidth="1.5" />
      <g className={styles.core}>
        <circle cx={CORE.x} cy={CORE.y} r="30" fill={`url(#${ids.core})`} />
        <path
          d={`M${CORE.x} ${CORE.y - 13}l3.4 8.6 8.6 3.4-8.6 3.4-3.4 8.6-3.4-8.6-8.6-3.4 8.6-3.4z`}
          fill="#fff"
        />
      </g>

      {/* Output: flashcard */}
      <g transform="translate(286 42) rotate(4)">
        <g className={styles.output} style={{ '--from-x': '-72px', '--from-y': '96px', animationDelay: '1.45s' }} filter={`url(#${ids.shadow})`}>
          <rect width="112" height="70" rx="10" fill="#fff" stroke="#e7e5ef" />
          <rect x="12" y="12" width="24" height="16" rx="8" fill="#f0eefd" />
          <text x="24" y="23.5" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#5b49d6">
            Q
          </text>
          <rect x="12" y="38" width="80" height="5" rx="2.5" fill="#ebe9f3" />
          <rect x="12" y="50" width="56" height="5" rx="2.5" fill="#ebe9f3" />
        </g>
      </g>

      {/* Output: AI answer */}
      <g transform="translate(278 120)">
        <g className={styles.output} style={{ '--from-x': '-64px', '--from-y': '0px', animationDelay: '1.58s' }} filter={`url(#${ids.shadow})`}>
          <rect width="128" height="62" rx="12" fill="#fff" stroke="#e7e5ef" />
          <circle cx="18" cy="18" r="7" fill={`url(#${ids.core})`} />
          <rect x="32" y="15.5" width="78" height="5" rx="2.5" fill="#d9d3fa" />
          <rect x="12" y="33" width="104" height="5" rx="2.5" fill="#ebe9f3" />
          <rect x="12" y="45" width="70" height="5" rx="2.5" fill="#ebe9f3" />
        </g>
      </g>

      {/* Output: fill in the blank */}
      <g transform="translate(286 204) rotate(-3)">
        <g className={styles.output} style={{ '--from-x': '-74px', '--from-y': '-58px', animationDelay: '1.71s' }} filter={`url(#${ids.shadow})`}>
          <rect width="116" height="44" rx="10" fill="#fff" stroke="#e7e5ef" />
          <rect x="12" y="19" width="24" height="5" rx="2.5" fill="#ebe9f3" />
          <rect x="42" y="25" width="32" height="2.5" rx="1.25" fill="#e4a54a" />
          <rect className={styles.caret} x="58" y="12" width="1.6" height="15" rx="0.8" fill="#6d5ce8" />
          <rect x="80" y="19" width="24" height="5" rx="2.5" fill="#ebe9f3" />
        </g>
      </g>
    </svg>
  );
}

export default SignatureAnimation;
