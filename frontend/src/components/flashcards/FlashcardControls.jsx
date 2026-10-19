const DIFFICULTIES = [
  { key: 'again', label: 'Again', color: '#dc3545' },
  { key: 'hard', label: 'Hard', color: '#fd7e14' },
  { key: 'good', label: 'Good', color: '#28a745' },
  { key: 'easy', label: 'Easy', color: '#007bff' },
];

function FlashcardControls({ visible, disabled, onRate }) {
  if (!visible) {
    return (
      <p style={{ textAlign: 'center', color: '#888', marginTop: '1.5rem' }}>
        Click the card to reveal the answer
      </p>
    );
  }

  return (
    <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
      <p style={{ marginBottom: '0.75rem', color: '#444' }}>How well did you know this?</p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
        {DIFFICULTIES.map(({ key, label, color }) => (
          <button
            key={key}
            onClick={() => onRate(key)}
            disabled={disabled}
            style={{
              padding: '0.6rem 1.2rem',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: color,
              color: '#fff',
              fontWeight: 600,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default FlashcardControls;
