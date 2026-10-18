import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, RequestMeta, RequirePermission, type RequestMetaValue } from '../auth/decorators';
import type { AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import {
  AssignDto,
  CreateInspectionDto,
  InspectorsQuery,
  ListAssignmentsQuery,
  ListInspectionsQuery,
  PhotoBodyDto,
  ReviewInspectionDto,
  UpdateInspectionDto,
} from './inspections.dto';
import { InspectionsService } from './inspections.service';

/** Field collection: assignments, inspections from the field, photos and review. */
@Controller('inspections')
@RequirePermission('sources.view')
export class InspectionsController {
  constructor(@Inject(InspectionsService) private readonly inspections: InspectionsService) {}

  @Get('assignments')
  assignments(@CurrentUser() user: AuthUser, @Query(validated(ListAssignmentsQuery)) q: ListAssignmentsQuery) {
    return this.inspections.listAssignments(user, q.box);
  }

  @Post('assignments')
  @RequirePermission('inspections.assign')
  assign(@CurrentUser() user: AuthUser, @Body(validated(AssignDto)) dto: AssignDto, @RequestMeta() meta: RequestMetaValue) {
    return this.inspections.assign(user, dto, meta.ip);
  }

  @Post('assignments/:id/cancel')
  @HttpCode(200)
  @RequirePermission('inspections.assign')
  cancel(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @RequestMeta() meta: RequestMetaValue) {
    return this.inspections.cancelAssignment(user, id, meta.ip);
  }

  /** Field officers and coordinators who can be given inspections. */
  @Get('inspectors')
  @RequirePermission('inspections.assign')
  inspectors(@CurrentUser() user: AuthUser, @Query(validated(InspectorsQuery)) q: InspectorsQuery) {
    return this.inspections.inspectors(user, q.regionId);
  }

  @Get('counts')
  counts(@CurrentUser() user: AuthUser) {
    return this.inspections.counts(user);
  }

  /** Streams a photo to signed-in users who can see the source; storage URLs are never exposed. */
  @Get('photos/:photoId')
  async photo(@CurrentUser() user: AuthUser, @Param('photoId', ParseUUIDPipe) photoId: string, @Res() res: Response) {
    const { stream, contentType } = await this.inspections.photo(user, photoId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query(validated(ListInspectionsQuery)) q: ListInspectionsQuery) {
    return this.inspections.list(user, q.box);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.inspections.get(user, id);
  }

  @Post()
  @RequirePermission('inspections.submit')
  create(@CurrentUser() user: AuthUser, @Body(validated(CreateInspectionDto)) dto: CreateInspectionDto, @RequestMeta() meta: RequestMetaValue) {
    return this.inspections.create(user, dto, meta.ip);
  }

  @Patch(':id')
  @RequirePermission('inspections.submit')
  update(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body(validated(UpdateInspectionDto)) dto: UpdateInspectionDto) {
    return this.inspections.update(user, id, dto);
  }

  @Post(':id/photos')
  @RequirePermission('inspections.submit')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  addPhoto(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(validated(PhotoBodyDto)) body: PhotoBodyDto,
  ) {
    return this.inspections.addPhoto(user, id, file, body.clientId, body.caption);
  }

  @Delete(':id/photos/:photoId')
  @HttpCode(204)
  @RequirePermission('inspections.submit')
  async removePhoto(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('photoId', ParseUUIDPipe) photoId: string) {
    await this.inspections.removePhoto(user, id, photoId);
  }

  @Post(':id/submit')
  @HttpCode(200)
  @RequirePermission('inspections.submit')
  submit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @RequestMeta() meta: RequestMetaValue) {
    return this.inspections.submit(user, id, meta.ip);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermission('inspections.review')
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(ReviewInspectionDto)) dto: ReviewInspectionDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.inspections.approve(user, id, dto.comment, Boolean(dto.moveLocation), meta.ip);
  }

  @Post(':id/return')
  @HttpCode(200)
  @RequirePermission('inspections.review')
  returnToInspector(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(validated(ReviewInspectionDto)) dto: ReviewInspectionDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.inspections.returnToInspector(user, id, dto.comment, meta.ip);
  }
}
