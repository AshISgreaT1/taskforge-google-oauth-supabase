import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const GOOGLE_SCRIPT_ID = 'google-identity-script';

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve(window.google);
      return;
    }

    if (document.getElementById(GOOGLE_SCRIPT_ID)) {
      const check = setInterval(() => {
        if (window.google?.accounts?.id) {
          clearInterval(check);
          resolve(window.google);
        }
      }, 50);
      return;
    }

    const script = document.createElement('script');
    script.id = GOOGLE_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function Login() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const buttonRef = useRef(null);
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const hasGoogleClientId = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  useEffect(() => {
    console.log('Login.jsx: VITE_GOOGLE_CLIENT_ID =', import.meta.env.VITE_GOOGLE_CLIENT_ID);
    console.log('Login.jsx: VITE env keys =', Object.keys(import.meta.env).filter((key) => key.startsWith('VITE_')));

    let mounted = true;

    const init = async () => {
      try {
        if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
          setError('Google OAuth client ID is not configured for local development.');
          return;
        }
        await loadGoogleScript();
        if (!mounted || !window.google?.accounts?.id || !buttonRef.current) return;

        window.google.accounts.id.initialize({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: async (response) => {
            try {
              setLoading(true);
              setError('');
              await googleLogin(response.credential);
              navigate('/dashboard');
            } catch (err) {
              setError(err.response?.data?.message || 'Google sign in failed. Please try again.');
            } finally {
              setLoading(false);
            }
          }
        });

        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: document.documentElement.classList.contains('dark') ? 'filled_black' : 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'pill',
          width: 320
        });
      } catch (err) {
        setError('Google sign in could not be loaded.');
      }
    };

    init();
    return () => {
      mounted = false;
    };
  }, [googleLogin, navigate]);

  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.14),_transparent_28%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)]" />
      <div className="absolute inset-0 opacity-30 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-5xl grid lg:grid-cols-[1.15fr_0.85fr] gap-8 items-center"
      >
        <div className="space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-slate-200">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Production-ready task ops for growing teams
          </div>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[0.95]">
            Task management that feels like a startup dashboard.
          </h1>
          <p className="text-lg text-slate-300 max-w-xl">
            Sign in with Google to manage tasks, assignments, activity, and team performance from one clean workspace.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl">
            {[
              ['OAuth', 'Google Sign-In'],
              ['DB', 'Supabase Postgres'],
              ['Alerts', 'Gmail SMTP']
            ].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.25em] text-slate-400">{k}</p>
                <p className="mt-2 font-semibold">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative">
          <div className="absolute -inset-1 rounded-[2rem] bg-gradient-to-br from-cyan-500/20 via-emerald-500/10 to-transparent blur-2xl" />
          <div className="relative rounded-[2rem] border border-white/10 bg-slate-900/85 backdrop-blur-xl shadow-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-12 w-12 rounded-2xl bg-cyan-500/15 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-cyan-300" />
              </div>
              <div>
                <p className="text-sm text-slate-400">Welcome back</p>
                <h2 className="text-2xl font-bold">Sign in to TaskForge</h2>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div ref={buttonRef} className="flex justify-center min-h-[44px]" />
              <button
                type="button"
                onClick={() => window.google?.accounts?.id?.prompt()}
                disabled={loading || !hasGoogleClientId}
                className="w-full rounded-full bg-white text-slate-950 font-semibold px-4 py-3 hover:bg-slate-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Continue with Google
              </button>
            </div>

            {!hasGoogleClientId && (
              <p className="mt-3 text-sm text-amber-300">
                Add `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` to enable Google sign-in locally.
              </p>
            )}

            <p className="mt-6 text-sm text-slate-400">
              By continuing, you agree to the platform terms and team workspace access policies.
            </p>

            <p className="mt-8 text-sm text-slate-400">
              New here?{' '}
              <Link to="/signup" className="text-cyan-300 hover:text-cyan-200 font-medium">
                Go to signup
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
