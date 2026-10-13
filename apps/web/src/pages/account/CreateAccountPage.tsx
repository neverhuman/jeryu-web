// CreateAccountPage.tsx — sign-up, step two: `/create-account?token=…`, the
// page a mailed sign-up link opens. The address is already proved by the link,
// so this page asks only for a username and a password.
//
// The server tells the outcomes apart, and so does the page:
//   403 signup_closed                     sign-up closed since the link was sent: the waitlist
//   signup_link_invalid / email_required  the link is spent or missing: start over
//   409 conflict                          the username is taken; the link still works
//   other 422                             the password was refused; the link still works

import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ApiError } from '../../api/client';
import { useAuth } from '../../hooks/useAuth';
import { useSignupPolicy } from '../../hooks/useSignupPolicy';
import { AccountFrame, PASSWORD_MIN_LENGTH, Status } from './AccountRecoveryPages';
import { JoinWaitlistLink, SignupPolicyUnreadable } from './JoinWaitlistLink';
import { INVITE_ONLY, RATE_LIMITED, UNREACHABLE } from './accountCopy';

type Phase = 'idle' | 'saving' | 'invalid' | 'closed';
type Problem = { field: 'login' | 'password' | 'form'; text: string };

const LINK_CODES = new Set(['signup_link_invalid', 'email_required']);

/** Which refusal the forge gave, and what the person can do about it. */
function refusal(error: unknown): Problem | 'invalid' | 'closed' {
  if (!(error instanceof ApiError)) return { field: 'form', text: UNREACHABLE };
  if (error.code === 'signup_closed') return 'closed';
  if (error.status === 422 && LINK_CODES.has(error.code)) return 'invalid';
  if (error.status === 409) return { field: 'login', text: 'That username is taken. Choose another.' };
  if (error.status === 429) return { field: 'form', text: RATE_LIMITED };
  if (error.status === 422) return { field: 'password', text: error.message };
  return { field: 'form', text: error.message };
}

/** Sign-up closed after the link went out: the waitlist is the way in. */
function SignupClosed(): JSX.Element {
  const view = useSignupPolicy();
  return (
    <AccountFrame label="Create an account" title="Sign-up is closed" intro={INVITE_ONLY}>
      {view.state === 'loading' ? (
        <p className="waitlist__status" role="status">
          Finding the waitlist…
        </p>
      ) : view.state === 'unreadable' ? (
        <SignupPolicyUnreadable
          retrying={view.retrying}
          retry={view.retry}
          className="waitlist__submit"
        />
      ) : (
        <JoinWaitlistLink waitlist={view.waitlist} className="waitlist__submit" />
      )}
    </AccountFrame>
  );
}

/** `/create-account?token=…`: choose a username and password, then go in. */
export function CreateAccountPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState<Phase>(token ? 'idle' : 'invalid');
  const [problem, setProblem] = useState<Problem | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setProblem({ field: 'password', text: `Use at least ${PASSWORD_MIN_LENGTH} characters.` });
      return;
    }
    if (password !== confirm) {
      setProblem({ field: 'password', text: 'The two passwords are not the same.' });
      return;
    }
    setProblem(null);
    setPhase('saving');
    try {
      await signup.mutateAsync({ token, login: login.trim(), password });
      navigate('/', { replace: true });
    } catch (error) {
      const outcome = refusal(error);
      if (outcome === 'invalid' || outcome === 'closed') {
        setPhase(outcome);
        return;
      }
      setProblem(outcome);
      setPhase('idle');
    }
  };

  if (phase === 'closed') return <SignupClosed />;
  if (phase === 'invalid') {
    return (
      <AccountFrame
        label="Create an account"
        title="This link no longer works"
        intro="A sign-up link works once, for one day. Ask for a new one and use the newest email."
      >
        <p className="waitlist__status" role="status">
          {token
            ? 'That sign-up link is expired, already used, or not one this forge sent.'
            : 'This page needs the link from a sign-up email.'}
        </p>
        <Link className="waitlist__submit" to="/signup">
          Start sign-up again
        </Link>
      </AccountFrame>
    );
  }
  return (
    <AccountFrame
      label="Create an account"
      title="Finish creating your account"
      intro="Your email address is confirmed. Choose the username you will sign in with and a password."
    >
      <form className="waitlist" onSubmit={(event) => void submit(event)}>
        <p className="waitlist__title">Your account</p>
        <label className="waitlist__field">
          Username
          <input
            name="username"
            autoComplete="username"
            required
            maxLength={64}
            value={login}
            aria-invalid={problem?.field === 'login' ? true : undefined}
            aria-describedby={problem ? 'create-account-status' : undefined}
            onChange={(event) => setLogin(event.target.value)}
          />
        </label>
        <label className="waitlist__field">
          Password
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            aria-invalid={problem?.field === 'password' ? true : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="waitlist__field">
          Repeat password
          <input
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </label>
        <button type="submit" className="waitlist__submit" disabled={phase === 'saving'}>
          {phase === 'saving' ? 'Creating…' : 'Create account'}
        </button>
        <Status id="create-account-status" text={problem?.text ?? null} />
      </form>
    </AccountFrame>
  );
}
