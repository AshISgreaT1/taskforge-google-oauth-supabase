import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, Sparkles } from 'lucide-react';

export default function Signup() {
  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(59,130,246,0.2),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.16),_transparent_30%),linear-gradient(135deg,_#020617_0%,_#111827_100%)]" />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative z-10 w-full max-w-xl rounded-[2rem] border border-white/10 bg-slate-900/85 backdrop-blur-xl shadow-2xl p-8 md:p-10"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm text-slate-200 mb-6">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          Google-based onboarding
        </div>
        <div className="flex items-center gap-4 mb-6">
          <div className="h-14 w-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center">
            <UserPlus className="w-7 h-7 text-emerald-300" />
          </div>
          <div>
            <h1 className="text-3xl font-black">Create your workspace access</h1>
            <p className="text-slate-400 mt-1">Signup now happens through Google OAuth.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-300 space-y-3">
          <p>Use the sign-in page to authenticate with Google.</p>
          <p>On first login, your user record is created automatically in Supabase.</p>
          <p>After that, the same account opens the dashboard and team workspace.</p>
        </div>

        <div className="mt-8 flex flex-col sm:flex-row gap-3">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-full bg-white text-slate-950 font-semibold px-5 py-3 hover:bg-slate-100 transition-colors"
          >
            Go to Sign In
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-white font-semibold px-5 py-3 hover:bg-white/10 transition-colors"
          >
            Continue to Dashboard
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
