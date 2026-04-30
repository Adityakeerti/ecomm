import { createContext, useContext, useState, useCallback } from 'react';
import { authApi, setToken, clearToken } from '../lib/api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null); // { username, role }

  const login = useCallback(async (username, password) => {
    const res = await authApi.post('/login', { username, password });
    const { token, admin: a } = res.data;
    setToken(token);
    setAdmin(a ?? { username });
    return res.data;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setAdmin(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ admin, login, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
