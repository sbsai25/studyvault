import SignatureAnimation from '../brand/SignatureAnimation';
import UploadDropzone from '../library/UploadDropzone';
import styles from './OnboardingHero.module.css';

const STEPS = [
  'Upload lecture notes, slides or readings',
  'Ask questions and get answers drawn from them',
  'Practise with flashcards and fill-in-the-blank exercises',
];

// First-run dashboard: what StudyVault does and where to start
function OnboardingHero() {
  return (
    <section className={styles.hero} aria-labelledby="onboarding-title">
      <div className={styles.copy}>
        <p className={styles.eyebrow}>Get started</p>
        <h2 id="onboarding-title" className={styles.title}>
          Turn your study materials into knowledge
        </h2>
        <p className={styles.lead}>
          Add your first document. StudyVault reads it, answers your questions from it and turns it
          into practice.
        </p>
        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li key={step}>
              <span className={styles.stepNumber} aria-hidden="true">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>
      <div className={styles.visual}>
        <SignatureAnimation />
      </div>
      <UploadDropzone size="compact" title="Drop a file here to begin" className={styles.dropzone} />
    </section>
  );
}

export default OnboardingHero;
