import { LawTopic } from '../../../modules/knowledge/domain/law-article.entity.js';
import { classifyTopic, parseLawText } from './parse-law-text.js';

const FOOTER = '  Federal Decree by Law No. (33) of 2021 Concerning Regulating Labor Relations            ';

describe('parseLawText', () => {
  it('splits articles, keeps headings and drops the preamble and page footers', () => {
    const text = [
      'We, Khalifa bin Zayed Al Nahyan, President of the United Arab Emirates,',
      '                     Article (1)',
      '                     Definitions',
      'In this Decree by law, the following words mean:',
      `${FOOTER}2`,
      '                     Article )2(',
      '                     Objectives',
      'This Decree by law aims to regulate work.',
      `${FOOTER}3`,
      '                     Article (19)',
      '                      Overtime',
      '1. The Employer may require the Worker to work for additional working hours beyond the',
      '   normal working hours, provided that they do not exceed two hours per day.',
      `${FOOTER}16`,
      '2. Overtime is paid at the basic wage plus at least twenty-five percent (25%).',
    ].join('\n');

    expect(parseLawText(text)).toEqual([
      { number: 1, heading: 'Definitions', body: 'In this Decree by law, the following words mean:' },
      { number: 2, heading: 'Objectives', body: 'This Decree by law aims to regulate work.' },
      {
        number: 19,
        heading: 'Overtime',
        body:
          '1. The Employer may require the Worker to work for additional working hours beyond the normal working ' +
          'hours, provided that they do not exceed two hours per day.\n' +
          '2. Overtime is paid at the basic wage plus at least twenty-five percent (25%).',
      },
    ]);
  });

  it('joins a heading wrapped onto two lines and title-cases capitals', () => {
    const [wrapped, capitals] = parseLawText(
      [
        'Article (4)',
        'Conditions, Rules and Procedures for Issuing, Renewing and',
        'Cancelling Work Permits',
        'A work permit is issued by the Ministry.',
        'ARTICLE (5)',
        'INDIVIDUAL LABOUR COMPLAINT',
        'Complaints are submitted within 30 days.',
      ].join('\n'),
    );
    expect(wrapped.heading).toBe('Conditions, Rules and Procedures for Issuing, Renewing and Cancelling Work Permits');
    expect(wrapped.body).toBe('A work permit is issued by the Ministry.');
    expect(capitals.heading).toBe('Individual Labour Complaint');
  });

  it('does not mistake the first line of a sentence for a heading', () => {
    const [carriesOn, penalty] = parseLawText(
      [
        'Article (59)',
        'A penalty of imprisonment for a period not less than one year and a fine not less than two',
        'hundred thousand dirhams shall be imposed on whoever employs a worker without a permit.',
        'Article (63)',
        'A fine not less than five thousand (5,000) AED and not exceeding one million (1,000,000)',
        'AED shall be imposed on the employer.',
      ].join('\n'),
    );
    expect(carriesOn.heading).toBeNull();
    expect(carriesOn.body).toMatch(/^A penalty of imprisonment .* without a permit\.$/);
    expect(penalty.heading).toBeNull();
  });

  it('skips articles with no text', () => {
    expect(parseLawText('Article (1)\n\nArticle (2)\nHeading only')).toEqual([]);
  });
});

describe('classifyTopic', () => {
  it('lets the heading decide over keywords in the body', () => {
    expect(classifyTopic('Overtime', 'working hours beyond the normal working hours, working hours')).toBe(
      LawTopic.Overtime,
    );
  });

  it('falls back to the body, then to other', () => {
    expect(classifyTopic(null, 'The end-of-service gratuity is calculated on the basic wage')).toBe(LawTopic.Gratuity);
    expect(classifyTopic('Publication', 'This Decree by law is published in the Official Gazette.')).toBe(
      LawTopic.Other,
    );
  });
});
