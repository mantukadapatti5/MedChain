import { createContext, useContext, useState, useCallback } from "react";
import { api } from "../api/api";

const AuthContext = createContext(null);

const STORAGE_TOKEN = "medchain_token";
const STORAGE_USER = "medchain_user";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = sessionStorage.getItem(STORAGE_USER);
    return raw ? JSON.parse(raw) : null;
  });
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (email, password, role) => {
    setLoading(true);
    setAuthError("");
    try {
      const data = await api.login({ email, password, role });
      sessionStorage.setItem(STORAGE_TOKEN, data.token);
      sessionStorage.setItem(STORAGE_USER, JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } catch (err) {
      setAuthError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_TOKEN);
    sessionStorage.removeItem(STORAGE_USER);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, authError, setAuthError, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
