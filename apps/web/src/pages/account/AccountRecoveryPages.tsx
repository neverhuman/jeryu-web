// AccountRecoveryPages.tsx — the signed-out pages a recovery or verification
// email leads to, and the form that sends the recovery email.
//
//   /forgot-password            ask for a reset link (always "check your email")
//   /reset-password?token=…     set a new password with the emailed link
//   /verify-email?token=…       prove an address with the emailed link
//
// The server answers a recovery request identically whether or not an account
// holds the address, so this page does too: it never says which. A link that
// is expired, already used or not one the forge issued is one refusal (422),
// and the page offers the way to get a fresh one.

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError, apiSend } from '../../api/client';
import { endpoints } from '../../api/endpoints';
import { MarketingHeader } from '../boot/MarketingHeader';
import { MarketingScene } from '../boot/MarketingScene';

import '../boot/boot.css';
import '../WaitlistPage.css';
import '../boot/WaitlistForm.css';

/** The forge refuses a shorter password; the form says so before it asks. */
export const PASSWORD_MIN_LENGTH = 12;

const LIMITED = 'Too many attempts. Try again later.';
const UNREACHABLE = 'The forge could not be reached. Try again.';

function AccountFrame({
  label,
  title,
  intro,
  children,
}: {
  label: string;
  title: string;
  intro: string;
  children: ReactNode;
}): JSX.Element {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <main id="main-content" className="marketing waitlist-page">
      <MarketingScene motionTarget={contentRef} subdued>
        <MarketingHeader />
        <div ref={contentRef} className="waitlist-page__content">
          <section className="waitlist-page__intro marketing-scene__copy" aria-labelledby="account-title">
            <p className="landing-section-label">{label}</p>
            <h1 id="account-title">{title}</h1>
            <p>{intro}</p>
            <Link className="waitlist-page__back" to="/login">
              ← Back to log in
            </Link>
          </section>
          <div className="waitlist-page__form">{children}</div>
        </div>
      </MarketingScene>
    </main>
  );
}

function Status({ id, text }: { id: string; text: string | null }): JSX.Element | null {
  return text ? (
    <p className="waitlist__status" id={id} role="status">
      {text}
    </p>
  ) : null;
}

/** `/forgot-password`: mails a reset link to a verified address, if one matches. */
export function ForgotPasswordPage(): JSX.Element {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<'idle' | 'sending' | 'sent' | 'limited' | 'failed'>('idle');

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setPhase('sending');
    try {
      await apiSend(endpoints.authPasswordForgot(), { email: email.trim() });
      setPhase('sent');
    } catch (error) {
      setPhase(error instanceof ApiError && error.status === 429 ? 'limited' : 'failed');
    }
  };

  const message =
    phase === 'sent'
      ? 'If an account has verified that address, a reset link is on its way. It works for one hour.'
      : phase === 'limited'
        ? LIMITED
        : phase === 'failed'
          ? UNREACHABLE
          : null;
  return (
    <AccountFrame
      label="Account recovery"
      title="Forgot your password?"
      intro="Enter the email address you verified on your account and we will send a link to set a new password. An account with no verified address can ask an administrator to reset it."
    >
      <form className="waitlist" onSubmit={(event) => void submit(event)}>
        <p className="waitlist__title">Send a reset link</p>
        <label className="waitlist__field">
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            aria-describedby={message ? 'forgot-status' : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <button type="submit" className="waitlist__submit" disabled={phase === 'sending'}>
          {phase === 'sending' ? 'Sending…' : 'Send reset link'}
        </button>
        <Status id="forgot-status" text={message} />
      </form>
    </AccountFrame>
  );
}

/** `/reset-password?token=…`: sets a new password with the emailed link. */
export function ResetPasswordPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [phase, setPhase] = useState<'idle' | 'saving' | 'done' | 'invalid' | 'limited' | 'failed'>(
    'idle'
  );
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setProblem(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setProblem('The two passwords are not the same.');
      return;
    }
    setProblem(null);
    setPhase('saving');
    try {
      await apiSend(endpoints.authPasswordReset(), { token, newPassword: password });
      setPassword('');
      setConfirm('');
      setPhase('done');
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        // A rejected password does not spend the link; an unspendable link is
        // `reset_link_invalid`. Both are 422 and the server says which.
        if (error.code === 'reset_link_invalid') setPhase('invalid');
        else {
          setProblem(error.message);
          setPhase('idle');
        }
        return;
      }
      setPhase(error instanceof ApiError && error.status === 429 ? 'limited' : 'failed');
    }
  };

  if (!token || phase === 'invalid') {
    return (
      <AccountFrame
        label="Account recovery"
        title="This link no longer works"
        intro="A reset link works once, for one hour. Ask for a new one and use the newest email."
      >
        <p className="waitlist__status" role="status">
          {token ? 'That reset link is expired, already used, or not one this forge sent.' : 'This page needs the link from a reset email.'}
        </p>
        <Link className="waitlist__submit" to="/forgot-password">
          Send a new reset link
        </Link>
      </AccountFrame>
    );
  }
  if (phase === 'done') {
    return (
      <AccountFrame
        label="Account recovery"
        title="Your password is set"
        intro="The account was signed out everywhere: its sessions, personal access tokens and agent grants. Log in with the new password."
      >
        <Link className="waitlist__submit" to="/login">
          Go to log in
        </Link>
      </AccountFrame>
    );
  }
  const message =
    problem ?? (phase === 'limited' ? LIMITED : phase === 'failed' ? UNREACHABLE : null);
  return (
    <AccountFrame
      label="Account recovery"
      title="Set a new password"
      intro="Choose a new password for your account. Setting it signs the account out everywhere."
    >
      <form className="waitlist" onSubmit={(event) => void submit(event)}>
        <p className="waitlist__title">New password</p>
        <label className="waitlist__field">
          New password
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            aria-invalid={problem ? true : undefined}
            aria-describedby={message ? 'reset-status' : undefined}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <label className="waitlist__field">
          Repeat it
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
          {phase === 'saving' ? 'Saving…' : 'Set password'}
        </button>
        <Status id="reset-status" text={message} />
      </form>
    </AccountFrame>
  );
}

/** `/verify-email?token=…`: proves an address as soon as the page opens. */
export function VerifyEmailPage(): JSX.Element {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [phase, setPhase] = useState<'checking' | 'verified' | 'invalid' | 'limited' | 'failed'>(
    token ? 'checking' : 'invalid'
  );
  const spent = useRef(false);

  useEffect(() => {
    // A link is single-use: spend it once even when React mounts twice.
    if (!token || spent.current) return;
    spent.current = true;
    apiSend(endpoints.authEmailVerify(), { token })
      .then(() => setPhase('verified'))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 422) setPhase('invalid');
        else setPhase(error instanceof ApiError && error.status === 429 ? 'limited' : 'failed');
      });
  }, [token]);

  const copy = {
    checking: ['Checking your link…', 'One moment.'],
    verified: [
      'Your email address is verified',
      'It can now receive a password reset link if you ever need one.',
    ],
    invalid: [
      'This link no longer works',
      'A verification link works once, for one day. Send a new one from Settings, signed in.',
    ],
    limited: ['Too many attempts', LIMITED],
    failed: ['Something went wrong', UNREACHABLE],
  }[phase];
  return (
    <AccountFrame label="Email verification" title={copy[0]} intro={copy[1]}>
      {phase === 'verified' || phase === 'invalid' ? (
        <Link className="waitlist__submit" to={phase === 'verified' ? '/login' : '/settings#email-section'}>
          {phase === 'verified' ? 'Go to log in' : 'Open Settings'}
        </Link>
      ) : (
        <p className="waitlist__status" role="status">
          {copy[1]}
        </p>
      )}
    </AccountFrame>
  );
}
