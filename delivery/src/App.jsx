import { useState } from 'react';
import './index.css';
import LoginScreen from './screens/LoginScreen';
import BatchScreen from './screens/BatchScreen';
import SummaryScreen from './screens/SummaryScreen';
import { getEmpToken } from './api';

/**
 * Delivery Portal — three screens rendered conditionally (no React Router).
 * Screen 1: Login  (emp === null)
 * Screen 2: Batch  (emp set, batch not complete)
 * Screen 3: Summary (batch complete)
 */
export default function App() {
  const [emp, setEmp] = useState(null); // { empId, token }
  const [batch, setBatch] = useState(null); // batch object from API
  const [screen, setScreen] = useState(
    getEmpToken() ? 'loading' : 'login'  // resume if token stored
  );
  const [summary, setSummary] = useState(null); // { delivered, failed }

  // Re-init from sessionStorage on mount
  if (screen === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--on-surface)' }}>
        <div className="spinner" style={{ borderTopColor: '#fff', borderColor: 'rgba(255,255,255,0.2)' }} />
      </div>
    );
  }

  if (screen === 'login') {
    return (
      <LoginScreen
        onLogin={(empData) => {
          setEmp(empData);
          setScreen('batch');
        }}
      />
    );
  }

  if (screen === 'batch') {
    return (
      <BatchScreen
        emp={emp}
        onComplete={(stats) => {
          setSummary(stats);
          setScreen('summary');
        }}
        onLogout={() => {
          setEmp(null);
          setBatch(null);
          setScreen('login');
        }}
      />
    );
  }

  if (screen === 'summary') {
    return (
      <SummaryScreen
        summary={summary}
        onLogout={() => {
          setEmp(null);
          setBatch(null);
          setSummary(null);
          setScreen('login');
        }}
      />
    );
  }
}
