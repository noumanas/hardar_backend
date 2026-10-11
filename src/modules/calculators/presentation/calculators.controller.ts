import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CalculatorsService } from '../application/calculators.service.js';
import { CalculationErrorFilter } from './calculation-error.filter.js';
import { GratuityRequestDto, GratuityResponseDto } from './dto/gratuity.dto.js';
import { OvertimeRequestDto, OvertimeResponseDto } from './dto/overtime.dto.js';

@ApiTags('Calculators')
@ApiBadRequestResponse({ description: 'Invalid salary, dates or hours' })
@UseFilters(CalculationErrorFilter)
@Controller('calculators')
export class CalculatorsController {
  constructor(private readonly calculators: CalculatorsService) {}

  @Post('gratuity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End-of-service gratuity (FR-8)' })
  @ApiOkResponse({ type: GratuityResponseDto })
  gratuity(@Body() body: GratuityRequestDto): GratuityResponseDto {
    return this.calculators.gratuity(body);
  }

  @Post('overtime')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Overtime pay: +25% normal, +50% night (FR-9)' })
  @ApiOkResponse({ type: OvertimeResponseDto })
  overtime(@Body() body: OvertimeRequestDto): OvertimeResponseDto {
    return this.calculators.overtime(body);
  }
}
