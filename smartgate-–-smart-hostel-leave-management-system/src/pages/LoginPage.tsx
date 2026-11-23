import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  LogIn,
  UserPlus,
  Info,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiRequest } from '../services/api';
import { ROLE_HOME_ROUTES } from '../utils/formatters';
import { RegistrationForm } from './RegistrationForm';

function SmartGateShieldEmblem({
  variant = 'light',
  className = 'w-14 h-16',
}: {
  variant?: 'light' | 'navy';
  className?: string;
}) {
  const shieldFill = variant === 'light' ? '#FFFFFF' : '#06265E';
  const innerStroke = variant === 'light' ? '#06265E' : '#FFFFFF';

  return (
    <svg
      viewBox="0 0 64 74"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Graduation Cap Top + Shield Body */}
      <path
        d="M32 3L58 14.5V35.5C58 51.8 46.7 64.6 32 70.5C17.3 64.6 6 51.8 6 35.5V14.5L32 3Z"
        fill={shieldFill}
      />
      {/* Cap brim & tassel */}
      <path d="M32 9.5L47 15.8L32 22.1L17 15.8L32 9.5Z" fill={innerStroke} />
      <path
        d="M23 19.2V23.8C23 25.3 27 26.8 32 26.8C37 26.8 41 25.3 41 23.8V19.2"
        stroke={innerStroke}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path d="M45 16.5V23.5" stroke={innerStroke} strokeWidth="2" strokeLinecap="round" />

      {/* QR Code Matrix inside shield */}
      <rect x="20" y="31" width="9" height="9" rx="1.2" stroke={innerStroke} strokeWidth="2.2" />
      <rect x="23.2" y="34.2" width="2.6" height="2.6" fill={innerStroke} />
      <rect x="35" y="31" width="9" height="9" rx="1.2" stroke={innerStroke} strokeWidth="2.2" />
      <rect x="38.2" y="34.2" width="2.6" height="2.6" fill={innerStroke} />
      <rect x="20" y="45" width="9" height="9" rx="1.2" stroke={innerStroke} strokeWidth="2.2" />
      <rect x="23.2" y="48.2" width="2.6" height="2.6" fill={innerStroke} />

      <rect x="31" y="33" width="2.2" height="4" fill={innerStroke} />
      <rect x="31" y="41" width="4" height="2.4" fill={innerStroke} />
      <rect x="22" y="41.2" width="6" height="2.2" fill={innerStroke} />
      <rect x="35" y="43" width="3" height="3" fill={innerStroke} />
      <rect x="40.5" y="43" width="3.5" height="3" fill={innerStroke} />
      <rect x="35" y="48.5" width="3" height="5.5" fill={innerStroke} />
      <rect x="40.5" y="48.5" width="3.5" height="2.6" fill={innerStroke} />
      <rect x="40.5" y="52.2" width="3.5" height="2.3" fill={innerStroke} />
    </svg>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [authTab, setAuthTab] = useState<'SIGN_IN' | 'REGISTER'>('SIGN_IN');

  // Sign-In state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState('');

  const [campusImgFailed, setCampusImgFailed] = useState(false);
  const [activationToken, setActivationToken] = useState(
    new URLSearchParams(window.location.search).get('activate') || ''
  );
  const [activationPassword, setActivationPassword] = useState('');
  const [activationConfirm, setActivationConfirm] = useState('');
  const [activationSubmitting, setActivationSubmitting] = useState(false);
  const [activationMessage, setActivationMessage] = useState('');

  useEffect(() => {
    if (user) {
      navigate(ROLE_HOME_ROUTES[user.role], { replace: true });
    }
  }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter both your institutional email and password.');
      return;
    }

    setSubmitting(true);
    try {
      const loggedIn = await login(email.trim(), password, rememberMe);
      showToast(`Signed in as ${loggedIn.name}`, 'success');
      navigate(ROLE_HOME_ROUTES[loggedIn.role], { replace: true });
    } catch (err) {
      setError((err as Error).message || 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) return;
    setForgotSubmitting(true);
    setForgotMessage('');
    try {
      const res = await apiRequest<{ message: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      setForgotMessage(res.message);
      showToast('Password reset request submitted.', 'info');
    } catch (err) {
      setForgotMessage((err as Error).message);
    } finally {
      setForgotSubmitting(false);
    }
  };

  const handleAuthorityActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    setActivationMessage('');
    if (
      activationPassword.length < 8 ||
      !/[A-Z]/.test(activationPassword) ||
      !/[a-z]/.test(activationPassword) ||
      !/[0-9]/.test(activationPassword) ||
      !/[^A-Za-z0-9]/.test(activationPassword)
    ) {
      setActivationMessage(
        'Password must be 8+ characters and include uppercase, lowercase, number, and special character.'
      );
      return;
    }
    if (activationPassword !== activationConfirm) {
      setActivationMessage('Password and Confirm Password do not match.');
      return;
    }

    setActivationSubmitting(true);
    try {
      const res = await apiRequest<{ message: string }>(`/auth/activate/${encodeURIComponent(activationToken)}`, {
        method: 'POST',
        body: JSON.stringify({
          password: activationPassword,
          confirmPassword: activationConfirm,
        }),
      });
      showToast(res.message, 'success');
      setActivationToken('');
      window.history.replaceState({}, '', '/login');
    } catch (err) {
      setActivationMessage((err as Error).message);
    } finally {
      setActivationSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-hex-pattern overflow-x-hidden">
      {/* Left-Side Dark Navy-Blue Branding Column with Sweeping Curves & Campus Photo */}
      <aside className="relative lg:w-[49%] xl:w-[48%] bg-gradient-to-br from-[#021438] via-[#062969] to-[#0a4194] text-white flex flex-col justify-between overflow-hidden shrink-0">
        {/* Subtle Flowing Navy Waves Background */}
        <svg
          aria-hidden="true"
          viewBox="0 0 600 420"
          preserveAspectRatio="none"
          className="pointer-events-none absolute top-0 left-0 w-full h-96 opacity-35"
        >
          <path
            d="M0,0 L420,0 C310,125 185,115 95,215 C45,270 18,335 0,380 Z"
            fill="#0a4499"
          />
          <path
            d="M280,0 L600,0 L600,260 C475,210 385,120 280,0 Z"
            fill="#031a47"
          />
        </svg>

        {/* Curved White/Ice Separation on Desktop Right Edge */}
        <svg
          aria-hidden="true"
          viewBox="0 0 110 900"
          preserveAspectRatio="none"
          className="hidden lg:block pointer-events-none absolute top-0 right-0 h-full w-16 xl:w-20 text-[#eef4fc] z-30"
        >
          <path
            d="M110,0 L110,900 L18,900 C62,720 68,540 34,360 C5,205 25,85 88,0 Z"
            fill="currentColor"
          />
        </svg>

        {/* Top & Middle Copy */}
        <div className="relative z-10 px-7 sm:px-12 lg:pl-14 lg:pr-20 pt-10 sm:pt-12 pb-6 space-y-8">
          {/* Logo Lockup */}
          <div className="flex items-center gap-4">
            <SmartGateShieldEmblem variant="light" className="w-16 h-18 shrink-0 drop-shadow-md" />
            <div>
              <div
                className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-none"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                <span className="text-white">Smart</span>
                <span className="text-[#38bdf8]">Gate</span>
              </div>
              <p className="mt-1.5 text-sm sm:text-base font-medium text-blue-100/95 leading-snug max-w-xs">
                Smart Hostel Leave Management with QR Pass Generator
              </p>
            </div>
          </div>

          {/* Core Headline & Description */}
          <div className="space-y-3 max-w-md pt-2">
            <h1
              className="text-2xl sm:text-3xl font-bold tracking-tight text-white leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Secure. Smart. Seamless.
            </h1>
            <p className="text-sm sm:text-[15px] text-blue-100/90 leading-relaxed">
              Manage your hostel leave applications, track approvals, and get your QR pass – all in
              one place.
            </p>
          </div>
        </div>

        {/* Bottom Campus Photograph with Top Blend & Sweeping Curved Bottom Wave */}
        <div className="relative z-10 mt-auto w-full pt-2">
          <div className="relative w-full h-64 sm:h-72 lg:h-[310px] overflow-hidden">
            {!campusImgFailed ? (
              <img
                src="/assets/aistudio/image_1e83cfdf.png"
                alt="Campus main academic building and landscaped lawn"
                referrerPolicy="no-referrer"
                onError={() => setCampusImgFailed(true)}
                className="w-full h-full object-cover object-center block"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#062969] to-[#021438] flex items-center justify-center text-blue-200 text-xs">
                SmartGate Partner Campus
              </div>
            )}

            {/* Smooth top scrim blending into navy panel */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#073177] via-[#073177]/65 to-transparent"
            />

            {/* Sweeping Bottom Navy Curve & Royal Blue Ribbon */}
            <svg
              aria-hidden="true"
              viewBox="0 0 800 130"
              preserveAspectRatio="none"
              className="pointer-events-none absolute bottom-0 left-0 w-full h-20 sm:h-24 z-20"
            >
              <path
                d="M0,40 C160,115 360,105 560,32 C665,-6 745,25 800,72 L800,130 L0,130 Z"
                fill="#032158"
              />
              <path
                d="M0,40 C160,115 360,105 560,32 C665,-6 745,25 800,72"
                fill="none"
                stroke="#1d6ce0"
                strokeWidth="7"
              />
            </svg>
          </div>
        </div>
      </aside>

      {/* Right-Side Authentication Card Area */}
      <main className="flex-1 flex items-center justify-center p-5 sm:p-8 lg:p-10">
        <div className="w-full max-w-[680px] max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-[26px] border border-slate-200/80 shadow-[0_20px_55px_-15px_rgba(12,35,84,0.14)] p-6 sm:p-8 space-y-5">
          {/* Card Header Centered */}
          <div className="text-center space-y-1.5">
            <div className="flex justify-center pb-1">
              <SmartGateShieldEmblem variant="navy" className="w-12 h-14" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
              Welcome to <span className="text-[#2563eb]">SmartGate</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500">
              Sign in to access your dashboard or create a new account.
            </p>
          </div>

          {/* Pill Tabs: Sign In | Register */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-2 p-1 bg-[#eef3fb] rounded-full"
          >
            <button
              type="button"
              role="tab"
              aria-selected={authTab === 'SIGN_IN'}
              onClick={() => {
                setAuthTab('SIGN_IN');
                setError('');
              }}
              className={`inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold rounded-full transition-all whitespace-nowrap shrink-0 ${
                authTab === 'SIGN_IN'
                  ? 'bg-[#04245c] text-white shadow-sm'
                  : 'text-[#0b2a5e] hover:text-[#04245c]'
              }`}
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authTab === 'REGISTER'}
              onClick={() => {
                setAuthTab('REGISTER');
                setError('');
              }}
              className={`inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs sm:text-sm font-semibold rounded-full transition-all whitespace-nowrap shrink-0 ${
                authTab === 'REGISTER'
                  ? 'bg-[#04245c] text-white shadow-sm'
                  : 'text-[#0b2a5e] hover:text-[#04245c]'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Register</span>
            </button>
          </div>

          {activationToken ? (
            <form onSubmit={handleAuthorityActivation} className="space-y-3.5">
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-xs text-amber-900">
                Set a secure password to activate your SmartGate authority account.
              </div>
              {activationMessage && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl px-3.5 py-2.5">
                  {activationMessage}
                </div>
              )}
              <input
                type="password"
                required
                value={activationPassword}
                onChange={(e) => setActivationPassword(e.target.value)}
                placeholder="New password"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
              <input
                type="password"
                required
                value={activationConfirm}
                onChange={(e) => setActivationConfirm(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl"
              />
              <button type="submit" disabled={activationSubmitting} className="w-full px-4 py-3 text-sm font-semibold text-white bg-[#04245c] rounded-full disabled:opacity-60">
                {activationSubmitting ? 'Activating...' : 'Activate Authority Account'}
              </button>
            </form>
          ) : authTab === 'SIGN_IN' ? (
            <div className="space-y-4">
              {error && (
                <div
                  role="alert"
                  className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl px-3.5 py-2.5"
                >
                  {error}
                </div>
              )}

              {/* Sign-In Form */}
              <form onSubmit={handleSignIn} className="space-y-3.5">
                <div>
                  <label htmlFor="login-email" className="sr-only">
                    Institutional Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#f8fafc] focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="sr-only">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full pl-10 pr-11 py-2.5 text-sm bg-[#f8fafc] focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-xs pt-0.5">
                  <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer select-none font-medium">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-[#04245c] focus:ring-blue-600"
                    />
                    <span>Remember me</span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email);
                      setForgotMessage('');
                      setForgotOpen(true);
                    }}
                    className="font-semibold text-[#2563eb] hover:text-[#1d4ed8] hover:underline whitespace-nowrap shrink-0"
                  >
                    Forgot Password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-white bg-[#04245c] hover:bg-[#06327d] rounded-full transition-colors shadow-sm disabled:opacity-60 whitespace-nowrap"
                >
                  <LogIn className="w-4 h-4" />
                  <span>{submitting ? 'Signing in...' : 'Sign In'}</span>
                </button>
              </form>

              <div className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#eff5fd] border border-[#dbeafe] text-xs text-[#0b2a5e] font-medium">
                <Info className="w-4 h-4 text-[#2563eb] shrink-0" />
                <span>All public account types can sign in immediately after successful registration.</span>
              </div>
            </div>
          ) : (
            <RegistrationForm onSignIn={() => setAuthTab('SIGN_IN')} />
          )}
        </div>
      </main>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="forgot-title"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 id="forgot-title" className="text-base font-bold text-slate-900">
                Reset Institutional Password
              </h3>
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                aria-label="Close modal"
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Enter your registered institutional email address to notify the System Administrator
              for credential recovery.
            </p>

            {forgotMessage && (
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900">
                {forgotMessage}
              </div>
            )}

            <form onSubmit={handleForgotSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Institutional Email
                </label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="name@institution.edu"
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={forgotSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#04245c] hover:bg-[#06327d] rounded-lg disabled:opacity-60"
                >
                  {forgotSubmitting ? 'Submitting...' : 'Request Reset'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
