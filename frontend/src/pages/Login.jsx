import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/errors';
import { redirectTarget } from '../lib/redirect';
import AuthForm from '../components/auth/AuthForm';
import AuthLayout from '../components/auth/AuthLayout';

function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to={redirectTarget(location)} replace />;
  }

  const handleSubmit = async (email, password) => {
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(redirectTarget(location), { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Sign-in failed. Check your email and password.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue studying."
      footer={
        <>
          New to StudyVault? <Link to="/register">Create an account</Link>
        </>
      }
    >
      <AuthForm
        submitLabel="Sign in"
        submittingLabel="Signing in…"
        passwordAutoComplete="current-password"
        error={error}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </AuthLayout>
  );
}

export default Login;
