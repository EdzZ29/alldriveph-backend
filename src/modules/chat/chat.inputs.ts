import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';

import { Nullable, Optional } from '../../common/validation';

const LANGS = ['en', 'fil', 'ceb', 'ko', 'ja', 'zh', 'es'];
const MESSAGE = { message: 'Messages can be 1 to 2000 characters' };

/** A visitor's first message, which opens the conversation. */
export class ChatStartArgs {
  @IsString() @Length(1, 2000, MESSAGE) message: string;
  @Optional() @IsIn(LANGS) lang?: string = 'en';
  @Nullable() @IsString() @MaxLength(300) page?: string | null;
}

/** Identifies the visitor's own conversation: its id and the secret their browser keeps. */
export class ChatAccessArgs {
  @IsUUID('all', { message: 'id must be a UUID' }) id: string;
  @IsString() @Length(20, 100) token: string;
}

export class ChatSendArgs extends ChatAccessArgs {
  @IsString() @Length(1, 2000, MESSAGE) message: string;
}

export class ChatListArgs {
  @Optional() @IsIn(['open', 'closed', 'all']) status?: string = 'open';
  @Optional() @IsInt() page?: number = 1;
  @Optional() @IsInt() page_size?: number = 50;
}

export class ChatReplyArgs {
  @IsUUID('all', { message: 'id must be a UUID' }) id: string;
  @IsString() @Length(1, 2000, MESSAGE) message: string;
}

export class ChatStatusArgs {
  @IsUUID('all', { message: 'id must be a UUID' }) id: string;
  @IsIn(['open', 'closed']) status: 'open' | 'closed';
}
