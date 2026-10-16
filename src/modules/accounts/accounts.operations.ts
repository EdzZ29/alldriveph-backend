import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { isUniqueViolation } from '../../common/crud.service';
import { UserRole } from '../../common/enums';
import { AppError, invalidInput, notFound } from '../../common/errors';
import { read, write, type Operations } from '../../common/operations';
import { defined } from '../../common/utils';
import { idAndInput, inputArg, validateArgs } from '../../common/validation';
import { userView } from '../../common/views';
import { settings } from '../../config/settings';
import { User } from '../../entities/user.entity';
import {
  LoginRequest,
  PasswordChange,
  UserInput,
  UserUpdateInput,
} from './accounts.inputs';
import { AuthService } from './auth.service';

/** A branch owner must have a branch; admins and staff never keep one. */
function ownerBranch(
  role: UserRole,
  branch: string | null | undefined,
): string | null {
  if (role !== UserRole.owner) return null;
  if (!branch)
    throw invalidInput('Choose the branch this owner manages', 'branch');
  return branch;
}

@Injectable()
export class AccountOperations {
  constructor(
    private readonly auth: AuthService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  readonly operations: Operations = {
    /** The signed in staff member, or null when signed out. */
    me: read(async (ctx) => {
      const user = await ctx.user();
      return user && userView(user);
    }),

    /** Admin only. */
    users: read(async (ctx) => {
      await ctx.requireAdmin();
      const rows = await this.users.find({ order: { created_at: 'ASC' } });
      return rows.map(userView);
    }),

    /** Signs in and sets the httpOnly session cookie. */
    login: write(async (ctx, args) => {
      await ctx.rateLimit(settings.rateLimitAuth, 'login');
      const payload = await validateArgs(LoginRequest, args);
      const user = await this.users
        .createQueryBuilder('user')
        .where('LOWER(user.email) = :email', {
          email: payload.email.toLowerCase(),
        })
        .getOne();
      const valid = await this.auth.verifyPassword(
        payload.password,
        user?.hashed_password,
      );
      if (!user || !valid)
        throw new AppError(401, 'Incorrect email or password');
      if (!user.is_active) throw new AppError(403, 'This account is disabled');

      user.last_login_at = new Date();
      await this.users.save(user);

      const token = await this.auth.createToken(user);
      void ctx.reply.setCookie(settings.authCookieName, token, {
        maxAge: settings.accessTokenExpireMinutes * 60,
        httpOnly: true,
        secure: settings.isProduction,
        sameSite: 'lax',
        domain: settings.cookieDomain,
        path: '/',
      });
      return {
        access_token: token,
        token_type: 'bearer',
        expires_in: settings.accessTokenExpireMinutes * 60,
        user: userView(user),
      };
    }),

    /** Clears the session cookie. */
    logout: write((ctx) => {
      void ctx.reply.clearCookie(settings.authCookieName, {
        domain: settings.cookieDomain,
        path: '/',
      });
      return { message: 'Signed out' };
    }),

    change_password: write(async (ctx, args) => {
      await ctx.rateLimit(settings.rateLimitAuth, 'change_password');
      const me = await ctx.requireUser();
      const payload = await validateArgs(PasswordChange, args);
      if (
        !(await this.auth.verifyPassword(
          payload.current_password,
          me.hashed_password,
        ))
      ) {
        throw new AppError(400, 'Current password is incorrect');
      }
      await this.users.update(
        { id: me.id },
        { hashed_password: await this.auth.hashPassword(payload.new_password) },
      );
      return { message: 'Password updated' };
    }),

    /** Admin only. */
    create_user: write(async (ctx, args) => {
      await ctx.requireAdmin();
      const input = await inputArg(args, UserInput);
      const role = input.role ?? UserRole.staff;
      const user = this.users.create({
        email: input.email.toLowerCase(),
        full_name: input.full_name.trim(),
        hashed_password: await this.auth.hashPassword(input.password),
        role,
        branch: ownerBranch(role, input.branch),
      });
      try {
        return userView(await this.users.save(user));
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(409, 'A user with that email already exists');
        }
        throw error;
      }
    }),

    /** Admin only. */
    update_user: write(async (ctx, args) => {
      const admin = await ctx.requireAdmin();
      const { id, input } = await idAndInput(args, UserUpdateInput);
      const user = await this.users.findOne({ where: { id } });
      if (!user) throw notFound('User');
      if (
        user.id === admin.id &&
        (input.is_active === false || (input.role && input.role !== user.role))
      ) {
        throw new AppError(
          400,
          'You cannot demote or disable your own account',
        );
      }
      const { password, full_name, role, is_active, branch } = defined(input);
      if (password)
        user.hashed_password = await this.auth.hashPassword(password);
      if (full_name) user.full_name = full_name.trim();
      if (role) user.role = role;
      if (typeof is_active === 'boolean') user.is_active = is_active;
      if (role || branch !== undefined)
        user.branch = ownerBranch(user.role, branch ?? user.branch);
      return userView(await this.users.save(user));
    }),
  };
}
