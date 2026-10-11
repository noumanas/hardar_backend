import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../../../common/dto/pagination.dto.js';
import { LawTopic } from '../../domain/law-article.entity.js';

export class CreateLawArticleDto {
  @ApiProperty({ example: 'Decree-Law 33/2021, Art. 19' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  reference: string;

  @ApiProperty({ example: 'Overtime pay' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'Overtime is paid at the basic hourly wage plus 25%...' })
  @IsString()
  @IsNotEmpty()
  body: string;

  @ApiProperty({ enum: LawTopic, enumName: 'LawTopic' })
  @IsEnum(LawTopic)
  topic: LawTopic;

  @ApiPropertyOptional({ example: 'https://www.mohre.gov.ae' })
  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  sourceUrl?: string;

  @ApiPropertyOptional({ default: false, description: 'Checked against current MOHRE material' })
  @IsOptional()
  @IsBoolean()
  verified?: boolean;
}

export class UpdateLawArticleDto extends PartialType(CreateLawArticleDto) {}

export class ListLawArticlesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: LawTopic, enumName: 'LawTopic' })
  @IsOptional()
  @IsEnum(LawTopic)
  topic?: LawTopic;

  @ApiPropertyOptional({ description: 'true: only verified articles; false: only those still to check' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value))
  @IsBoolean()
  verified?: boolean;
}

export class SearchLawArticlesQueryDto {
  @ApiProperty({ example: 'overtime at night', description: 'Free-text question or keywords' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  q: string;
}

export class LawArticleResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() reference: string;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiProperty({ enum: LawTopic, enumName: 'LawTopic' }) topic: LawTopic;
  @ApiProperty({ nullable: true, type: String }) sourceUrl: string | null;
  @ApiProperty() verified: boolean;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
}

export class ArticleMatchDto {
  @ApiProperty({ type: LawArticleResponseDto }) article: LawArticleResponseDto;
  @ApiProperty({ example: 0.42 }) rank: number;
}
