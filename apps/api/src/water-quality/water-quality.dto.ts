import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ListTestsQuery {
  @IsOptional()
  @IsIn(['queue', 'recent', 'mine'])
  box: 'queue' | 'recent' | 'mine' = 'recent';

  @IsOptional()
  @IsIn(['meets', 'concern', 'unsafe'])
  outcome?: 'meets' | 'concern' | 'unsafe';
}

export class RequestTestDto {
  @IsUUID()
  sourceId: string;

  @IsOptional()
  @Matches(DATE, { message: 'Enter the sample date as YYYY-MM-DD' })
  sampledOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sampledBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  samplePoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class ResultDto {
  @IsString()
  @MaxLength(40)
  parameter: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-50)
  @Max(1_000_000)
  value: number;
}

export class RecordTestDto {
  /** For a test recorded directly by the lab (no request). Ignored when completing a request. */
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @Matches(DATE, { message: 'Enter the sample date as YYYY-MM-DD' })
  sampledOn: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sampledBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  samplePoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lab?: string;

  @IsOptional()
  @Matches(DATE, { message: 'Enter the analysis date as YYYY-MM-DD' })
  analysedOn?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Enter at least one result' })
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => ResultDto)
  results: ResultDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CancelTestDto {
  @IsString()
  @MinLength(3, { message: 'Explain why the request is cancelled' })
  @MaxLength(500)
  reason: string;
}

export class ParameterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  label: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @IsOptional()
  @IsNumber()
  minValue?: number | null;

  @IsOptional()
  @IsNumber()
  maxValue?: number | null;

  @IsIn(['health', 'aesthetic', 'info'])
  kind: 'health' | 'aesthetic' | 'info';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  basis?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  sortOrder?: number;
}
