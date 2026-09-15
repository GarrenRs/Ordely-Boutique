import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface ProviderUser {
  id: number;
  email: string;
  name: string;
}

interface ProviderAuthContextValue {
  user: ProviderUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const ProviderAuthContext = createContext<ProviderAuthContextValue | null>(null);

function readProviderUser(data: unknown): ProviderUser | null {
  if (!data || typeof data !== "object") return null;
  return ((data as { user?: ProviderUser | null }).user) ?? null;
}

export function ProviderAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ProviderUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await fetch("/api/provider/auth/me", { credentials: "include", cache: "no-store" });
      if (res.ok) setUser(readProviderUser(await res.json()));
      else setUser(null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch("/api/provider/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? "فشل تسجيل الدخول");
    }
    const data = await res.json();
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/provider/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  return (
    <ProviderAuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </ProviderAuthContext.Provider>
  );
}

export function useProviderAuth(): ProviderAuthContextValue {
  const ctx = useContext(ProviderAuthContext);
  if (!ctx) throw new Error("useProviderAuth must be used within ProviderAuthProvider");
  return ctx;
}
