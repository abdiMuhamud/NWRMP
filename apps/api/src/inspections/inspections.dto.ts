import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class GpsDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100_000)
  accuracy?: number;
}

export class CreateInspectionDto {
  /** Generated on the device, so a resend after a dropped connection does not create a duplicate. */
  @IsUUID()
  clientId: string;

  @IsUUID()
  sourceId: string;

  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  @Matches(DATE, { message: 'Enter the visit date as YYYY-MM-DD' })
  inspectedOn: string;

  @IsObject()
  observed: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => GpsDto)
  gps?: GpsDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateInspectionDto {
  @IsOptional()
  @Matches(DATE)
  inspectedOn?: string;

  @IsOptional()
  @IsObject()
  observed?: Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => GpsDto)
  gps?: GpsDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class PhotoBodyDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}

export class AssignDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  sourceIds: string[];

  @IsUUID()
  assignedTo: string;

  @IsOptional()
  @Matches(DATE)
  dueOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ListInspectionsQuery {
  @IsOptional()
  @IsIn(['review', 'mine', 'recent'])
  box: 'review' | 'mine' | 'recent' = 'review';
}

export class ListAssignmentsQuery {
  @IsOptional()
  @IsIn(['mine', 'team'])
  box: 'mine' | 'team' = 'mine';
}

export class InspectorsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  regionId?: number;
}

export class ReviewInspectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  /** Also move the registered location to the GPS position recorded at the visit. */
  @IsOptional()
  @IsBoolean()
  moveLocation?: boolean;
}
