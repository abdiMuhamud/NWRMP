import { IsIn, IsObject, IsOptional, IsString, IsUUID, MaxLength, ValidateIf } from 'class-validator';
import { SOURCE_TYPES, type SourceType } from '../reference/source-types';

export class SubmitChangeDto {
  @IsIn(['create', 'update'])
  kind: 'create' | 'update';

  @ValidateIf((o: SubmitChangeDto) => o.kind === 'update')
  @IsUUID()
  sourceId?: string;

  @ValidateIf((o: SubmitChangeDto) => o.kind === 'create')
  @IsIn(SOURCE_TYPES, { message: 'Choose the type of water source' })
  sourceType?: SourceType;

  @IsObject()
  fields: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ListChangesQuery {
  /** review: waiting for me · mine: submitted by me · decided: approved or rejected · source: pending for one source */
  @IsOptional()
  @IsIn(['review', 'mine', 'decided', 'source'])
  box: 'review' | 'mine' | 'decided' | 'source' = 'review';

  @IsOptional()
  @IsUUID()
  sourceId?: string;
}

export class ReviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
