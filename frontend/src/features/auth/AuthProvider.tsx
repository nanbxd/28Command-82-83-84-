import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, getToken, setToken } from '../../lib/api';

export type Profile = { id: string; name: string; email: string; phone: string; company: string; role: string };
type Session = { access_token: string; user: Profile };
type Auth = {
  user: Profile | null; loading: boolean; error: string;
  authenticate: (mode: 'login' | 'register', values: Record<string, string>) => Promise<void>;
  logout: () => Promise<void>; expire: () => void; refresh: () => Promise<void>;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!!getToken());
  const [error, setError] = useState('');
  const expire = () => { setToken(null); setUser(null); };
  async function refresh() {
    const initialToken = getToken();
    if (!initialToken) { setLoading(false); return; }
    setLoading(true); setError('');
    try { const profile = await api<Profile>('/auth/me'); if (getToken() === initialToken) setUser(profile); }
    catch (e) { if (getToken() === initialToken) { if (e instanceof ApiError && e.status === 401) expire(); else setError((e as Error).message); } }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);
  async function authenticate(mode: 'login' | 'register', values: Record<string, string>) {
    const session = await api<Session>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(values) });
    setToken(session.access_token); setUser(session.user); setError('');
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(e => { if (!(e instanceof ApiError && e.status === 401)) throw e; });
    expire();
  }
  return <Context.Provider value={{ user, loading, error, authenticate, logout, expire, refresh }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider required'); return value; }
