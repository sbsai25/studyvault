import axios from 'axios';

const API_BASE_URL = 'http://127.0.0.1:8000';

const client = axios.create({
  baseURL: API_BASE_URL,
});

// Refresh tokens are single-use (the server rotates them and treats reuse as
// theft), so when several requests get a 401 at once they must share one
// refresh call instead of each sending the same token.
let refreshPromise = null;

const refreshTokens = (refreshToken) => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken })
      .then((res) => {
        const { access_token, refresh_token: new_refresh } = res.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', new_refresh);
        return access_token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');

      if (refreshToken) {
        try {
          const access_token = await refreshTokens(refreshToken);

          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return client(originalRequest);
        } catch {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      } else {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export const uploadDocument = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await client.post('/documents/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const getDocuments = async () => {
  const response = await client.get('/documents/');
  return response.data;
};

export const deleteDocument = async (id) => {
  const response = await client.delete(`/documents/${id}`);
  return response.data;
};


export const sendChatMessage = async (query, conversationId = null, documentId = null) => {
  const payload = { query };
  if (conversationId) {
    payload.conversation_id = conversationId;
  }
  if (documentId) {
    // Search only this document for this one message
    payload.document_id = documentId;
  }
  const response = await client.post('/chat/', payload);
  return response.data;
};

export const getConversations = async () => {
  const response = await client.get('/chat/conversations');
  return response.data;
};

export const getConversation = async (conversationId) => {
  const response = await client.get(`/chat/conversations/${conversationId}`);
  return response.data;
};

export const renameConversation = async (conversationId, title) => {
  const response = await client.patch(`/chat/conversations/${conversationId}`, { title });
  return response.data;
};

export const deleteConversation = async (conversationId) => {
  const response = await client.delete(`/chat/conversations/${conversationId}`);
  return response.data;
};

export const generateFlashcards = async (documentId) => {
  const response = await client.post('/tools/flashcards', { document_id: documentId });
  return response.data;
};

export const generateFillBlanks = async (documentId, numQuestions = null) => {
  const payload = { document_id: documentId };
  if (numQuestions) {
    payload.num_questions = numQuestions; // 3-20, default 10
  }
  const response = await client.post('/tools/fill-blanks', payload);
  return response.data;
};

export const getFillBlankSets = async () => {
  const response = await client.get('/fill-blanks');
  return response.data;
};

// Sentences and hints only; answers come back after submitting
export const getFillBlankSet = async (setId) => {
  const response = await client.get(`/fill-blanks/${setId}`);
  return response.data;
};

// answers: [{ question_id, answer }]
export const submitFillBlanks = async (setId, answers) => {
  const response = await client.post(`/fill-blanks/${setId}/submit`, { answers });
  return response.data;
};

export const getFillBlankAttempts = async (setId) => {
  const response = await client.get(`/fill-blanks/${setId}/attempts`);
  return response.data;
};

export const getFillBlankAttempt = async (attemptId) => {
  const response = await client.get(`/fill-blanks/attempts/${attemptId}`);
  return response.data;
};

export const deleteFillBlankSet = async (setId) => {
  const response = await client.delete(`/fill-blanks/${setId}`);
  return response.data;
};

export const getFlashcardSets = async () => {
  const response = await client.get('/flashcards');
  return response.data;
};

export const getFlashcardSet = async (setId) => {
  const response = await client.get(`/flashcards/${setId}`);
  return response.data;
};

export const reviewFlashcard = async (flashcardId, difficulty) => {
  const response = await client.post(`/flashcards/${flashcardId}/review`, { difficulty });
  return response.data;
};

export const getDueFlashcards = async () => {
  const response = await client.get('/flashcards/due');
  return response.data;
};

export const deleteFlashcardSet = async (setId) => {
  const response = await client.delete(`/flashcards/${setId}`);
  return response.data;
};

// Cards in one deck to study now: never reviewed, or due for review
export const getDeckDueFlashcards = async (setId) => {
  const response = await client.get(`/flashcards/${setId}/due`);
  return response.data;
};

export const getActivity = async (limit = 20, offset = 0) => {
  const response = await client.get('/activity', { params: { limit, offset } });
  return response.data;
};

export const getStats = async () => {
  const response = await client.get('/stats');
  return response.data;
};

// Revokes the refresh token on the server; always succeeds
export const logout = async (refreshToken) => {
  const response = await client.post('/auth/logout', refreshToken ? { refresh_token: refreshToken } : undefined);
  return response.data;
};

export default client;
