import { createContext, useContext, useEffect, useState } from "react";
import { api, setTokens, setOnUnauth, User } from "./api";

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (ad: string, pin: string) => Promise<void>;
  logout: () => void;
};

const C = createContext<Ctx>(null!);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setOnUnauth(() => {
      setUser(null);
      setTokens(null, null);
    });
    const t = localStorage.getItem("rw_token");
    if (!t) { setLoading(false); return; }
    api.me().then(setUser).catch(() => setTokens(null, null)).finally(() => setLoading(false));
  }, []);

  async function login(ad: string, pin: string) {
    const r = await api.login(ad, pin);
    setTokens(r.access_token, r.refresh_token);
    setUser({ id: r.user_id, ad: r.ad, rol: r.rol, aktif: true });
  }

  function logout() {
    setTokens(null, null);
    setUser(null);
  }

  return <C.Provider value={{ user, loading, login, logout }}>{children}</C.Provider>;
}

export const useAuth = () => useContext(C);
