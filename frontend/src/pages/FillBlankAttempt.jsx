import { useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { m } from 'motion/react';
import { RotateCcw, TextCursorInput } from 'lucide-react';
import { getFillBlankAttempt, getFillBlankSet } from '../api/client';
import { formatLongDate, formatRelative } from '../lib/dates';
import { getErrorMessage, isNotFound } from '../lib/errors';
import { useApi } from '../lib/useApi';
import { fadeRise, stagger } from '../motion/presets';
import ResultItem from '../components/fillBlanks/ResultItem';
import Page from '../components/layout/Page';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import PageHeader from '../components/ui/PageHeader';
import ProgressRing from '../components/ui/ProgressRing';
import SegmentedControl from '../components/ui/SegmentedControl';
import Spinner from '../components/ui/Spinner';
import styles from './FillBlankAttempt.module.css';

function headlineFor(percentage) {
  if (percentage === 100) return 'Perfect score';
  if (percentage >= 80) return 'Great work';
  if (percentage >= 50) return 'Good effort';
  return 'Keep practising';
}

// Review of one submitted attempt. Right after submitting, the response is
// passed in navigation state; the attempt is still fetched from the API.
function FillBlankAttempt() {
  const { attemptId } = useParams();
  const location = useLocation();
  const fromState =
    location.state?.attempt?.attempt_id === Number(attemptId) ? location.state.attempt : undefined;
  const attempt = useApi(() => getFillBlankAttempt(attemptId), [attemptId]);
  const data = attempt.data ?? fromState;
  const setId = data?.fill_blank_set_id ?? null;
  const exercise = useApi(() => (setId ? getFillBlankSet(setId) : Promise.resolve(null)), [setId]);
  const title = exercise.data?.title ?? location.state?.title;
  const [filter, setFilter] = useState('all');

  if (!data) {
    return (
      <Page title="Results" width="narrow">
        {attempt.error ? (
          isNotFound(attempt.error) ? (
            <EmptyState icon={TextCursorInput} titleAs="h1" title="Attempt not found" description="It may have been deleted with its exercise.">
              <Button to="/fill-blanks">All exercises</Button>
            </EmptyState>
          ) : (
            <ErrorState titleAs="h1" message={getErrorMessage(attempt.error)} onRetry={attempt.reload} />
          )
        ) : (
          <div className={styles.loading}>
            <Spinner size={22} label="Loading your results" />
          </div>
        )}
      </Page>
    );
  }

  const incorrect = data.results.filter((r) => !r.is_correct);
  const shown = filter === 'incorrect' ? incorrect : data.results;
  const percentage = Math.round(data.percentage);

  return (
    <Page title="Results">
      <PageHeader
        back={{ to: '/fill-blanks', label: 'All exercises' }}
        eyebrow={title ?? 'Fill in the Blanks'}
        title="Results"
      />

      <m.div className={styles.layout} variants={stagger(0.08)} initial="hidden" animate="show">
        <m.section className={styles.score} variants={fadeRise} aria-labelledby="score-heading">
          <ProgressRing
            value={data.percentage / 100}
            size={128}
            stroke={10}
            tone={percentage >= 80 ? 'success' : 'primary'}
            label={`${data.score} of ${data.total} correct, ${percentage} percent`}
          >
            <span className={styles.percent}>{percentage}%</span>
          </ProgressRing>
          <div className={styles.scoreText}>
            <h2 id="score-heading" className={styles.headline}>
              {headlineFor(percentage)}
            </h2>
            <p className={styles.fraction}>
              {data.score} of {data.total} correct
            </p>
            <p className={styles.when}>
              <time dateTime={data.completed_at} title={formatLongDate(data.completed_at)}>
                Submitted {formatRelative(data.completed_at)}
              </time>
            </p>
            <div className={styles.actions}>
              <Button icon={RotateCcw} to={`/fill-blanks/${data.fill_blank_set_id}`}>
                Try again
              </Button>
              <Button variant="secondary" to="/fill-blanks">
                All exercises
              </Button>
            </div>
          </div>
        </m.section>

        <m.section variants={fadeRise} aria-labelledby="answers-heading">
          <div className={styles.answersHeader}>
            <h2 id="answers-heading" className={styles.answersTitle}>
              Your answers
            </h2>
            {incorrect.length > 0 && incorrect.length < data.results.length && (
              <SegmentedControl
                label="Show"
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'All', count: data.results.length },
                  { value: 'incorrect', label: 'To review', count: incorrect.length },
                ]}
              />
            )}
          </div>
          <m.ol className={styles.results} variants={stagger(0.04)} initial="hidden" animate="show" key={filter}>
            {shown.map((result) => (
              <m.li key={result.question_id} variants={fadeRise}>
                <ResultItem result={result} number={data.results.indexOf(result) + 1} />
              </m.li>
            ))}
          </m.ol>
        </m.section>
      </m.div>
    </Page>
  );
}

export default FillBlankAttempt;
