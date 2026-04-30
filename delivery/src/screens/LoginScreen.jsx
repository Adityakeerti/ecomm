import { useState } from 'react';
import { deliveryApi, setEmpToken } from '../api';

export default function LoginScreen({ onLogin }) {
  const [empId, setEmpId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handle = async (e) => {
    e.preventDefault();
    if (!empId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await deliveryApi.post('/auth/login', { emp_id: empId.trim() });
      const { token, emp } = res.data;
      setEmpToken(token);
      onLogin({ ...emp, empId: empId.trim() });
    } catch (err) {
      setError(err.response?.data?.message ?? 'Login failed. Check your EMP ID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-logo">
        CURATOR
        <span>Delivery Partner Portal</span>
      </div>

      <div className="login-card">
        <h2 style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: '0.375rem' }}>Good morning 👋</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          Enter your EMP ID to view your active batch.
        </p>

        <form onSubmit={handle}>
          <div className="field">
            <label>Employee ID</label>
            <input
              className="input"
              value={empId}
              onChange={e => setEmpId(e.target.value)}
              placeholder="EMP-AGR-0001"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>
          {error && <div className="error-msg" style={{ margin: '0 0 1rem' }}>{error}</div>}
          <button type="submit" disabled={loading} className="btn btn-primary btn-full" style={{ marginTop: '0.5rem', padding: '0.875rem' }}>
            {loading ? 'Signing in…' : 'Log In →'}
          </button>
        </form>
      </div>
    </div>
  );
}
