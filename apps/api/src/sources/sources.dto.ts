import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  FUNCTIONAL_STATUSES,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
  type FunctionalStatus,
  type SourceType,
  type VerificationStatus,
} from '../reference/source-types';

export class SourceFilterQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(SOURCE_TYPES)
  type?: SourceType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  region?: number;

  @IsOptional()
  @IsIn(FUNCTIONAL_STATUSES)
  status?: FunctionalStatus;

  @IsOptional()
  @IsIn(VERIFICATION_STATUSES)
  verification?: VerificationStatus;
}

export const SOURCE_SORTS = ['code', 'name', 'type', 'region', 'status', 'people', 'inspected'] as const;
export type SourceSort = (typeof SOURCE_SORTS)[number];

export class ListSourcesQuery extends SourceFilterQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;

  @IsOptional()
  @IsIn(SOURCE_SORTS)
  sort: SourceSort = 'code';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  order: 'asc' | 'desc' = 'asc';
}

export class NearbyQuery {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.1)
  @Max(100)
  radiusKm: number = 10;
}

export class RegionQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  region?: number;
}
