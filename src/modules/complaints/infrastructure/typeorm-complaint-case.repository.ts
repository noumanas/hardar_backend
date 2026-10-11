import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, type Repository } from 'typeorm';

import { CaseStatus, ComplaintCase } from '../domain/complaint-case.entity.js';
import { ComplaintCaseRepository } from '../domain/complaint-case.repository.js';

@Injectable()
export class TypeOrmComplaintCaseRepository implements ComplaintCaseRepository {
  constructor(@InjectRepository(ComplaintCase) private readonly cases: Repository<ComplaintCase>) {}

  create(data: Pick<ComplaintCase, 'workerId' | 'issueType' | 'followUpAt'>): Promise<ComplaintCase> {
    return this.cases.save(this.cases.create(data));
  }

  findDueFollowUps(now: Date, limit: number): Promise<ComplaintCase[]> {
    return this.cases.find({
      where: { status: CaseStatus.Open, followUpAt: LessThanOrEqual(now) },
      order: { followUpAt: 'ASC' },
      take: limit,
    });
  }

  save(complaintCase: ComplaintCase): Promise<ComplaintCase> {
    return this.cases.save(complaintCase);
  }

  count(): Promise<number> {
    return this.cases.count();
  }
}
