import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFlashcardSets, deleteFlashcardSet } from '../../api/client';

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function FlashcardDecksList() {
  const navigate = useNavigate();
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await getFlashcardSets();
        if (!cancelled) setDecks(data);
      } catch (err) {
        console.error('Failed to load flashcard decks', err);
        if (!cancelled) setError('Could not load your flashcard decks.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDelete = async (deckId) => {
    if (!window.confirm('Delete this flashcard deck? This cannot be undone.')) return;
    setDeletingId(deckId);
    try {
      await deleteFlashcardSet(deckId);
      setDecks((prev) => prev.filter((d) => d.id !== deckId));
    } catch (err) {
      console.error('Failed to delete deck', err);
      alert('Failed to delete this deck.');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading your flashcard decks...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: '#dc3545' }}>{error}</p>
      </div>
    );
  }

  if (decks.length === 0) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <h2>No Flashcard Decks Yet 🃏</h2>
        <p style={{ color: '#666' }}>
          Generate flashcards from one of your uploaded documents to start studying.
        </p>
        <button onClick={() => navigate('/')} style={{ marginTop: '1rem', padding: '0.6rem 1.2rem' }}>
          Go to Documents
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem 1rem', maxWidth: '700px', margin: '0 auto' }}>
      <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>My Flashcard Decks 🃏</h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {decks.map((deck) => (
          <div key={deck.id} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '1rem' }}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>{deck.title}</h3>
            {deck.document_name && (
              <p style={{ margin: '0.25rem 0', color: '#555' }}>📄 {deck.document_name}</p>
            )}
            <p style={{ margin: '0.25rem 0', color: '#555' }}>🃏 {deck.number_of_cards} Flashcards</p>
            {deck.created_at && (
              <p style={{ margin: '0.25rem 0', color: '#888', fontSize: '0.85rem' }}>
                Created: {formatDate(deck.created_at)}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button onClick={() => navigate(`/flashcards/${deck.id}`)} style={{ padding: '0.5rem 1rem' }}>
                👀 Study Deck
              </button>
              <button
                onClick={() => handleDelete(deck.id)}
                disabled={deletingId === deck.id}
                style={{
                  padding: '0.5rem 1rem',
                  background: 'none',
                  border: '1px solid #dc3545',
                  color: '#dc3545',
                  borderRadius: '4px',
                  cursor: deletingId === deck.id ? 'not-allowed' : 'pointer',
                }}
              >
                {deletingId === deck.id ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FlashcardDecksList;
