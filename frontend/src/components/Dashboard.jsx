import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { uploadDocument, getDocuments, sendChatMessage, deleteDocument, generateFlashcards } from '../api/client';
import ReactMarkdown from 'react-markdown';

function Dashboard() {
  const navigate = useNavigate();
  const [documents, setDocuments] = useState([]);
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [query, setQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [isAsking, setIsAsking] = useState(false);

  const [isGeneratingFlashcards, setIsGeneratingFlashcards] = useState(false);

  const fetchDocuments = async () => {
    try {
      const docs = await getDocuments();
      setDocuments(docs);
    } catch (error) {
      console.error('Failed to fetch documents', error);
    }
  };

  // Initial load; fetchDocuments() refreshes the list after uploads and deletes
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const docs = await getDocuments();
        if (!cancelled) setDocuments(docs);
      } catch (error) {
        console.error('Failed to fetch documents', error);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    try {
      await uploadDocument(file);
      setFile(null);
      await fetchDocuments();
    } catch (error) {
      console.error('Failed to upload', error);
      alert('Upload failed.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this document?")) return;
    setIsDeleting(true);
    try {
      await deleteDocument(id);
      await fetchDocuments();
    } catch (error) {
      console.error('Failed to delete document', error);
      alert('Delete failed.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGenerateFlashcards = async (id) => {
    if (isGeneratingFlashcards) return;
    setIsGeneratingFlashcards(true);
    try {
      const result = await generateFlashcards(id);
      navigate(`/flashcards/${result.flashcard_set_id}/success`, {
        state: { title: result.title, numberOfCards: result.number_of_cards, documentId: id },
      });
    } catch (error) {
      console.error(error);
      alert("Failed to generate flashcards.");
    } finally {
      setIsGeneratingFlashcards(false);
    }
  };


  const handleChat = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = query.trim();
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);
    setQuery('');
    setIsAsking(true);

    try {
      const response = await sendChatMessage(userMessage);
      setChatHistory(prev => [...prev, { role: 'assistant', content: response.answer, sources: response.sources }]);
    } catch (error) {
      console.error('Chat failed', error);
      setChatHistory(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error.' }]);
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 60px)', padding: '1rem', gap: '1rem' }}>
      
      {/* Left panel: Documents */}
      <div style={{ flex: '1', borderRight: '1px solid #ccc', paddingRight: '1rem' }}>
        <h2>My Documents</h2>
        
        <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
          <input type="file" onChange={handleFileChange} accept=".pdf,.txt" />
          <button onClick={handleUpload} disabled={!file || isUploading || isDeleting}>
            {isUploading ? 'Uploading...' : 'Upload'}
          </button>
        </div>

        <ul style={{ listStyle: 'none', padding: 0 }}>
          {documents.map(doc => (
            <li key={doc.id} style={{ padding: '0.5rem', border: '1px solid #eee', marginBottom: '0.5rem', borderRadius: '4px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>📄 {doc.filename}</span>
                <button 
                  onClick={() => handleDelete(doc.id)} 
                  disabled={isDeleting}
                  style={{ background: '#ff4d4f', color: 'white', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', cursor: 'pointer' }}
                >
                  Delete
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  onClick={() => handleGenerateFlashcards(doc.id)}
                  disabled={isGeneratingFlashcards}
                  style={{ flex: 1, padding: '0.25rem', fontSize: '0.8rem' }}
                >
                  {isGeneratingFlashcards ? 'Generating flashcards...' : 'Flashcards'}
                </button>
              </div>
            </li>
          ))}
          {documents.length === 0 && <p style={{ color: '#666' }}>No documents uploaded yet.</p>}
        </ul>
      </div>


      {/* Right panel: Chat */}
      <div style={{ flex: '2', display: 'flex', flexDirection: 'column' }}>
        <h2>StudyVault Assistant</h2>
        
        <div style={{ flex: 1, border: '1px solid #ccc', borderRadius: '4px', padding: '1rem', overflowY: 'auto', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {chatHistory.length === 0 && (
            <p style={{ color: '#666', textAlign: 'center', marginTop: 'auto', marginBottom: 'auto' }}>
              Ask a question about your study materials!
            </p>
          )}
          {chatHistory.map((msg, idx) => (
            <div key={idx} style={{ 
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              backgroundColor: msg.role === 'user' ? '#007bff' : '#f1f1f1',
              color: msg.role === 'user' ? '#fff' : '#000',
              padding: '0.75rem',
              borderRadius: '8px',
              maxWidth: '80%'
            }}>
              <strong>{msg.role === 'user' ? 'You' : 'Assistant'}: </strong>
              <div style={{ marginTop: '0.5rem' }}>
                {msg.role === 'user' ? (
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                ) : (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                )}
              </div>
              
              {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666', borderTop: '1px solid #ccc', paddingTop: '0.5rem' }}>
                  <strong>Sources:</strong>
                  <ul style={{ paddingLeft: '1rem', margin: '0.25rem 0 0 0' }}>
                    {/* Filter out duplicate documents from sources */}
                    {[...new Set(msg.sources.map(s => s.document_id))].map(docId => {
                      const doc = documents.find(d => d.id === docId);
                      return (
                        <li key={docId}>{doc ? doc.filename : `Document ${docId}`}</li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {isAsking && (
            <div style={{ alignSelf: 'flex-start', backgroundColor: '#f1f1f1', padding: '0.75rem', borderRadius: '8px' }}>
              <em>Thinking...</em>
            </div>
          )}
        </div>

        <form onSubmit={handleChat} style={{ display: 'flex', gap: '0.5rem' }}>
          <input 
            type="text" 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask about your documents..."
            style={{ flex: 1, padding: '0.5rem' }}
            disabled={isAsking}
          />
          <button type="submit" disabled={isAsking || !query.trim()}>Send</button>
        </form>
      </div>

    </div>
  );
}

export default Dashboard;
