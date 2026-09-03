import axios from 'axios';

const client = axios.create({
  baseURL: 'http://127.0.0.1:8000',
});

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
          const res = await axios.post(`http://127.0.0.1:8000/auth/refresh?refresh_token=${refreshToken}`);
          const { access_token, refresh_token: new_refresh } = res.data;

          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', new_refresh);

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


export const sendChatMessage = async (query, conversationId = null) => {
  const payload = { query };
  if (conversationId) {
    payload.conversation_id = conversationId;
  }
  const response = await client.post('/chat/', payload);
  return response.data;
};

export const generateFlashcards = async (documentId) => {
  const response = await client.post('/tools/flashcards', { document_id: documentId });
  return response.data;
};

export const generateQuiz = async (documentId) => {
  const response = await client.post('/tools/quiz', { document_id: documentId });
  return response.data;
};

export default client;
