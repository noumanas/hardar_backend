import { ArgumentsHost, BadRequestException, Catch } from '@nestjs/common';

import { HttpExceptionFilter } from '../../../common/filters/http-exception.filter.js';
import { InvalidCalculationInputError } from '../domain/calculation.errors.js';

/** Translates calculator domain errors into HTTP 400 responses with the standard error body. */
@Catch(InvalidCalculationInputError)
export class CalculationErrorFilter extends HttpExceptionFilter {
  override catch(exception: InvalidCalculationInputError, host: ArgumentsHost): void {
    super.catch(new BadRequestException(exception.message), host);
  }
}
