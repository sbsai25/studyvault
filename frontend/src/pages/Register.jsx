import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../lib/errors';
import AuthForm from '../components/auth/AuthForm';
import AuthLayout from '../components/auth/AuthLayout';

function Register() {
  const { user, loading, register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (email, password) => {
    setError('');
    setSubmitting(true);
    try {
      await register(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, 'Registration failed. Please try again.'));
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start building your personal study vault."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <AuthForm
        submitLabel="Create account"
        submittingLabel="Creating account…"
        passwordAutoComplete="new-password"
        error={error}
        submitting={submitting}
        onSubmit={handleSubmit}
      />
    </AuthLayout>
  );
}

export default Register;
