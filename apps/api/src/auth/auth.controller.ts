import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import type { Request, Response } from 'express';
import { validated } from '../common/validation';
import { AuthService } from './auth.service';
import { SESSION_COOKIE, readCookie, sessionCookieOptions } from './cookies';
import { AllowPendingPassword, CurrentUser, Public, RequestMeta, type RequestMetaValue } from './decorators';
import type { AuthUser } from './roles';

class LoginDto {
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(200)
  email: string;

  @IsString()
  @MinLength(1, { message: 'Enter your password' })
  @MaxLength(200)
  password: string;
}

class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MaxLength(200)
  newPassword: string;
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(validated(LoginDto)) body: LoginDto,
    @Req() req: Request,
    @RequestMeta() meta: RequestMetaValue,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, user } = await this.auth.login(body.email, body.password, meta);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(req));
    return this.auth.me(user);
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @RequestMeta() meta: RequestMetaValue, @Res({ passthrough: true }) res: Response) {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await this.auth.logout(token, meta);
    const { maxAge: _maxAge, ...options } = sessionCookieOptions(req);
    res.clearCookie(SESSION_COOKIE, options);
  }

  @AllowPendingPassword()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }

  @AllowPendingPassword()
  @Post('password')
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(validated(ChangePasswordDto)) body: ChangePasswordDto,
    @Req() req: Request,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    await this.auth.changePassword(user, body.currentPassword, body.newPassword, readCookie(req, SESSION_COOKIE), meta.ip);
  }
}
