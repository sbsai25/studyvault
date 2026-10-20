import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { m } from 'motion/react';
import { ArrowLeft, ArrowRight, Lightbulb, ListChecks, PencilLine, Send, TextCursorInput } from 'lucide-react';
import { getFillBlankSet, submitFillBlanks } from '../api/client';
import { cx } from '../lib/cx';
import { getErrorMessage, isNotFound } from '../lib/errors';
import { useApi } from '../lib/useApi';
import { EASE_OUT } from '../motion/presets';
import BlankSentence from '../components/fillBlanks/BlankSentence';
import { splitSentence } from '../components/fillBlanks/blanks';
import Page from '../components/layout/Page';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import PageHeader from '../components/ui/PageHeader';
import ProgressBar from '../components/ui/ProgressBar';
import { Skeleton } from '../components/ui/Skeleton';
import { useConfirm } from '../components/ui/confirm/confirmContext';
import { useToast } from '../components/ui/toast/toastContext';
import styles from './FillBlankExercise.module.css';

function ReviewStep({ questions, answers, onEdit }) {
  return (
    <ol className={styles.review}>
      {questions.map((question, i) => {
        const [before, after] = splitSentence(question.sentence);
        const answer = answers[question.id]?.trim();
        return (
          <li key={question.id} className={styles.reviewItem}>
            <span className={styles.reviewNumber}>{i + 1}</span>
            <p className={styles.reviewSentence}>
              {before}
              <span className={cx(styles.reviewAnswer, !answer && styles.reviewEmpty)}>{answer || 'blank'}</span>
              {after}
            </p>
            <Button variant="ghost" size="sm" icon={PencilLine} onClick={() => onEdit(i)} aria-label={`Edit sentence ${i + 1}`}>
              Edit
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

// Works through an exercise one sentence at a time, then a review step.
// Answers stay on this page until submitted; grading happens on the server.
function ExerciseRunner({ exercise }) {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const questions = exercise.questions;
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState({});
  const [hintsShown, setHintsShown] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  const reviewing = index === questions.length;
  const question = questions[index];
  const answeredCount = questions.filter((q) => answers[q.id]?.trim()).length;
  const unanswered = questions.length - answeredCount;

  // Put the cursor in the blank whenever a sentence opens
  useEffect(() => {
    if (!reviewing) inputRef.current?.focus({ preventScroll: true });
  }, [index, reviewing]);

  const goTo = (next) => {
    const clamped = Math.max(0, Math.min(questions.length, next));
    if (clamped === index) return;
    setDirection(clamped > index ? 1 : -1);
    setIndex(clamped);
  };

  const submit = async () => {
    if (submitting) return;
    if (unanswered > 0) {
      const ok = await confirm({
        title: `Submit with ${unanswered} blank${unanswered === 1 ? '' : 's'} left?`,
        description: 'Sentences you leave empty count as incorrect.',
        confirmLabel: 'Submit anyway',
        cancelLabel: 'Keep answering',
      });
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const payload = questions
        .filter((q) => answers[q.id]?.trim())
        .map((q) => ({ question_id: q.id, answer: answers[q.id].trim() }));
      const attempt = await submitFillBlanks(exercise.id, payload);
      navigate(`/fill-blanks/attempts/${attempt.attempt_id}`, {
        replace: true,
        state: { attempt, title: exercise.title },
      });
    } catch (error) {
      toast.error("Couldn't submit your answers", { description: getErrorMessage(error) });
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.runner}>
      <div className={styles.progress}>
        <div className={styles.progressText}>
          <span className={styles.position}>
            {reviewing ? 'Review your answers' : `Sentence ${index + 1} of ${questions.length}`}
          </span>
          <span className={styles.answered}>
            {answeredCount} of {questions.length} answered
          </span>
        </div>
        <ProgressBar value={(answeredCount / questions.length) * 100} label="Sentences answered" size="sm" />
        <ol className={styles.steps} aria-label="Sentences">
          {questions.map((q, i) => {
            const answered = Boolean(answers[q.id]?.trim());
            return (
              <li key={q.id}>
                <button
                  type="button"
                  className={cx(styles.step, answered && styles.stepDone, i === index && styles.stepCurrent)}
                  aria-label={`Sentence ${i + 1}${answered ? ', answered' : ''}`}
                  aria-current={i === index ? 'step' : undefined}
                  onClick={() => goTo(i)}
                />
              </li>
            );
          })}
          <li>
            <button
              type="button"
              className={cx(styles.reviewStep, reviewing && styles.stepCurrent)}
              aria-current={reviewing ? 'step' : undefined}
              onClick={() => goTo(questions.length)}
            >
              <ListChecks size={14} aria-hidden="true" />
              Review
            </button>
          </li>
        </ol>
      </div>

      {reviewing ? (
        <m.div
          className={styles.panel}
          initial={{ opacity: 0, x: 24 * direction }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.26, ease: EASE_OUT }}
        >
          {unanswered > 0 ? (
            <p className={styles.notice} role="status">
              {unanswered} sentence{unanswered === 1 ? ' is' : 's are'} still blank and will count as incorrect.
            </p>
          ) : (
            <p className={styles.ready} role="status">
              Every sentence has an answer. Submit when you’re ready.
            </p>
          )}
          <ReviewStep questions={questions} answers={answers} onEdit={goTo} />
        </m.div>
      ) : (
        <m.div
          key={question.id}
          className={cx(styles.panel, styles.sentenceCard)}
          initial={{ opacity: 0, x: 24 * direction }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.26, ease: EASE_OUT }}
        >
          <p className={styles.instruction}>Type the missing word or phrase</p>
          <BlankSentence
            sentence={question.sentence}
            value={answers[question.id] ?? ''}
            onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            onEnter={() => goTo(index + 1)}
            inputRef={inputRef}
            label={`Answer for sentence ${index + 1}`}
          />
          {question.hint &&
            (hintsShown[question.id] ? (
              <p className={styles.hint}>
                <Lightbulb size={16} aria-hidden="true" />
                {question.hint}
              </p>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                icon={Lightbulb}
                className={styles.hintButton}
                onClick={() => setHintsShown((current) => ({ ...current, [question.id]: true }))}
              >
                Show hint
              </Button>
            ))}
        </m.div>
      )}

      <div className={styles.nav}>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => goTo(index - 1)} disabled={index === 0}>
          Back
        </Button>
        {reviewing ? (
          <Button size="lg" icon={Send} loading={submitting} onClick={submit}>
            {submitting ? 'Checking…' : 'Submit answers'}
          </Button>
        ) : (
          <Button iconRight={ArrowRight} onClick={() => goTo(index + 1)} variant={index === questions.length - 1 ? 'primary' : 'secondary'}>
            {index === questions.length - 1 ? 'Review answers' : 'Next'}
          </Button>
        )}
      </div>
    </div>
  );
}

function FillBlankExercise() {
  const { setId } = useParams();
  const exercise = useApi(() => getFillBlankSet(setId), [setId]);
  const data = exercise.data;

  let content;
  if (data === undefined && exercise.loading) {
    content = (
      <div className={styles.runner} aria-busy="true">
        <span className="sr-only">Loading the exercise</span>
        <Skeleton height={6} radius={3} />
        <Skeleton height={220} radius={24} />
      </div>
    );
  } else if (data === undefined && exercise.error) {
    content = isNotFound(exercise.error) ? (
      <EmptyState icon={TextCursorInput} title="Exercise not found" description="It may have been deleted.">
        <Button to="/fill-blanks">All exercises</Button>
      </EmptyState>
    ) : (
      <ErrorState message={getErrorMessage(exercise.error)} onRetry={exercise.reload} />
    );
  } else if (data.questions.length === 0) {
    content = (
      <EmptyState icon={TextCursorInput} title="This exercise has no sentences" description="Try creating a new exercise from the document.">
        <Button to="/fill-blanks">All exercises</Button>
      </EmptyState>
    );
  } else {
    content = <ExerciseRunner key={data.id} exercise={data} />;
  }

  return (
    <Page title={data?.title ?? 'Fill in the Blanks'}>
      <PageHeader
        back={{ to: '/fill-blanks', label: 'All exercises' }}
        title={data?.title ?? 'Fill in the Blanks'}
        description={data ? `${data.questions.length} sentences · answers are checked when you submit` : undefined}
      />
      {content}
    </Page>
  );
}

export default FillBlankExercise;
