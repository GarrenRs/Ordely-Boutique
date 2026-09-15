export type AppSession = {
  userId?: number;
  storeId?: number;
  email?: string;
  storeName?: string;
  providerUserId?: number;
  providerEmail?: string;
  providerName?: string;
  destroy(callback: () => void): void;
};

export type AppRequest = {
  params: Record<string, any>;
  query: Record<string, any>;
  body: Record<string, any>;
  session: AppSession;
};

export type AppResponse = {
  status(code: number): AppResponse;
  json(body: unknown): AppResponse;
  send(body?: unknown): AppResponse;
  set(field: string, value: string): AppResponse;
  clearCookie(name: string): AppResponse;
};

export type AppNextFunction = (error?: unknown) => void;
