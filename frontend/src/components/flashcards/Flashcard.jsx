import React from 'react';

function Flashcard({ question, answer, flipped, onFlip }) {
  return (
    <div
      onClick={onFlip}
      style={{
        width: '100%',
        maxWidth: '600px',
        height: '320px',
        margin: '0 auto',
        perspective: '1200px',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          textAlign: 'center',
          transition: 'transform 0.6s',
          transformStyle: 'preserve-3d',
          transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
        }}
      >
        {/* Front */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            borderRadius: '12px',
            border: '1px solid #ddd',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            backgroundColor: '#fff',
          }}
        >
          <p style={{ fontSize: '1.3rem', fontWeight: 600, margin: 0 }}>{question}</p>
          <p style={{ position: 'absolute', bottom: '1rem', fontSize: '0.85rem', color: '#888', margin: 0 }}>
            Click to reveal answer
          </p>
        </div>

        {/* Back */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            borderRadius: '12px',
            border: '1px solid #007bff',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            backgroundColor: '#f0f7ff',
          }}
        >
          <p style={{ fontSize: '0.85rem', color: '#007bff', fontWeight: 700, letterSpacing: '0.05em', margin: '0 0 0.5rem 0' }}>
            ANSWER
          </p>
          <p style={{ fontSize: '1.15rem', margin: 0 }}>{answer}</p>
        </div>
      </div>
    </div>
  );
}

export default Flashcard;
