import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Monitor, Moon, Sparkles, Sun, Waves } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { formatLongDate } from '../lib/dates';
import { useMotionPreference } from '../motion/motionPreference';
import { useThemePreference } from '../theme/themePreference';
import Page from '../components/layout/Page';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import SegmentedControl from '../components/ui/SegmentedControl';
import styles from './Settings.module.css';

const THEME_OPTIONS = [
  { value: 'system', label: 'Match device', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
];

const MOTION_OPTIONS = [
  { value: 'system', label: 'Match device', icon: Monitor },
  { value: 'reduced', label: 'Reduce motion', icon: Waves },
  { value: 'full', label: 'Full motion', icon: Sparkles },
];

function Settings() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { preference, reduced, systemReduced, setPreference } = useMotionPreference();
  const theme = useThemePreference();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    await logout();
    navigate('/login', { replace: true });
  };

  const motionSummary =
    preference === 'system'
      ? systemReduced
        ? 'Your device asks for reduced motion, so animations are kept to a minimum.'
        : 'Your device allows motion, so StudyVault animates transitions and study cards.'
      : reduced
        ? 'Animations are kept to a minimum on this device.'
        : 'Transitions and study cards animate on this device, whatever the device setting.';

  const themeSummary =
    theme.preference === 'system'
      ? `Your device is set to ${theme.systemDark ? 'dark' : 'light'} mode, so StudyVault is ${theme.theme} too.`
      : `StudyVault stays ${theme.theme} on this device, whatever the device setting.`;

  return (
    <Page title="Settings" width="narrow">
      <PageHeader title="Settings" description="Your account and how StudyVault behaves on this device." />

      <div className={styles.sections}>
        <section className={styles.section} aria-labelledby="account-title">
          <h2 id="account-title" className={styles.sectionTitle}>
            Account
          </h2>
          <dl className={styles.details}>
            <div className={styles.row}>
              <dt>Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div className={styles.row}>
              <dt>Member since</dt>
              <dd>{formatLongDate(user?.created_at)}</dd>
            </div>
          </dl>
          <p className={styles.note}>
            Changing your email or password and deleting your account aren’t available in StudyVault yet.
          </p>
        </section>

        <section className={styles.section} aria-labelledby="theme-title">
          <h2 id="theme-title" className={styles.sectionTitle}>
            Appearance
          </h2>
          <p className={styles.sectionText}>
            Choose a light or dark theme. This is saved in this browser only.
          </p>
          <SegmentedControl label="Theme" options={THEME_OPTIONS} value={theme.preference} onChange={theme.setPreference} />
          <p className={styles.status} role="status">
            {themeSummary}
          </p>
        </section>

        <section className={styles.section} aria-labelledby="motion-title">
          <h2 id="motion-title" className={styles.sectionTitle}>
            Motion
          </h2>
          <p className={styles.sectionText}>
            Choose how much StudyVault animates. This is saved in this browser only.
          </p>
          <SegmentedControl label="Motion" options={MOTION_OPTIONS} value={preference} onChange={setPreference} />
          <p className={styles.status} role="status">
            {motionSummary}
          </p>
        </section>

        <section className={styles.section} aria-labelledby="session-title">
          <h2 id="session-title" className={styles.sectionTitle}>
            Session
          </h2>
          <p className={styles.sectionText}>Sign out of StudyVault in this browser.</p>
          <Button variant="secondary" icon={LogOut} loading={signingOut} onClick={signOut} className={styles.signOut}>
            Sign out
          </Button>
        </section>
      </div>
    </Page>
  );
}

export default Settings;
