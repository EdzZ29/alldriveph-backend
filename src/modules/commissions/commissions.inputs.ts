import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { BRANCH_CODES } from '../../common/constants';
import { Nullable, Optional } from '../../common/validation';

export class CommissionListArgs {
  @Optional() @IsIn(['unpaid', 'paid', 'all']) status?: string = 'all';
  /** staff and admins only; a branch owner always sees their own branch */
  @Nullable()
  @IsIn(BRANCH_CODES, { message: 'Unknown branch' })
  branch?: string | null;
  @Optional() @IsInt() page?: number = 1;
  @Optional() @IsInt() page_size?: number = 25;
}

export class CommissionSummaryArgs {
  @Nullable()
  @IsIn(BRANCH_CODES, { message: 'Unknown branch' })
  branch?: string | null;
}

/** Records that a branch owner paid everything their branch owes right now. */
export class SettleBranchArgs {
  @IsIn(BRANCH_CODES, { message: 'Unknown branch' })
  branch: string;

  @Nullable()
  @IsString()
  @MaxLength(300)
  payment_note?: string | null;
}

/** Records payment for one or several commissions. */
export class CommissionPaymentArgs {
  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one commission' })
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true, message: 'ids must be UUIDs' })
  ids: string[];

  @IsIn(['paid', 'unpaid'])
  status: 'paid' | 'unpaid';

  /** how it was paid, e.g. "GCash ref 1234 5678"; ignored when marking unpaid */
  @Nullable()
  @IsString()
  @MaxLength(300)
  payment_note?: string | null;
}
