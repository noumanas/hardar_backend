import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsPositive, Max, Min } from 'class-validator';

import type { OvertimeResult } from '../../domain/overtime.calculator.js';

export class OvertimeRequestDto {
  @ApiProperty({ example: 1500, description: 'Monthly basic salary in AED' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1_000_000)
  basicMonthlySalary: number;

  @ApiProperty({ example: 52, description: 'Overtime hours worked outside 10pm–4am' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(744)
  normalOvertimeHours: number;

  @ApiProperty({ example: 0, description: 'Overtime hours worked between 10pm and 4am' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(744)
  nightOvertimeHours: number;
}

export class OvertimeResponseDto implements OvertimeResult {
  @ApiProperty({ example: 6.25 }) hourlyWage: number;
  @ApiProperty({ example: 406.25 }) normalOvertimePay: number;
  @ApiProperty({ example: 0 }) nightOvertimePay: number;
  @ApiProperty({ example: 406.25 }) totalOvertimePay: number;
  @ApiProperty({ example: 'Art. 19' }) articleRef: string;
}
