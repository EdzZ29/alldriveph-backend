import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsString,
  Length,
} from 'class-validator';

import { BRANCH_CODES } from '../../common/constants';
import { UserRole } from '../../common/enums';
import { Nullable, Optional } from '../../common/validation';

export class LoginRequest {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString()
  @Length(1, 128)
  password: string;
}

export class PasswordChange {
  @IsString()
  @Length(1, 128)
  current_password: string;

  @IsString()
  @Length(10, 128, { message: 'The new password must be 10 to 128 characters' })
  new_password: string;
}

export class UserInput {
  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @IsString() @Length(2, 120) full_name: string;

  @IsString()
  @Length(10, 128, { message: 'Passwords must be 10 to 128 characters' })
  password: string;

  @Optional()
  @IsEnum(UserRole)
  role?: UserRole;

  /** Required for a branch owner, ignored for admins and staff. */
  @Nullable()
  @IsIn(BRANCH_CODES, { message: 'Unknown branch' })
  branch?: string | null;
}

export class UserUpdateInput {
  @Optional()
  @IsString()
  @Length(2, 120)
  full_name?: string;

  @Nullable()
  @IsEnum(UserRole)
  role?: UserRole | null;

  @Nullable()
  @IsBoolean()
  is_active?: boolean | null;

  @Nullable()
  @IsString()
  @Length(10, 128, { message: 'Passwords must be 10 to 128 characters' })
  password?: string | null;

  @Nullable()
  @IsIn(BRANCH_CODES, { message: 'Unknown branch' })
  branch?: string | null;
}
