import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { m } from 'motion/react';
import { ArrowLeft, ArrowRight, Eye } from 'lucide-react';
import { reviewFlashcard } from '../../api/client';
import { formatRelative } from '../../lib/dates';
import { getErrorMessage } from '../../lib/errors';
import { EASE_OUT } from '../../motion/presets';
import Button from '../ui/Button';
import ProgressBar from '../ui/ProgressBar';
import { useToast } from '../ui/toast/toastContext';
import Flashcard from './Flashcard';
import RatingControls from './RatingControls';
import SessionComplete from './SessionComplete';
import { RATINGS, ratingLabel } from './ratings';
import styles from './StudySession.module.css';

// Index of the next card without a rating, after `from` and then wrapping
// around; -1 when every card is rated
function nextUnrated(cards, ratings, from) {
  for (let step = 1; step <= cards.length; step += 1) {
    const index = (from + step) % cards.length;
    if (!ratings[cards[index].id]) return index;
  }
  return -1;
}

const isTyping = (target) =>
  target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'));

// One pass through a set of cards. Flipping is only animation state; a
// rating is saved once per card per session, guarded against double clicks
// and held keys, and the card then moves on immediately.
function StudySession({ cards, onRestart }) {
  const toast = useToast();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [direction, setDirection] = useState(1);
  // cardId -> { rating, nextReviewAt } for cards rated in this session
  const [ratings, setRatings] = useState({});
  const [submitting, setSubmitting] = useState(null);
  const [finished, setFinished] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const saving = useRef(false);

  const card = cards[index];
  const cardRating = ratings[card.id];
  const ratedCount = Object.keys(ratings).length;

  const goTo = (next) => {
    if (next < 0 || next >= cards.length || next === index) return;
    setDirection(next > index ? 1 : -1);
    setIndex(next);
    setFlipped(false);
  };

  const flip = () => setFlipped((value) => !value);

  const rate = async (rating) => {
    if (saving.current || !flipped || ratings[card.id]) return;
    saving.current = true;
    setSubmitting(rating);
    try {
      const progress = await reviewFlashcard(card.id, rating);
      const saved = { rating, nextReviewAt: progress?.next_review_at ?? null };
      const updated = { ...ratings, [card.id]: saved };
      setRatings(updated);
      setLastSaved(saved);
      const next = nextUnrated(cards, updated, index);
      if (next === -1) setFinished(true);
      else goTo(next);
    } catch (error) {
      toast.error("Couldn't save your rating", { description: getErrorMessage(error) });
    } finally {
      saving.current = false;
      setSubmitting(null);
    }
  };

  const onKeyDown = useEffectEvent((event) => {
    if (finished || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isTyping(event.target)) return;
    const onControl = event.target instanceof HTMLElement && Boolean(event.target.closest('button, a'));

    if (event.key === ' ' || event.key === 'Enter') {
      // Buttons (including the card itself) already handle Space and Enter
      if (onControl) return;
      event.preventDefault();
      if (!event.repeat) flip();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      goTo(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      goTo(index - 1);
    } else if (!event.repeat) {
      const rating = RATINGS.find((r) => r.key === event.key);
      if (rating && flipped && !cardRating) {
        event.preventDefault();
        rate(rating.value);
      }
    }
  });

  useEffect(() => {
    const listener = (event) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (finished) {
    return <SessionComplete ratings={ratings} total={cards.length} onRestart={onRestart} />;
  }

  return (
    <div className={styles.session}>
      <div className={styles.progress}>
        <div className={styles.progressText}>
          <span className={styles.position}>
            Card {index + 1} of {cards.length}
          </span>
          {lastSaved && (
            <span className={styles.saved}>
              Last rating saved: {ratingLabel(lastSaved.rating)}
              {lastSaved.nextReviewAt && ` · back ${formatRelative(lastSaved.nextReviewAt)}`}
            </span>
          )}
        </div>
        <ProgressBar
          value={(ratedCount / cards.length) * 100}
          label={`${ratedCount} of ${cards.length} cards rated`}
          size="sm"
        />
      </div>

      <m.div
        key={card.id}
        className={styles.cardWrap}
        initial={{ opacity: 0, x: 28 * direction }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.28, ease: EASE_OUT }}
      >
        <Flashcard question={card.question} answer={card.answer} flipped={flipped} onFlip={flip} />
      </m.div>

      <div className={styles.response} aria-live="polite">
        {cardRating ? (
          <p className={styles.rated}>
            You rated this card <strong>{ratingLabel(cardRating.rating)}</strong>
            {cardRating.nextReviewAt && ` · it comes back ${formatRelative(cardRating.nextReviewAt)}`}
          </p>
        ) : flipped ? (
          <>
            <p className={styles.prompt}>How well did you know it?</p>
            <RatingControls onRate={rate} submitting={submitting} />
          </>
        ) : (
          <Button size="lg" icon={Eye} onClick={flip}>
            Reveal answer
          </Button>
        )}
      </div>

      <div className={styles.nav}>
        <Button variant="ghost" icon={ArrowLeft} onClick={() => goTo(index - 1)} disabled={index === 0}>
          Previous
        </Button>
        <p className={styles.shortcuts}>
          <kbd>Space</kbd> flip · <kbd>1</kbd>–<kbd>4</kbd> rate · <kbd>←</kbd> <kbd>→</kbd> move
        </p>
        <Button
          variant="ghost"
          iconRight={ArrowRight}
          onClick={() => goTo(index + 1)}
          disabled={index === cards.length - 1}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export default StudySession;
