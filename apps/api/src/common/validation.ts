import { ValidationPipe, type Type } from '@nestjs/common';

/**
 * Validation pipe bound to an explicit DTO class. Passing the class explicitly keeps
 * validation working even where the build does not emit decorator metadata
 * (for example some serverless bundlers).
 */
export function validated<T>(dto: Type<T>) {
  return new ValidationPipe({ transform: true, whitelist: true, expectedType: dto });
}
