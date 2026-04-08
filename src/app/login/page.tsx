'use client';

import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { getClientAuth } from '@/lib/firebase/client';
import { useRouter } from 'next/navigation';
import { LogIn, Mail, Globe } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function exchangeTokenForSession(idToken: string) {
    const res = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || 'Session creation failed');
    }

    const data = await res.json();

    if (data.user.householdIds.length > 0) {
      router.push(`/h/${data.user.householdIds[0]}/dashboard`);
    } else {
      // No household — create one
      const createRes = await fetch('/api/households', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ name: 'Mi Hogar' }),
      });

      if (createRes.ok) {
        const household = await createRes.json();
        router.push(`/h/${household.household.id}/dashboard`);
      }
    }
  }

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const auth = getClientAuth();
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await cred.user.getIdToken();
      await exchangeTokenForSession(idToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError('');
    setLoading(true);

    try {
      const auth = getClientAuth();
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken();
      await exchangeTokenForSession(idToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error con Google');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <div className="w-full max-w-sm p-8 bg-bg-surface rounded-lg border border-border">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-text-primary">FinDash</h1>
          <p className="text-sm text-text-secondary mt-1">Finanzas del hogar</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-accent-negative/10 border border-accent-negative/20 rounded-md text-sm text-accent-negative">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs font-medium text-text-secondary uppercase mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-info focus:ring-offset-2 focus:ring-offset-bg-surface"
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-text-secondary uppercase mb-1">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent-info focus:ring-offset-2 focus:ring-offset-bg-surface"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-accent-info hover:bg-accent-info/90 text-white rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Mail className="w-4 h-4" />
            {loading ? 'Ingresando...' : 'Ingresar con email'}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="bg-bg-surface px-2 text-text-muted">o</span>
          </div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-bg-primary hover:bg-bg-surface-hover border border-border text-text-primary rounded-md text-sm font-medium disabled:opacity-50 transition-colors"
        >
          <Globe className="w-4 h-4" />
          Ingresar con Google
        </button>
      </div>
    </div>
  );
}
