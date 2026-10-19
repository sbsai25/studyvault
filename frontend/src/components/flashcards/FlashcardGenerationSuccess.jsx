import { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { getFlashcardSet, generateFlashcards } from '../../api/client';

function FlashcardGenerationSuccess() {
  const { setId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const initialState = location.state || {};

  const [title, setTitle] = useState(initialState.title || null);
  const [numberOfCards, setNumberOfCards] = useState(
    typeof initialState.numberOfCards === 'number' ? initialState.numberOfCards : null
  );
  const [documentId, setDocumentId] = useState(initialState.documentId || null);
  const [loading, setLoading] = useState(!initialState.title);
  const [error, setError] = useState(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await getFlashcardSet(setId);
        if (cancelled) return;
        setTitle(data.title);
        setNumberOfCards(data.cards.length);
        setDocumentId(data.document_id);
        setError(null);
      } catch (err) {
        console.error('Failed to load generated flashcard set', err);
        if (!cancelled) setError('Could not load this flashcard set.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // Re-fetch whenever we land on a new set's success screen (e.g. after regenerating).
  }, [setId]);

  const handleGenerateNewSet = async () => {
    if (isRegenerating || !documentId) return;
    setIsRegenerating(true);
    try {
      const result = await generateFlashcards(documentId);
      navigate(`/flashcards/${result.flashcard_set_id}/success`, {
        state: { title: result.title, numberOfCards: result.number_of_cards, documentId },
        replace: true,
      });
    } catch (err) {
      console.error('Failed to generate a new set', err);
      alert('Failed to generate a new flashcard set.');
    } finally {
      setIsRegenerating(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  }

  if (error && !title) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#dc3545' }}>{error}</p>
        <button onClick={() => navigate('/')}>Back to Documents</button>
      </div>
    );
  }

  return (
    <div style={{ padding: '3rem 1rem', maxWidth: '480px', margin: '0 auto', textAlign: 'center' }}>
      <h2>Flashcards Generated! 🎉</h2>
      <p style={{ fontSize: '1.1rem', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.25rem' }}>
        {title}
      </p>
      <p style={{ color: '#666', marginTop: 0 }}>
        {numberOfCards} Flashcard{numberOfCards === 1 ? '' : 's'} Created
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '2rem' }}>
        <button onClick={() => navigate(`/flashcards/${setId}`)} style={{ padding: '0.75rem', fontSize: '1rem' }}>
          👀 Study This Deck
        </button>
        <button
          onClick={handleGenerateNewSet}
          disabled={isRegenerating || !documentId}
          style={{ padding: '0.75rem', fontSize: '1rem' }}
        >
          {isRegenerating ? 'Generating...' : '✨ Generate New Set'}
        </button>
        <button onClick={() => navigate('/flashcards')} style={{ padding: '0.75rem', fontSize: '1rem' }}>
          📚 View My Flashcard Decks
        </button>
      </div>
    </div>
  );
}

export default FlashcardGenerationSuccess;
