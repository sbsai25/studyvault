import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import MotionProvider from './motion/MotionProvider';
import ToastProvider from './components/ui/toast/ToastProvider';
import ConfirmProvider from './components/ui/confirm/ConfirmProvider';
import ProtectedRoute from './components/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import SplashScreen from './components/layout/SplashScreen';

// Each screen is its own chunk, loaded when first opened
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Library = lazy(() => import('./pages/Library'));
const Chat = lazy(() => import('./pages/Chat'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const FlashcardDecks = lazy(() => import('./pages/FlashcardDecks'));
const FlashcardStudy = lazy(() => import('./pages/FlashcardStudy'));
const FlashcardSuccess = lazy(() => import('./pages/FlashcardSuccess'));

function App() {
  return (
    <MotionProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <Router>
              <Suspense fallback={<SplashScreen />}>
                <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />

                  <Route element={<ProtectedRoute />}>
                    <Route element={<AppShell />}>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/library" element={<Library />} />
                      <Route path="/chat" element={<Chat />} />
                      <Route path="/chat/:conversationId" element={<Chat />} />
                      <Route path="/flashcards" element={<FlashcardDecks />} />
                      <Route path="/flashcards/:setId/success" element={<FlashcardSuccess />} />
                      <Route path="/flashcards/:setId" element={<FlashcardStudy />} />
                      <Route path="*" element={<NotFound />} />
                    </Route>
                  </Route>
                </Routes>
              </Suspense>
            </Router>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </MotionProvider>
  );
}

export default App;
