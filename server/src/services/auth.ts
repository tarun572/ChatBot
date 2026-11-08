import { AppError } from '../errors.ts';
import { passwordHasher, type PasswordHasher } from '../security/passwords.ts';
import { SimpleJwtSigner, type JwtSigner } from '../security/jwtSigner.ts';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
};

export type RegisterInput = {
  email: string;
  password: string;
};

export type AuthDependencies = {
  users: Map<string, User>;
  signer?: JwtSigner;
  hasher?: PasswordHasher;
  clock?: () => number;
};

export class AuthService {
  private readonly users: Map<string, User>;
  private readonly signer: JwtSigner;
  private readonly hasher: PasswordHasher;
  private readonly clock: () => number;

  constructor({ users, signer, hasher, clock }: AuthDependencies) {
    this.users = users;
    this.signer = signer ?? new SimpleJwtSigner('development-secret');
    this.hasher = hasher ?? passwordHasher;
    this.clock = clock ?? (() => Date.now());
  }

  async register(input: RegisterInput): Promise<{ user: User; token: string }> {
    const email = input.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      throw new AppError(400, 'invalid_email', 'Email is invalid');
    }

    if (input.password.length < 8) {
      throw new AppError(400, 'invalid_password', 'Password must be at least 8 characters');
    }

    if (this.users.has(email)) {
      throw new AppError(409, 'user_exists', 'A user with that email already exists');
    }

    const user: User = {
      id: `user-${this.users.size + 1}`,
      email,
      passwordHash: this.hasher.hash(input.password),
      createdAt: new Date(this.clock()).toISOString(),
    };

    this.users.set(email, user);

    return {
      user,
      token: this.signer.sign(user.id),
    };
  }

  async login(input: RegisterInput): Promise<{ user: User; token: string }> {
    const email = input.email.trim().toLowerCase();
    const user = this.users.get(email);

    if (!user || !this.hasher.verify(input.password, user.passwordHash)) {
      throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
    }

    return {
      user,
      token: this.signer.sign(user.id),
    };
  }

  async me(token: string): Promise<User> {
    const userId = this.signer.verify(token);
    if (!userId) {
      throw new AppError(401, 'invalid_token', 'Authentication token is invalid');
    }

    const user = Array.from(this.users.values()).find((entry) => entry.id === userId);
    if (!user) {
      throw new AppError(404, 'user_not_found', 'User not found');
    }

    return user;
  }
}
