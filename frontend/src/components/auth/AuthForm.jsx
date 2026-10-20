import { useState } from 'react';
import { CircleAlert, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import Button from '../ui/Button';
import IconButton from '../ui/IconButton';
import TextField from '../ui/TextField';
import styles from './AuthForm.module.css';

// The email + password form shared by sign-in and registration.
// onSubmit(email, password) should throw on failure; `error` is shown above
// the fields and announced.
function AuthForm({ submitLabel, submittingLabel, passwordAutoComplete, error, submitting, onSubmit }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!submitting) onSubmit(email.trim(), password);
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      {error && (
        <div className={styles.error} role="alert">
          <CircleAlert size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}
      <TextField
        label="Email"
        type="email"
        icon={Mail}
        autoComplete="email"
        inputMode="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <TextField
        label="Password"
        type={showPassword ? 'text' : 'password'}
        icon={Lock}
        autoComplete={passwordAutoComplete}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        trailing={
          <IconButton
            icon={showPassword ? EyeOff : Eye}
            label={showPassword ? 'Hide password' : 'Show password'}
            aria-pressed={showPassword}
            size="sm"
            onClick={() => setShowPassword((v) => !v)}
          />
        }
      />
      <Button type="submit" size="lg" block loading={submitting}>
        {submitting ? submittingLabel : submitLabel}
      </Button>
    </form>
  );
}

export default AuthForm;
