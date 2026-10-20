import { LogoMark } from '../brand/Logo';
import Spinner from '../ui/Spinner';
import styles from './SplashScreen.module.css';

// Shown while the saved session is checked on start-up
function SplashScreen() {
  return (
    <div className={styles.splash}>
      <LogoMark size={44} />
      <Spinner size={20} label="Loading StudyVault" className={styles.spinner} />
    </div>
  );
}

export default SplashScreen;
