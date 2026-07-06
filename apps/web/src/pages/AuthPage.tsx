import { LogIn, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { ActionButton } from '../components/action/ActionButton';
import { useAuth } from '../hooks/useAuth';

import './AuthPage.css';

type Mode = 'login' | 'signup';

export function AuthPage({
  forcePasswordChange = false,
  initialMode = 'login',
}: {
  forcePasswordChange?: boolean;
  initialMode?: Mode;
}): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const active = mode === 'login' ? auth.login : auth.signup;
  const error = forcePasswordChange ? auth.changePassword.error : active.error;

  useEffect(() => {
    if (!forcePasswordChange) {
      setMode(initialMode);
    }
  }, [forcePasswordChange, initialMode]);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (forcePasswordChange) {
      const user = await auth.changePassword.mutateAsync({
        currentPassword: password,
        newPassword,
      });
      if (user && !user.mustChangePassword) {
        navigate('/repos/family/jeryu-split', { replace: true });
      }
      return;
    }
    const user = await active.mutateAsync({ login, password });
    if (user && !user.mustChangePassword) {
      navigate('/repos/family/jeryu-split', { replace: true });
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-label="Jeryu account access">
        <div className="auth-panel__brand">
          <span className="auth-panel__mark" aria-hidden="true">
            J
          </span>
          <h1 className="auth-panel__title">Jeryu</h1>
        </div>
        {forcePasswordChange ? null : (
          <div className="auth-panel__tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className="auth-panel__tab"
              onClick={() => setMode('login')}
            >
              <LogIn size={14} aria-hidden="true" />
              Login
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'signup'}
              className="auth-panel__tab"
              onClick={() => setMode('signup')}
            >
              <UserPlus size={14} aria-hidden="true" />
              Sign up
            </button>
          </div>
        )}
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {forcePasswordChange ? null : (
            <label className="auth-form__field">
              <span>Username</span>
              <input
                value={login}
                onChange={(event) => setLogin(event.currentTarget.value)}
                autoComplete="username"
                required
              />
            </label>
          )}
          <label className="auth-form__field">
            <span>{forcePasswordChange ? 'Current password' : 'Password'}</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={12}
              required
            />
          </label>
          {forcePasswordChange ? (
            <label className="auth-form__field">
              <span>New password</span>
              <input
                value={newPassword}
                onChange={(event) => setNewPassword(event.currentTarget.value)}
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
          ) : null}
          {error ? (
            <p className="auth-form__error">
              {error instanceof ApiError ? error.message : 'Authentication failed.'}
            </p>
          ) : null}
          <ActionButton
            type="submit"
            variant="primary"
            icon={mode === 'login' ? <LogIn size={14} /> : <UserPlus size={14} />}
            disabled={forcePasswordChange ? auth.changePassword.isPending : active.isPending}
          >
            {forcePasswordChange
              ? 'Change password'
              : mode === 'login'
                ? 'Login'
                : 'Create account'}
          </ActionButton>
        </form>
      </section>
    </main>
  );
}
