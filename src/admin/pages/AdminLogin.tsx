import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Lock,
  Mail,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  AlertCircle,
  HelpCircle,
  CheckCircle2,
  UserPlus,
  User,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import {
  authenticate,
  registerSupabaseAccount,
  requestPasswordReset,
  completePasswordRecovery,
  isPasswordRecoveryMode,
  isAuthenticated,
} from '@/lib/auth';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useContent } from '@/hooks/useContent';
import SEO from '@/components/seo/SEO';
import { santaLogo } from '@/assets/images';
import { isValidAdminPath, sanitizeImageUrl } from '@/lib/security';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'recovery';

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const logoUrl = useContent('global.logo.url', santaLogo);
  const brandName = useContent('global.brand.name', 'Santa Towing & Garage Services Ltd.');

  const supabaseEnabled = isSupabaseConfigured();

  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    isPasswordRecoveryMode() ? 'recovery' : 'signin'
  );
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);

  const [recoveryChannel, setRecoveryChannel] = useState<'email' | 'gmail'>('email');
  const [forgotEmail, setForgotEmail] = useState<string>('');
  const [forgotSent, setForgotSent] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  const safeLogoUrl = sanitizeImageUrl(logoUrl, santaLogo);

  const fromLocation = (location.state as any)?.from;
  const candidateFromPath = fromLocation
    ? `${fromLocation.pathname || '/admin'}${fromLocation.search || ''}${fromLocation.hash || ''}`
    : '/admin';
  const fromPath = isValidAdminPath(candidateFromPath) ? candidateFromPath : '/admin';

  useEffect(() => {
    const syncRecoveryOrRedirect = () => {
      if (isPasswordRecoveryMode()) {
        setAuthMode('recovery');
        return;
      }
      if (isAuthenticated()) {
        navigate(fromPath, { replace: true });
      }
    };

    syncRecoveryOrRedirect();
    window.addEventListener('santa_admin_auth_changed', syncRecoveryOrRedirect);
    return () => window.removeEventListener('santa_admin_auth_changed', syncRecoveryOrRedirect);
  }, [navigate, fromPath]);

  const handleSwitchMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setErrorMsg('');
    setSuccessMsg('');
    setConfirmPassword('');
    if (mode === 'forgot') {
      setForgotSent(false);
      if (email.trim() && !forgotEmail.trim()) {
        setForgotEmail(email.trim());
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setErrorMsg('');
    setSuccessMsg('');

    if (authMode === 'forgot') {
      const targetEmail = forgotEmail.trim();
      if (!targetEmail) {
        setErrorMsg(
          recoveryChannel === 'gmail'
            ? 'Please enter your Gmail address.'
            : 'Please enter your registered email address.'
        );
        return;
      }
      if (recoveryChannel === 'gmail' && !targetEmail.toLowerCase().endsWith('@gmail.com')) {
        setErrorMsg('Please enter a valid @gmail.com address or switch to Email recovery.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await requestPasswordReset(targetEmail);
        if (res.success) {
          setForgotSent(true);
          setSuccessMsg(
            `Recovery link sent to ${targetEmail}. Check your ${
              recoveryChannel === 'gmail' || targetEmail.toLowerCase().endsWith('@gmail.com')
                ? 'Gmail'
                : 'email'
            } inbox to reset your password.`
          );
        } else {
          setErrorMsg(res.error || 'Unable to send password recovery email.');
        }
      } catch {
        setErrorMsg('An unexpected error occurred while sending the recovery email.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (authMode === 'recovery') {
      if (!password || password.trim().length < 6) {
        setErrorMsg('New password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please verify your confirm password.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await completePasswordRecovery(password);
        if (res.success) {
          setSuccessMsg('Password updated! Redirecting to admin console...');
          setTimeout(() => {
            navigate(fromPath, { replace: true });
          }, 400);
        } else {
          setErrorMsg(res.error || 'Could not update password. Please request a new recovery link.');
        }
      } catch {
        setErrorMsg('An unexpected error occurred while updating your password.');
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    if (authMode === 'signup') {
      if (password.trim().length < 6) {
        setErrorMsg('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Passwords do not match. Please re-enter Confirm Password.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (authMode === 'signup') {
        const res = await registerSupabaseAccount(email, password, fullName, 'admin');
        if (res.success) {
          if (res.needsEmailConfirmation) {
            setSuccessMsg(
              `Account created for ${email.trim()}. Please check your email inbox to confirm your address before signing in.`
            );
            setConfirmPassword('');
            setAuthMode('signin');
          } else {
            setSuccessMsg(`Welcome, ${res.user?.name || email}! Redirecting to console...`);
            setTimeout(() => {
              navigate(fromPath, { replace: true });
            }, 300);
          }
        } else {
          setErrorMsg(res.error || 'Could not create Supabase account.');
        }
      } else {
        const result = await authenticate(email, password);
        if (result.success && result.user) {
          setSuccessMsg(`Welcome, ${result.user.name}! Redirecting to console...`);
          setTimeout(() => {
            navigate(fromPath, { replace: true });
          }, 300);
        } else {
          setErrorMsg(result.error || 'Invalid credentials. Please verify your email and password.');
        }
      }
    } catch {
      setErrorMsg('An unexpected error occurred during authentication. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const passwordsMatch = Boolean(confirmPassword && password === confirmPassword);

  return (
    <div className="relative overflow-hidden min-h-screen bg-slate-900 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 antialiased">
      <SEO
        title="Admin Portal Login | Santa Towing"
        description="Admin portal login for Santa Towing Ghana."
        noindex={true}
      />

      {/* Background ambient decorative glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#015557]/25 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#d80000]/15 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Brand Lockup */}
        <div className="text-center mb-6">
          <Link to="/" className="inline-block transition-transform hover:scale-105 mb-3">
            <div className="bg-white p-2.5 rounded-xl shadow-lg inline-block border border-slate-700">
              <img
                src={safeLogoUrl}
                alt={brandName}
                className="h-10 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
          </Link>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Admin Management Console
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            {brandName}
          </p>
        </div>

        {/* Card Container */}
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden p-6 sm:p-8">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#015557] flex items-center justify-center shrink-0 shadow-xs border border-emerald-100">
                {authMode === 'signin' && <Lock className="w-5 h-5" />}
                {authMode === 'signup' && <UserPlus className="w-5 h-5" />}
                {authMode === 'forgot' && <HelpCircle className="w-5 h-5" />}
                {authMode === 'recovery' && <ShieldCheck className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 leading-tight">
                  {authMode === 'signin' && 'Sign In to Console'}
                  {authMode === 'signup' && 'Create Admin Account'}
                  {authMode === 'forgot' && 'Forget Password Recovery'}
                  {authMode === 'recovery' && 'Set New Password'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {authMode === 'signin' && 'Enter your administrator credentials to continue'}
                  {authMode === 'signup' && 'Register a new administrator account'}
                  {authMode === 'forgot' && 'Recover your account via Email or Gmail'}
                  {authMode === 'recovery' && 'Choose and confirm your new password'}
                </p>
              </div>
            </div>
          </div>

          {/* Mode Tabs */}
          {supabaseEnabled && authMode !== 'recovery' && (
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl mb-5 border border-slate-200">
              <button
                type="button"
                onClick={() => handleSwitchMode('signin')}
                className={`py-2 px-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  authMode === 'signin'
                    ? 'bg-white text-[#015557] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => handleSwitchMode('signup')}
                className={`py-2 px-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                  authMode === 'signup'
                    ? 'bg-white text-[#015557] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {errorMsg && (
              <div
                role="alert"
                className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-[#d80000] flex items-start gap-2.5 animate-in fade-in"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-medium leading-relaxed">{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div
                role="status"
                className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2.5 animate-in fade-in"
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                <span className="font-medium leading-relaxed">{successMsg}</span>
              </div>
            )}

            {/* FORGET PASSWORD RECOVERY FLOW (Email & Gmail) */}
            {authMode === 'forgot' && (
              <div className="space-y-4">
                {!forgotSent ? (
                  <>
                    {/* Recovery Channel Selector: Email vs Gmail */}
                    <div className="space-y-1.5">
                      <span className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                        Recovery Method
                      </span>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setRecoveryChannel('email');
                            setErrorMsg('');
                          }}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            recoveryChannel === 'email'
                              ? 'border-[#015557] bg-emerald-50 text-[#015557] ring-1 ring-[#015557]'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <Mail className="w-3.5 h-3.5" />
                          <span>Email</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRecoveryChannel('gmail');
                            setErrorMsg('');
                          }}
                          className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            recoveryChannel === 'gmail'
                              ? 'border-[#015557] bg-emerald-50 text-[#015557] ring-1 ring-[#015557]'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <Mail className="w-3.5 h-3.5 text-[#d80000]" />
                          <span>Gmail</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="forgot-email"
                        className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                      >
                        {recoveryChannel === 'gmail' ? 'Registered Gmail Address' : 'Registered Email Address'}
                      </label>
                      <div className="relative">
                        <input
                          id="forgot-email"
                          type="email"
                          autoComplete="email"
                          value={forgotEmail}
                          onChange={(e) => setForgotEmail(e.target.value)}
                          maxLength={120}
                          placeholder={
                            recoveryChannel === 'gmail'
                              ? 'yourname@gmail.com'
                              : 'admin@santatowing.com'
                          }
                          required
                          disabled={isSubmitting}
                          className="w-full min-h-[46px] pl-10 pr-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#015557] focus-visible:border-[#015557] transition-all disabled:opacity-50"
                        />
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                        We will send a secure password reset link to your{' '}
                        {recoveryChannel === 'gmail' ? 'Gmail' : 'email'} inbox.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full min-h-[46px] px-4 py-2.5 bg-[#015557] hover:bg-[#014345] text-white font-semibold text-sm rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#015557]"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Sending Recovery Link...</span>
                        </span>
                      ) : (
                        <>
                          <span>
                            {recoveryChannel === 'gmail'
                              ? 'Send Recovery Link to Gmail'
                              : 'Send Recovery Link to Email'}
                          </span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2 leading-relaxed">
                      <p className="font-semibold text-slate-900">Next steps:</p>
                      <p>
                        Open the recovery email sent to <strong>{forgotEmail}</strong> and click the reset link to choose and confirm your new password.
                      </p>
                    </div>

                    {(recoveryChannel === 'gmail' || forgotEmail.toLowerCase().endsWith('@gmail.com')) && (
                      <a
                        href="https://mail.google.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full min-h-[44px] px-4 py-2.5 bg-[#015557] hover:bg-[#014345] text-white font-semibold text-xs sm:text-sm rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
                      >
                        <span>Open Gmail Inbox</span>
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setForgotSent(false);
                          setSuccessMsg('');
                          setErrorMsg('');
                        }}
                        className="min-h-[42px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                      >
                        Resend / Change Email
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSwitchMode('signin')}
                        className="min-h-[42px] px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
                      >
                        Back to Sign In
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SIGN IN, SIGN UP, AND SET NEW PASSWORD FLOWS */}
            {authMode !== 'forgot' && (
              <>
                {authMode === 'signup' && (
                  <div>
                    <label
                      htmlFor="admin-fullname"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                    >
                      Full Name
                    </label>
                    <div className="relative">
                      <input
                        id="admin-fullname"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        maxLength={80}
                        placeholder="Operations Manager"
                        required
                        disabled={isSubmitting}
                        className="w-full min-h-[46px] pl-10 pr-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#015557] focus-visible:border-[#015557] transition-all disabled:opacity-50"
                      />
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                )}

                {authMode !== 'recovery' && (
                  <div>
                    <label
                      htmlFor="admin-email"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                    >
                      Email Address
                    </label>
                    <div className="relative">
                      <input
                        id="admin-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        maxLength={120}
                        placeholder="name@santatowing.com or name@gmail.com"
                        required
                        disabled={isSubmitting}
                        className="w-full min-h-[46px] pl-10 pr-3.5 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#015557] focus-visible:border-[#015557] transition-all disabled:opacity-50"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Password Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="admin-password"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700"
                    >
                      {authMode === 'recovery' ? 'New Password' : 'Password'}
                    </label>
                    {authMode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => handleSwitchMode('forgot')}
                        className="text-xs text-[#015557] hover:underline font-semibold cursor-pointer"
                      >
                        Forget Password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="admin-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={128}
                      placeholder={
                        authMode === 'signup' || authMode === 'recovery'
                          ? 'Minimum 6 characters'
                          : '••••••••••••'
                      }
                      required
                      disabled={isSubmitting}
                      className="w-full min-h-[46px] pl-10 pr-11 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#015557] focus-visible:border-[#015557] transition-all disabled:opacity-50"
                    />
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Input (Create Account & Password Recovery Reset) */}
                {(authMode === 'signup' || authMode === 'recovery') && (
                  <div>
                    <label
                      htmlFor="admin-confirm-password"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                    >
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        id="admin-confirm-password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        maxLength={128}
                        placeholder="Re-enter your password"
                        required
                        disabled={isSubmitting}
                        className="w-full min-h-[46px] pl-10 pr-11 text-sm bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder:text-slate-400 hover:border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#015557] focus-visible:border-[#015557] transition-all disabled:opacity-50"
                      />
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-700 rounded-lg min-h-[40px] min-w-[40px] flex items-center justify-center transition-colors cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPassword && (
                      <p
                        className={`text-xs mt-1.5 flex items-center gap-1 font-medium ${
                          passwordsMatch ? 'text-emerald-700' : 'text-[#d80000]'
                        }`}
                      >
                        {passwordsMatch ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Passwords match.</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Passwords do not match.</span>
                          </>
                        )}
                      </p>
                    )}
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full min-h-[46px] px-4 py-2.5 bg-[#015557] hover:bg-[#014345] text-white font-semibold text-sm rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#015557]"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>
                        {authMode === 'signup' && 'Creating Account...'}
                        {authMode === 'signin' && 'Signing In...'}
                        {authMode === 'recovery' && 'Updating Password...'}
                      </span>
                    </span>
                  ) : (
                    <>
                      <span>
                        {authMode === 'signup' && 'Create Admin Account'}
                        {authMode === 'signin' && 'Sign In to Admin Console'}
                        {authMode === 'recovery' && 'Save New Password & Sign In'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </>
            )}
          </form>

          {/* Return link */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <Link
              to="/"
              className="hover:text-slate-900 transition-colors flex items-center gap-1 font-medium min-h-[38px]"
            >
              ← Back to public site
            </Link>

            <span className="text-[11px] text-slate-400">
              Session duration: 8 hours
            </span>
          </div>
        </div>

        {/* Footer info */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Santa Towing Administrative Portal &middot; 24/7 Operations Ghana
        </p>
      </div>
    </div>
  );
}
