import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { WORK_ORDER_CATEGORY_CODES, WORK_ORDER_PRIORITY_CODES, type WorkOrderCategory, type WorkOrderPriority } from './work-order-options';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListWorkOrdersQuery {
  @IsOptional()
  @IsIn(['active', 'mine', 'to_close', 'closed', 'source'])
  box: 'active' | 'mine' | 'to_close' | 'closed' | 'source' = 'active';

  @IsOptional()
  @IsUUID()
  sourceId?: string;
}

export class ReportWorkOrderDto {
  @IsUUID()
  sourceId: string;

  @IsIn(WORK_ORDER_CATEGORY_CODES, { message: 'Choose the type of problem' })
  category: WorkOrderCategory;

  @IsIn(WORK_ORDER_PRIORITY_CODES)
  priority: WorkOrderPriority;

  @IsString()
  @MinLength(3, { message: 'Describe the problem in a few words' })
  @MaxLength(160)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  /** The field inspection that found the breakdown, if any. */
  @IsOptional()
  @IsUUID()
  inspectionId?: string;
}

export class AssignWorkOrderDto {
  @IsUUID()
  userId: string;
}

export class CompleteWorkOrderDto {
  @IsString()
  @MinLength(3, { message: 'Describe the work done' })
  @MaxLength(4000)
  workDone: string;

  @Matches(DATE, { message: 'Enter the date as YYYY-MM-DD' })
  completedOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  partsUsed?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  costUsd?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  performedBy?: string;

  @IsBoolean()
  workingAfter: boolean;
}

export class CommentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class ReasonDto {
  @IsString()
  @MinLength(3, { message: 'Give a reason' })
  @MaxLength(500)
  reason: string;
}
