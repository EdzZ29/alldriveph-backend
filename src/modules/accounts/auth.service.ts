import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';

import { settings } from '../../config/settings';
import { User } from '../../entities/user.entity';

interface TokenPayload {
  sub: string;
  role: string;
  exp?: number;
}

@Injectable()
export class AuthService {
  // used to keep login timing similar whether or not the email exists
  private readonly dummyHash = bcrypt.hashSync('timing-safe-placeholder', 12);

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  async verifyPassword(
    password: string,
    hashed: string | undefined,
  ): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hashed ?? this.dummyHash);
    } catch {
      return false;
    }
  }

  /** HS256 token with sub, role, iat, exp and iss, the same claims the old API issued. */
  createToken(user: User): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn: settings.accessTokenExpireMinutes * 60 },
    );
  }

  async userFromToken(token: string): Promise<User | null> {
    let payload: TokenPayload;
    try {
      payload = await this.jwt.verifyAsync<TokenPayload>(token);
    } catch {
      return null;
    }
    if (!payload.sub || !payload.exp) return null;
    const user = await this.users
      .findOne({ where: { id: payload.sub } })
      .catch(() => null);
    return user?.is_active ? user : null;
  }
}
