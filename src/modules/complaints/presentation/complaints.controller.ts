import { Controller, Get, Param, ParseEnumPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';

import { ComplaintsService } from '../application/complaints.service.js';
import type { ComplaintGuide, ContactChannel } from '../domain/complaint-guides.js';
import { IssueType } from '../domain/issue-type.enum.js';

class ContactChannelDto implements ContactChannel {
  @ApiProperty({ example: 'MOHRE call centre' }) name: string;
  @ApiProperty({ example: '600590000' }) detail: string;
}

class ComplaintGuideDto implements ComplaintGuide {
  @ApiProperty({ enum: IssueType, enumName: 'IssueType' }) issueType: IssueType;
  @ApiProperty({ example: 'Late or unpaid salary' }) title: string;
  @ApiProperty() right: string;
  @ApiProperty({ type: [String] }) documents: string[];
  @ApiProperty({ type: [String] }) steps: string[];
  @ApiProperty({ type: [ContactChannelDto] }) channels: ContactChannel[];
}

@ApiTags('Complaint guides')
@Controller('complaints/guides')
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @ApiOperation({ summary: 'All complaint guides (FR-10)' })
  @ApiOkResponse({ type: [ComplaintGuideDto] })
  list(): ComplaintGuide[] {
    return this.complaints.allGuides();
  }

  @Get(':issueType')
  @ApiOperation({ summary: 'Documents, steps and MOHRE channels for one issue' })
  @ApiParam({ name: 'issueType', enum: IssueType, enumName: 'IssueType' })
  @ApiOkResponse({ type: ComplaintGuideDto })
  get(@Param('issueType', new ParseEnumPipe(IssueType)) issueType: IssueType): ComplaintGuide {
    return this.complaints.guideFor(issueType);
  }
}
