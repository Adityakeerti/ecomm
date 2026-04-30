export default function LoadingSpinner({ size = 36 }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem 0' }}>
      <div style={{
        width: size,
        height: size,
        border: `3px solid var(--surface-high)`,
        borderTop: `3px solid var(--primary)`,
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
