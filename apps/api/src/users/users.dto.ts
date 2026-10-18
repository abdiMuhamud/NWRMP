import { Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { DEPARTMENT_CODES, ROLES, type Department, type Role } from '../auth/roles';

export class CreateUserDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(200)
  email: string;

  @IsString()
  @MinLength(2, { message: 'Enter the full name' })
  @MaxLength(120)
  fullName: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsIn(ROLES)
  role: Role;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(DEPARTMENT_CODES)
  department?: Department | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  regionId?: number | null;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @IsIn(ROLES)
  role?: Role;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsIn(DEPARTMENT_CODES)
  department?: Department | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  regionId?: number | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
