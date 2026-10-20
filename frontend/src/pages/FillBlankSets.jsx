import { useState } from 'react';
import { m } from 'motion/react';
import { Plus, TextCursorInput } from 'lucide-react';
import { deleteFillBlankSet, getFillBlankSets } from '../api/client';
import { getErrorMessage } from '../lib/errors';
import { useApi } from '../lib/useApi';
import { fadeRise, stagger } from '../motion/presets';
import AttemptsDialog from '../components/fillBlanks/AttemptsDialog';
import ExerciseCard from '../components/fillBlanks/ExerciseCard';
import Page from '../components/layout/Page';
import CreateFromDocumentDialog from '../components/library/CreateFromDocumentDialog';
import { useStudyTools } from '../components/library/useStudyTools';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import NumberField from '../components/ui/NumberField';
import PageHeader from '../components/ui/PageHeader';
import { Skeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/confirm/confirmContext';
import { useToast } from '../components/ui/toast/toastContext';
import styles from './FillBlankSets.module.css';

// The API accepts 3-20 sentences per exercise, 10 by default
const MIN_QUESTIONS = 3;
const MAX_QUESTIONS = 20;

function FillBlankSets() {
  const exercises = useApi(getFillBlankSets, []);
  const { pending, createFillBlanks } = useStudyTools();
  const confirm = useConfirm();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [questionCount, setQuestionCount] = useState(10);
  const [attemptsFor, setAttemptsFor] = useState(null);
  const [attemptsOpen, setAttemptsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (exercise) => {
    const ok = await confirm({
      title: `Delete ${exercise.title}?`,
      description: 'Its sentences and all attempts at it are deleted too. This can’t be undone.',
      confirmLabel: 'Delete exercise',
      tone: 'danger',
    });
    if (!ok) return;
    setDeletingId(exercise.id);
    try {
      await deleteFillBlankSet(exercise.id);
      exercises.setData((list = []) => list.filter((e) => e.id !== exercise.id));
      toast.success(`Deleted ${exercise.title}`);
    } catch (error) {
      toast.error(`Couldn't delete ${exercise.title}`, { description: getErrorMessage(error) });
    } finally {
      setDeletingId(null);
    }
  };

  const showAttempts = (exercise) => {
    setAttemptsFor(exercise);
    setAttemptsOpen(true);
  };

  let content;
  if (exercises.data === undefined && exercises.loading) {
    content = (
      <div className={styles.grid} aria-busy="true">
        <span className="sr-only">Loading your exercises</span>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className={styles.skeleton} aria-hidden="true">
            <Skeleton width={40} height={40} radius={12} />
            <Skeleton width="70%" height={16} />
            <Skeleton width="50%" height={12} />
            <Skeleton width={100} height={32} radius={8} />
          </div>
        ))}
      </div>
    );
  } else if (exercises.data === undefined && exercises.error) {
    content = <ErrorState message={getErrorMessage(exercises.error)} onRetry={exercises.reload} />;
  } else if (exercises.data.length === 0) {
    content = (
      <EmptyState
        icon={TextCursorInput}
        title="No exercises yet"
        description="Create one from a document: StudyVault picks key sentences and blanks out an important word or phrase in each for you to recall."
      >
        <Button icon={Plus} onClick={() => setCreateOpen(true)}>
          Create exercise
        </Button>
      </EmptyState>
    );
  } else {
    content = (
      <m.ul className={styles.grid} variants={stagger(0.05)} initial="hidden" animate="show">
        {exercises.data.map((exercise) => (
          <m.li key={exercise.id} variants={fadeRise}>
            <ExerciseCard
              exercise={exercise}
              deleting={deletingId === exercise.id}
              onShowAttempts={() => showAttempts(exercise)}
              onDelete={() => handleDelete(exercise)}
            />
          </m.li>
        ))}
      </m.ul>
    );
  }

  return (
    <Page title="Fill in the Blanks">
      <PageHeader
        title="Fill in the Blanks"
        description="Practise recalling key terms. Each sentence from your documents has one word or phrase missing."
        actions={
          exercises.data?.length > 0 && (
            <Button icon={Plus} onClick={() => setCreateOpen(true)}>
              Create exercise
            </Button>
          )
        }
      />
      {content}
      <CreateFromDocumentDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        tool="fill-blanks"
        pending={pending?.tool === 'fill-blanks' ? pending : null}
        onCreate={(document) => createFillBlanks(document, questionCount)}
        renderOptions={({ disabled }) => (
          <NumberField
            label="Number of sentences"
            hint={`Between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}.`}
            value={questionCount}
            min={MIN_QUESTIONS}
            max={MAX_QUESTIONS}
            onChange={setQuestionCount}
            disabled={disabled}
          />
        )}
      />
      <AttemptsDialog open={attemptsOpen} exercise={attemptsFor} onClose={() => setAttemptsOpen(false)} />
    </Page>
  );
}

export default FillBlankSets;
