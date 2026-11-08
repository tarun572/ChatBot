export type JwtSigner = {
  sign(userId: string): string;
  verify(token: string): string | null;
};

export class SimpleJwtSigner implements JwtSigner {
  constructor(private readonly secret: string) {}

  sign(userId: string): string {
    return `jwt:${this.secret}:${userId}`;
  }

  verify(token: string): string | null {
    const prefix = 'jwt:';
    if (!token.startsWith(prefix)) {
      return null;
    }

    const parts = token.split(':');
    if (parts.length < 3) {
      return null;
    }

    const claimedSecret = parts[1];
    if (claimedSecret !== this.secret) {
      return null;
    }

    return parts.slice(2).join(':');
  }
}
