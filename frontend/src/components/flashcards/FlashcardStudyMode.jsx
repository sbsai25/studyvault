import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getFlashcardSet, reviewFlashcard } from '../../api/client';
import Flashcard from './Flashcard';
import FlashcardControls from './FlashcardControls';
import FlashcardProgressBar from './FlashcardProgressBar';

const EMPTY_STATS = { again: 0, hard: 0, good: 0, easy: 0 };

function FlashcardStudyMode() {
  const { setId } = useParams();
  const navigate = useNavigate();

  const [flashcardSet, setFlashcardSet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stats, setStats] = useState(EMPTY_STATS);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getFlashcardSet(setId);
        if (!cancelled) setFlashcardSet(data);
      } catch (err) {
        console.error('Failed to load flashcard set', err);
        if (!cancelled) setError('Could not load this flashcard set.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [setId]);

  const resetSession = () => {
    setCurrentIndex(0);
    setFlipped(false);
    setStats(EMPTY_STATS);
    setIsComplete(false);
  };

  const handleFlip = () => setFlipped((f) => !f);

  const handleRate = async (difficulty) => {
    if (!flashcardSet || isSubmitting) return;
    const card = flashcardSet.cards[currentIndex];
    setIsSubmitting(true);
    try {
      await reviewFlashcard(card.id, difficulty);
      setStats((prev) => ({ ...prev, [difficulty]: prev[difficulty] + 1 }));

      setTimeout(() => {
        setIsSubmitting(false);
        setFlipped(false);
        if (currentIndex + 1 >= flashcardSet.cards.length) {
          setIsComplete(true);
        } else {
          setCurrentIndex((i) => i + 1);
        }
      }, 400);
    } catch (err) {
      console.error('Failed to save review', err);
      alert('Failed to save your review. Please try again.');
      setIsSubmitting(false);
    }
  };

  const handlePrev = () => {
    if (currentIndex === 0) return;
    setFlipped(false);
    setCurrentIndex((i) => i - 1);
  };

  const handleNext = () => {
    if (!flashcardSet || currentIndex + 1 >= flashcardSet.cards.length) return;
    setFlipped(false);
    setCurrentIndex((i) => i + 1);
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading flashcards...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#dc3545' }}>{error}</p>
        <button onClick={() => navigate('/')}>Back to Documents</button>
      </div>
    );
  }

  if (!flashcardSet || flashcardSet.cards.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>This flashcard set has no cards.</p>
        <button onClick={() => navigate('/')}>Back to Documents</button>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div style={{ padding: '2rem', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
        <h2>Study Session Complete 🎉</h2>
        <p style={{ color: '#444' }}>You reviewed {flashcardSet.cards.length} flashcards</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', margin: '1.5rem 0' }}>
          <div><strong>{stats.again}</strong><div style={{ color: '#dc3545' }}>Again</div></div>
          <div><strong>{stats.hard}</strong><div style={{ color: '#fd7e14' }}>Hard</div></div>
          <div><strong>{stats.good}</strong><div style={{ color: '#28a745' }}>Good</div></div>
          <div><strong>{stats.easy}</strong><div style={{ color: '#007bff' }}>Easy</div></div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
          <button onClick={resetSession} style={{ padding: '0.6rem 1.2rem' }}>Study Again</button>
          <button onClick={() => navigate('/')} style={{ padding: '0.6rem 1.2rem' }}>Back to Documents</button>
        </div>
      </div>
    );
  }

  const card = flashcardSet.cards[currentIndex];

  return (
    <div style={{ padding: '2rem 1rem' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '0.25rem' }}>Flashcards</h2>
      <p style={{ textAlign: 'center', color: '#666', marginTop: 0, marginBottom: '1.5rem' }}>
        {flashcardSet.title}
      </p>

      <FlashcardProgressBar current={currentIndex + 1} total={flashcardSet.cards.length} />

      <Flashcard
        question={card.question}
        answer={card.answer}
        flipped={flipped}
        onFlip={handleFlip}
      />

      <FlashcardControls visible={flipped} disabled={isSubmitting} onRate={handleRate} />

      <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '2rem' }}>
        <button onClick={handlePrev} disabled={currentIndex === 0}>Previous</button>
        <button onClick={handleNext} disabled={currentIndex + 1 >= flashcardSet.cards.length}>Next</button>
      </div>

      <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', textDecoration: 'underline' }}>
          Back to Documents
        </button>
      </div>
    </div>
  );
}

export default FlashcardStudyMode;
