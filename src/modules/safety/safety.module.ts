import { Module } from '@nestjs/common';

import { UrgentCaseDetector } from './domain/urgent-case.detector.js';

@Module({
  providers: [{ provide: UrgentCaseDetector, useValue: new UrgentCaseDetector() }],
  exports: [UrgentCaseDetector],
})
export class SafetyModule {}
