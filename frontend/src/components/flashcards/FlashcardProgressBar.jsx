import React from 'react';

function FlashcardProgressBar({ current, total }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto 1.5rem auto' }}>
      <p style={{ textAlign: 'center', color: '#444', marginBottom: '0.5rem' }}>
        Card {current} of {total}
      </p>
      <div style={{ width: '100%', height: '8px', backgroundColor: '#eee', borderRadius: '4px', overflow: 'hidden' }}>
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            backgroundColor: '#007bff',
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}

export default FlashcardProgressBar;
