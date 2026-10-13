import { LogIn, Mail, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent, type Ref } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError } from '../api/client';
import { ActionButton } from '../components/action/ActionButton';
import { JeryuLogo } from '../components/brand/JeryuLogo';
import { useAuth } from '../hooks/useAuth';
import { useSignupPolicy } from '../hooks/useSignupPolicy';
import { homePathFor } from '../layout/HomeRedirect';
import { JoinWaitlistLink } from './account/JoinWaitlistLink';
import { INVITE_ONLY, RATE_LIMITED, UNREACHABLE } from './account/accountCopy';

import './AuthPage.css';

type Mode = 'login' | 'signup';

/** What the forge said to a sign-up link request, in words for the visitor. */
function signupStartProblem(error: Error): string {
  if (!(error instanceof ApiError)) return UNREACHABLE;
  if (error.status === 503) {
    return 'This forge cannot send email yet, so sign-up is closed. Ask an administrator for an account.';
  }
  if (error.status === 429) return RATE_LIMITED;
  if (error.status === 422) return 'Enter a whole email address, like name@example.com.';
  return error.message;
}

/**
 * Sign-up, step one: an address and nothing else. The forge mails a link to
 * `/create-account`, where the username and password are chosen, so no account
 * exists until someone has opened mail sent to that address. The answer is the
 * same whether or not an account already has the address.
 */
function SignupStartForm({ firstFieldRef }: { firstFieldRef?: Ref<HTMLInputElement> }): JSX.Element {
  const { signupStart } = useAuth();
  const [email, setEmail] = useState('');
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    signupStart.mutate({ email: email.trim() });
  };
  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="auth-form__field">
        <span>Email</span>
        <input
          ref={firstFieldRef}
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.currentTarget.value)}
          autoComplete="email"
          maxLength={254}
          required
        />
      </label>
      {signupStart.isSuccess ? (
        <p className="auth-form__sent" role="status">
          Check your email. A link to finish creating your account is on its way; it works for
          one day.
        </p>
      ) : null}
      {signupStart.error ? (
        <p className="auth-form__error" role="alert">
          {signupStartProblem(signupStart.error)}
        </p>
      ) : null}
      <ActionButton
        type="submit"
        variant="primary"
        icon={<Mail size={14} />}
        disabled={signupStart.isPending}
      >
        Send sign-up link
      </ActionButton>
    </form>
  );
}

/**
 * The Sign up tab. Sign-up is closed unless the forge says otherwise: then the
 * tab is the way onto the waitlist, not a form. Open (`email`), it is the
 * email-first form. A start the forge refuses with `signup_closed` (the policy
 * changed since it was read) shows the waitlist too.
 */
function SignupPanel({ firstFieldRef }: { firstFieldRef?: Ref<HTMLInputElement> }): JSX.Element {
  const view = useSignupPolicy();
  const { signupStart } = useAuth();
  const refusedClosed =
    signupStart.error instanceof ApiError && signupStart.error.code === 'signup_closed';
  if (view.state === 'loading') {
    return (
      <p className="auth-form__sent" role="status">
        Checking how to join…
      </p>
    );
  }
  if (view.mode === 'email' && !refusedClosed) {
    return <SignupStartForm firstFieldRef={firstFieldRef} />;
  }
  return (
    <div className="auth-form" data-testid="signup-closed">
      <p className="auth-form__sent">{INVITE_ONLY}</p>
      <JoinWaitlistLink
        waitlist={view.waitlist}
        className="action-button action-button--primary auth-form__waitlist"
      />
    </div>
  );
}

/**
 * AuthForm — the tabs + credential form shared by the boot LoginPanel and the
 * forced-password-change page. This component owns the accessibility contract
 * exercised by the e2e suite (tab roles `Login`/`Sign up`, labeled `Username`/
 * `Password`/`New password`/`Email` inputs, submit buttons `Login`/`Send
 * sign-up link`/`Change password`, the `Join the waitlist` link while sign-up
 * is closed) — keep those names/labels stable. Open sign-up finishes on
 * `/create-account`, opened from the mailed link.
 */
export function AuthForm({
  forcePasswordChange = false,
  initialMode = 'login',
  firstFieldRef,
}: {
  forcePasswordChange?: boolean;
  initialMode?: Mode;
  firstFieldRef?: Ref<HTMLInputElement>;
}): JSX.Element {
  const auth = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const error = forcePasswordChange ? auth.changePassword.error : auth.login.error;

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
        navigate(homePathFor(user), { replace: true });
      }
      return;
    }
    const user = await auth.login.mutateAsync({ login, password, rememberMe });
    if (user && !user.mustChangePassword) {
      navigate(homePathFor(user), { replace: true });
    }
  };

  return (
    <>
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
            onClick={() => {
              setMode('signup');
              setRememberMe(false);
            }}
          >
            <UserPlus size={14} aria-hidden="true" />
            Sign up
          </button>
        </div>
      )}
      {!forcePasswordChange && mode === 'signup' ? (
        <SignupPanel firstFieldRef={firstFieldRef} />
      ) : (
        <form className="auth-form" onSubmit={(event) => void submit(event)}>
          {forcePasswordChange ? null : (
            <label className="auth-form__field">
              <span>Username</span>
              <input
                ref={firstFieldRef}
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
              ref={forcePasswordChange ? firstFieldRef : undefined}
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
              type="password"
              autoComplete="current-password"
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
          {!forcePasswordChange ? (
            <label className="auth-form__check">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.currentTarget.checked)}
              />
              <span>Remember me</span>
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
            icon={<LogIn size={14} />}
            disabled={forcePasswordChange ? auth.changePassword.isPending : auth.login.isPending}
          >
            {forcePasswordChange ? 'Change password' : 'Login'}
          </ActionButton>
          {!forcePasswordChange ? (
            <Link className="auth-form__forgot" to="/forgot-password">
              Forgot password?
            </Link>
          ) : null}
        </form>
      )}
    </>
  );
}

/**
 * AuthPage — centered account surface used for the forced-password-change flow
 * (and as a standalone fallback). The signed-out splash/login experience is
 * the boot `LoginPanel`; both render an `<h1>JeRyu</h1>` heading + `AuthForm`.
 */
export function AuthPage({
  forcePasswordChange = false,
  initialMode = 'login',
}: {
  forcePasswordChange?: boolean;
  initialMode?: Mode;
}): JSX.Element {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-label="JeRyu account access">
        <div className="auth-panel__brand">
          <JeryuLogo variant="mark" className="auth-panel__mark" decorative />
          <h1 className="auth-panel__title">JeRyu</h1>
        </div>
        <AuthForm
          forcePasswordChange={forcePasswordChange}
          initialMode={initialMode}
        />
      </section>
    </main>
  );
}
