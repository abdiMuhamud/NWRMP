import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, readCookie } from './cookies';
import { ALLOW_PENDING_PASSWORD, IS_PUBLIC, REQUIRED_PERMISSIONS, type AuthedRequest } from './decorators';
import { can, type Permission } from './roles';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/** Runs on every request: resolves the session, then applies sign-in and permission rules. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [ctx.getHandler(), ctx.getClass()]);

    // CSRF defence: browsers will not add this header to a cross-site form post.
    if (!SAFE_METHODS.includes(req.method) && req.headers['x-requested-with'] !== 'nwrmp') {
      throw new ForbiddenException('Request rejected: missing X-Requested-With header');
    }

    const token = readCookie(req, SESSION_COOKIE);
    const user = token ? await this.auth.userForSession(token) : null;
    if (user) req.user = user;

    if (meta<boolean>(IS_PUBLIC)) return true;
    if (!user) throw new UnauthorizedException('Please sign in');
    if (user.mustChangePassword && !meta<boolean>(ALLOW_PENDING_PASSWORD)) {
      throw new ForbiddenException('Change your temporary password to continue');
    }

    const required = meta<Permission[]>(REQUIRED_PERMISSIONS) ?? [];
    if (required.some((p) => !can(user, p))) throw new ForbiddenException('You do not have permission to do this');
    return true;
  }
}
