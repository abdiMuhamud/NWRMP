import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser, Permission } from './roles';

export const IS_PUBLIC = 'nwrmp:public';
export const REQUIRED_PERMISSIONS = 'nwrmp:permissions';
export const ALLOW_PENDING_PASSWORD = 'nwrmp:allowPendingPassword';

/** Route needs no sign-in. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Signed-in user must hold every listed permission. */
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** Route stays reachable while the user still has to replace a temporary password. */
export const AllowPendingPassword = () => SetMetadata(ALLOW_PENDING_PASSWORD, true);

export type AuthedRequest = Request & { user?: AuthUser };

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest<AuthedRequest>().user!,
);

export const RequestMeta = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<Request>();
  return { ip: req.ip ?? null, userAgent: req.headers['user-agent']?.slice(0, 300) ?? null };
});

export interface RequestMetaValue {
  ip: string | null;
  userAgent: string | null;
}
