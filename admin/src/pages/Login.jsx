import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form.username, form.password);
      navigate('/');
    } catch (err) {
      toast(err.response?.data?.message || 'Login failed. Check credentials.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--on-surface)',
    }}>
      {/* Blue glow */}
      <div style={{
        position: 'fixed', top: '-20%', right: '-10%',
        width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(46,91,255,0.2) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: '400px', padding: '1rem' }}>
        <div className="card">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '0.18em', color: 'var(--on-surface)' }}>CURATOR</h1>
            <p style={{ color: 'var(--outline)', fontSize: '0.875rem', marginTop: '0.25rem' }}>Admin Portal</p>
          </div>

          <form onSubmit={handle}>
            <div className="field">
              <label>Username</label>
              <input className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="admin" required />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" required />
            </div>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' }}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
