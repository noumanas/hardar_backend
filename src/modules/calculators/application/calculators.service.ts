import { Injectable } from '@nestjs/common';

import { calculateGratuity, type GratuityInput, type GratuityResult } from '../domain/gratuity.calculator.js';
import { calculateOvertime, type OvertimeInput, type OvertimeResult } from '../domain/overtime.calculator.js';

/** Application entry point to the money calculators, shared by the HTTP API and the agent tools. */
@Injectable()
export class CalculatorsService {
  gratuity(input: GratuityInput): GratuityResult {
    return calculateGratuity(input);
  }

  overtime(input: OvertimeInput): OvertimeResult {
    return calculateOvertime(input);
  }
}
