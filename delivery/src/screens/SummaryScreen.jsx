import { clearEmpToken } from '../api';

export default function SummaryScreen({ summary, onLogout }) {
  const { delivered = 0, failed = 0, total = 0 } = summary ?? {};

  const handleLogout = () => {
    clearEmpToken();
    onLogout();
  };

  return (
    <div className="summary-screen">
      <div className="icon summary-icon">🎉</div>
      <div className="summary">
        <h1>Batch Complete!</h1>
        <p>Great work. All stops have been handled.</p>

        <div className="summary-grid">
          <div className="summary-stat">
            <div className="val" style={{ color: '#34D399' }}>{delivered}</div>
            <div className="lbl">Delivered</div>
          </div>
          <div className="summary-stat">
            <div className="val" style={{ color: '#F87171' }}>{failed}</div>
            <div className="lbl">Failed</div>
          </div>
          <div className="summary-stat">
            <div className="val">{total}</div>
            <div className="lbl">Total Stops</div>
          </div>
          <div className="summary-stat">
            <div className="val" style={{ color: '#60A5FA' }}>{total > 0 ? Math.round((delivered / total) * 100) : 0}%</div>
            <div className="lbl">Success Rate</div>
          </div>
        </div>

        <p style={{ marginBottom: '0' }}>Your supervisor will review any failed deliveries.</p>
      </div>

      <button className="btn btn-ghost" style={{ marginTop: '2rem', padding: '0.875rem 2rem' }} onClick={handleLogout}>
        Sign Out
      </button>
    </div>
  );
}
