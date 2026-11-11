import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsIn, IsOptional } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, RequestMeta, RequirePermission, type RequestMetaValue } from '../auth/decorators';
import type { AuthUser } from '../auth/roles';
import { validated } from '../common/validation';
import { DB, type Db } from '../database/db';
import { importWorkbook } from '../import/excel-import';

class ImportBodyDto {
  /** Multipart fields arrive as text. */
  @IsOptional()
  @IsIn(['true', 'false'])
  removeSampleData?: 'true' | 'false';
}

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Upload a workbook in the Ministry template. "preview" runs the whole import and rolls it back,
 * so what it reports is exactly what the import will do; the import itself adds the records as
 * unverified and logs every problem on the Data quality page.
 */
@Controller('imports')
@RequirePermission('data.import')
export class ImportsController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Post('preview')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  preview(@CurrentUser() user: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Body(validated(ImportBodyDto)) body: ImportBodyDto) {
    return this.run(user, file, body, true, null);
  }

  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES, files: 1 } }))
  importFile(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(validated(ImportBodyDto)) body: ImportBodyDto,
    @RequestMeta() meta: RequestMetaValue,
  ) {
    return this.run(user, file, body, false, meta.ip);
  }

  private async run(user: AuthUser, file: Express.Multer.File | undefined, body: ImportBodyDto, dryRun: boolean, ip: string | null) {
    if (!file) throw new BadRequestException('Choose an Excel workbook (.xlsx)');
    if (!/\.xlsx$/i.test(file.originalname) || file.buffer.subarray(0, 2).toString() !== 'PK') {
      throw new BadRequestException('The file must be an Excel workbook (.xlsx) in the Ministry template');
    }
    const removeSampleData = body.removeSampleData === 'true';
    if (removeSampleData && user.role !== 'admin') throw new ForbiddenException('Only an administrator can remove the sample data');

    const name = file.originalname.replace(/[^\w .()-]/g, '_').slice(0, 120);
    let summary;
    try {
      summary = await importWorkbook(this.db, file.buffer, {
        batch: `upload-${name}-${new Date().toISOString().slice(0, 19)}`,
        dataSource: name,
        dryRun,
        removeSampleData,
      });
    } catch (err) {
      // ExcelJS throws on files that are not real workbooks (renamed, damaged, password-protected).
      if (err instanceof Error && /zip|end of central directory|corrupt|invalid/i.test(err.message)) {
        throw new BadRequestException('This file could not be read as an Excel workbook');
      }
      throw err;
    }

    if (!dryRun) {
      await this.audit.log({
        userId: user.id,
        action: 'data.import',
        entityType: 'import',
        entityId: summary.batch,
        summary:
          `Imported ${summary.imported} sources from ${name} (${summary.skipped} skipped, ${summary.possibleDuplicates} possible duplicates)` +
          (summary.removedSample ? `; removed ${summary.removedSample} sample records first` : ''),
        changes: { sheets: summary.sheets, issues: summary.issues, removedSample: summary.removedSample },
        ip,
      });
    }
    return summary;
  }
}
