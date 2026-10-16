import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNumber,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { Nullable, Optional } from '../../common/validation';
import { SLUG_MESSAGE, SLUG_PATTERN } from '../catalog/catalog.inputs';

const PARTIAL = { skipNullProperties: false } as const;

// ---------- list arguments ----------

/** `services` and `partners` arguments. */
export class ContentListArgs {
  /** Staff only: adds hidden rows. */
  @Optional() @IsBoolean() include_inactive?: boolean = false;
}

export class FaqListArgs extends ContentListArgs {
  @Nullable() @IsString() @MaxLength(60) category?: string | null;
}

export class SlugArgs {
  @IsString() @MaxLength(160) slug: string;
}

export class PostListArgs {
  @Optional() @IsInt() page?: number = 1;
  @Optional() @IsInt() page_size?: number = 9;
  @Nullable() @IsString() tag?: string | null;
  @Nullable() @IsString() q?: string | null;
  /** Staff only: every article, newest created first. */
  @Optional() @IsBoolean() include_drafts?: boolean = false;
}

export class MessageListArgs {
  @Optional() @IsInt() page?: number = 1;
  @Optional() @IsInt() page_size?: number = 20;
  @Optional() @IsBoolean() unread?: boolean = false;
}

// ---------- services ----------

export class ServiceInput {
  @Nullable()
  @MaxLength(120)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug?: string | null;

  @IsString() @Length(2, 120) title: string;
  @IsString() @Length(2, 300) summary: string;

  @Optional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @Optional()
  @IsString()
  @MaxLength(40)
  icon?: string;

  @Nullable()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999.99)
  price_from?: number | null;

  @Optional()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  highlights?: string[];

  @Optional() @IsInt() sort_order?: number;
  @Optional() @IsBoolean() is_active?: boolean;
}

export class ServiceUpdateInput extends PartialType(ServiceInput, PARTIAL) {}

// ---------- partners ----------

export class PartnerInput {
  @IsString() @Length(2, 120) name: string;
  @IsString() @Length(2, 60) category: string;

  @Optional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @Nullable()
  @IsString()
  @MaxLength(500)
  logo_url?: string | null;

  /** Optional wide photo or banner for the partner card. */
  @Nullable()
  @IsString()
  @MaxLength(500)
  image_url?: string | null;

  @Nullable()
  @IsString()
  @MaxLength(500)
  website_url?: string | null;

  @Optional() @IsInt() sort_order?: number;
  @Optional() @IsBoolean() is_active?: boolean;
}

export class PartnerUpdateInput extends PartialType(PartnerInput, PARTIAL) {}

// ---------- FAQs ----------

export class FaqInput {
  @IsString() @Length(5, 300) question: string;
  @IsString() @Length(2, 5000) answer: string;

  @Optional()
  @IsString()
  @MaxLength(60)
  category?: string;

  @Optional() @IsInt() sort_order?: number;
  @Optional() @IsBoolean() is_active?: boolean;
}

export class FaqUpdateInput extends PartialType(FaqInput, PARTIAL) {}

// ---------- blog ----------

export class BlogPostInput {
  @Nullable()
  @MaxLength(160)
  @Matches(SLUG_PATTERN, { message: SLUG_MESSAGE })
  slug?: string | null;

  @IsString() @Length(4, 200) title: string;
  @IsString() @Length(10, 400) excerpt: string;
  @IsString() @Length(10, 100_000) content: string;

  @Nullable()
  @IsString()
  @MaxLength(500)
  cover_image_url?: string | null;

  @Optional()
  @IsString()
  @MaxLength(120)
  author_name?: string;

  @Optional()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  tags?: string[];

  @Optional() @IsBoolean() is_published?: boolean;
}

export class BlogPostUpdateInput extends PartialType(BlogPostInput, PARTIAL) {}

// ---------- contact ----------

export class ContactInput {
  @IsString() @Length(2, 120) name: string;

  @IsEmail({}, { message: 'Enter a valid email address' })
  email: string;

  @Nullable()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @IsString() @Length(2, 160) subject: string;
  @IsString() @Length(10, 5000) message: string;

  /** Honeypot: real visitors never fill this in. */
  @Nullable()
  @IsString()
  @MaxLength(200)
  website?: string | null;
}

export class MessageUpdateArgs {
  @IsString() id: string;
  @IsBoolean() is_read: boolean;
}
