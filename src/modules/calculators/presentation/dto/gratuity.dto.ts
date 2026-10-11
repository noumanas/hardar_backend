import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNumber, IsPositive, Max } from 'class-validator';

import type { GratuityResult } from '../../domain/gratuity.calculator.js';

export class GratuityRequestDto {
  @ApiProperty({ example: 1500, description: 'Monthly basic salary in AED (excluding allowances)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  basicMonthlySalary: number;

  @ApiProperty({ example: '2019-03-01', format: 'date' })
  @IsISO8601({ strict: true })
  startDate: string;

  @ApiProperty({ example: '2025-03-01', format: 'date' })
  @IsISO8601({ strict: true })
  endDate: string;
}

export class GratuityResponseDto implements GratuityResult {
  @ApiProperty({ description: 'False when service is shorter than one year' }) eligible: boolean;
  @ApiProperty({ example: 2192 }) serviceDays: number;
  @ApiProperty({ example: 6.01 }) serviceYears: number;
  @ApiProperty({ example: 50, description: 'Basic salary / 30, in AED' }) dailyWage: number;
  @ApiProperty({ example: 135.09, description: 'Days of basic salary owed' }) gratuityDays: number;
  @ApiProperty({ example: 6754.11, description: 'Gratuity in AED' }) amount: number;
  @ApiProperty() cappedAtTwoYearsSalary: boolean;
  @ApiProperty({ example: 'Art. 51' }) articleRef: string;
}
