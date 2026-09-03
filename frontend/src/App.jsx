import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import LoginForm from './components/LoginForm';
import RegisterForm from './components/RegisterForm';
import ProtectedRoute from './components/ProtectedRoute';

import Dashboard from './components/Dashboard';
import FlashcardStudyMode from './components/flashcards/FlashcardStudyMode';
import FlashcardGenerationSuccess from './components/flashcards/FlashcardGenerationSuccess';
import FlashcardDecksList from './components/flashcards/FlashcardDecksList';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Navbar />
        <Routes>
          <Route path="/login" element={<LoginForm />} />
          <Route path="/register" element={<RegisterForm />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/flashcards" element={<FlashcardDecksList />} />
            <Route path="/flashcards/:setId/success" element={<FlashcardGenerationSuccess />} />
            <Route path="/flashcards/:setId" element={<FlashcardStudyMode />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;