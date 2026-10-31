/**
 * The instruments from the UAE Worker Law Repository (research snapshot 2026-10-31) that the
 * agent searches. Picked per the repository's own release notes: the single-page federal
 * labour law (FED003, not the MOHRE spread-layout FED001), the current WPS resolution
 * (340/2026, which repeals 598/2022), one edition of each unemployment resolution, and the
 * amended housing rules. Government-employee, pension, immigration, privacy, DIFC/ADGM and
 * the unreviewed Arabic extracts are left out: they are a different scope or not ready.
 */
export interface LawSource {
  /** Repository id; the extracted text is `06_Extracted_Text/<id>__*.txt`. */
  id: string;
  /** Start of every citation, e.g. "Decree-Law 33/2021" → "Decree-Law 33/2021, Art. 19". */
  citation: string;
  /** Official download the repository fetched the text from. */
  url: string;
}

export const LAW_SOURCES: LawSource[] = [
  {
    id: 'FED003',
    citation: 'Decree-Law 33/2021',
    url: 'https://www.uaelegislation.gov.ae/en/legislations/1541/download',
  },
  {
    id: 'FED002',
    citation: 'Cabinet Resolution 1/2022 (Labour Law Executive Regulation)',
    url: 'https://www.mohre.gov.ae/assets/download/46bdbfda/Cabinet%20Resolution%20_Executive%20Regulations%20Decree-Law%20No.%2033.pdf.aspx',
  },
  {
    id: 'WPS001',
    citation: 'Ministerial Resolution 340/2026 (Wage Protection System)',
    url: 'https://www.mohre.gov.ae/assets/download/1f19ab7b/Ministerial%20Resolution%20No.%200340%20of%202026.pdf.aspx',
  },
  {
    id: 'DIS001',
    citation: 'Ministerial Resolution 782/2023 (Individual Labour Complaints)',
    url: 'https://www.mohre.gov.ae/assets/download/7ea27392/Ministerial%20Resolution%20No.%20782%20of%202023%20Regulating%20the%20Process%20for%20Resolving%20Individual%20Labour%20Complaints_638945693427346790.pdf.aspx',
  },
  {
    id: 'DIS003',
    citation: 'Cabinet Resolution 46/2022 (Collective Labour Disputes)',
    url: 'https://www.uaelegislation.gov.ae/en/legislations/1658/download',
  },
  {
    id: 'EOS001',
    citation: 'Cabinet Resolution 96/2023 (Alternative End-of-Service Scheme)',
    url: 'https://www.uaelegislation.gov.ae/en/legislations/2309/download',
  },
  {
    id: 'EOS002',
    citation: 'Ministerial Resolution 668/2023 (Alternative End-of-Service Subscription)',
    url: 'https://www.mohre.gov.ae/assets/download/f2c80cb2/Ministerial%20Resolution%20No.%20668%20of%202023%20Regarding%20Subscription%20Under%20the%20Alternarive%20End-of-Service%20Benefits%20System_638945728111341174.pdf.aspx',
  },
  {
    id: 'OSH001',
    citation: 'Cabinet Resolution 33/2022 (Work Injuries and Occupational Diseases)',
    url: 'https://www.uaelegislation.gov.ae/en/legislations/1559/download',
  },
  {
    id: 'OSH002',
    citation: 'Administrative Decision 19/2023 (Occupational Safety and Labour Accommodation)',
    url: 'https://www.mohre.gov.ae/assets/download/6786916a/administrative-decision-no-19-of-2023-relating-to-occupational-safety-and-health-and-labour.aspx',
  },
  {
    id: 'OSH003',
    citation: 'Ministerial Resolution 44/2022 as amended (Health, Safety and Labour Accommodation)',
    url: 'https://mohre.gov.ae/assets/download/4f4a2f6a/ministerial-resolution-no-44-of-2022-and-its-amendments.aspx',
  },
  {
    id: 'INS001',
    citation: 'Decree-Law 13/2022 (Unemployment Insurance)',
    url: 'https://www.uaelegislation.gov.ae/en/legislations/1596/download',
  },
  {
    id: 'INS003',
    citation: 'Cabinet Resolution 97/2022 (Unemployment Insurance)',
    url: 'https://www.uaelegislation.gov.ae/en/legislations/1599/download',
  },
  {
    id: 'SAFE001',
    citation: 'Decree-Law 24/2023 (Combating Human Trafficking)',
    url: 'https://www.uaelegislation.gov.ae/en/legislations/2127/download',
  },
  {
    id: 'DOM001',
    citation: 'Domestic Workers Decree-Law 9/2022',
    url: 'https://www.uaelegislation.gov.ae/en/legislations/1593/download',
  },
  {
    id: 'DOM002',
    citation: 'Cabinet Resolution 106/2022 (Domestic Workers Executive Regulation)',
    url: 'https://www.uaelegislation.gov.ae/en/legislations/1620/download',
  },
  {
    id: 'DOM004',
    citation: 'Ministerial Resolution 675/2022 (Domestic Workers in WPS)',
    url: 'https://mohre.gov.ae/assets/download/ee86c914/Ministerial%20Resolution%20No.%20675%20of%202022%20On%20the%20Coverage%20of%20Certain%20Domestic%20Work%20Professions%20Under%20the%20Wages%20Protection%20System_638944177547912261.pdf.aspx',
  },
];
