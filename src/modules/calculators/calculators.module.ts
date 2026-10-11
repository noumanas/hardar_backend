import { Module } from '@nestjs/common';

import { CalculatorsService } from './application/calculators.service.js';
import { CalculatorsController } from './presentation/calculators.controller.js';

@Module({
  controllers: [CalculatorsController],
  providers: [CalculatorsService],
  exports: [CalculatorsService],
})
export class CalculatorsModule {}
