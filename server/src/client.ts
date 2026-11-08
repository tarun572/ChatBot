export type ClientUser = {
  id: string;
  email: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export function normalizeToken(token: string | null): string | null {
  return token && token.trim() ? token : null;
}
