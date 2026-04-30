import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function PrivateRoute({ children }) {
  const { admin } = useAuth();
  if (!admin) return <Navigate to="/login" replace />;
  return children;
}
