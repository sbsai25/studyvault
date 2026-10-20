import { m } from 'motion/react';
import { Layers, MessageSquareText, TextCursorInput } from 'lucide-react';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { fadeRise } from '../../motion/presets';
import Logo from '../brand/Logo';
import SignatureAnimation from '../brand/SignatureAnimation';
import styles from './AuthLayout.module.css';

const FEATURES = [
  { icon: MessageSquareText, text: 'Answers drawn from your own documents, with sources' },
  { icon: Layers, text: 'Flashcards scheduled with spaced repetition' },
  { icon: TextCursorInput, text: 'Fill-in-the-blank practice from your material' },
];

// Sign-in and registration layout: a brand panel with the signature
// animation (wide screens only) beside the form.
function AuthLayout({ title, subtitle, footer, children }) {
  useDocumentTitle(title);

  return (
    <div className={styles.layout}>
      <aside className={styles.brandPanel}>
        <Logo size={32} />
        <div className={styles.pitch}>
          <p className={styles.headline}>Your study materials, turned into knowledge.</p>
          <p className={styles.lead}>
            Upload notes, slides and readings. StudyVault answers your questions from them and
            turns them into practice.
          </p>
        </div>
        <SignatureAnimation className={styles.animation} />
        <ul className={styles.features}>
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text}>
              <span className={styles.featureIcon} aria-hidden="true">
                <Icon size={16} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </aside>

      <main className={styles.formPanel}>
        <m.div className={styles.formInner} variants={fadeRise} initial="hidden" animate="show">
          <div className={styles.compactLogo}>
            <Logo size={30} />
          </div>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          {children}
          {footer && <p className={styles.footer}>{footer}</p>}
        </m.div>
      </main>
    </div>
  );
}

export default AuthLayout;
