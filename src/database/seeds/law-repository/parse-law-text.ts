import { LawTopic } from '../../../modules/knowledge/domain/law-article.entity.js';

export interface ParsedArticle {
  number: number;
  /** The article's own heading ("Overtime"), or null when the text starts straight away. */
  heading: string | null;
  body: string;
}

/**
 * "Article (19)", "ARTICLE (1)", "Article 7" and the mirrored "Article )2(" that PDF
 * extraction produces from right-to-left layouts, alone on their line.
 */
const ARTICLE_LINE = /^\s*article\s*[()]?\s*(\d{1,3})\s*[()]?\s*$/i;
const LIST_MARKER = /^(\d+[.)-]|\(?[a-z]\)|[-–−•▪])\s*/i;
const SENTENCE_END = /[.:;]$/;

/** Splits an extracted law text into its articles. The preamble before Article 1 is dropped. */
export function parseLawText(text: string): ParsedArticle[] {
  const lines = withoutPageFurniture(text.split(/\r?\n/));
  const articles: ParsedArticle[] = [];
  let current: { number: number; lines: string[] } | null = null;

  const close = () => {
    if (!current) return;
    const { heading, rest } = splitHeading(current.lines);
    const body = joinWrappedLines(rest);
    if (body) articles.push({ number: current.number, heading, body });
  };

  for (const line of lines) {
    const match = ARTICLE_LINE.exec(line);
    if (match) {
      close();
      current = { number: Number(match[1]), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  close();
  return articles;
}

/**
 * Running headers and footers ("Federal Decree by Law No. (33) of 2021 … 16", translation
 * notices) repeat on every page. Lines that recur three or more times, ignoring page numbers,
 * are dropped along with bare page numbers.
 */
function withoutPageFurniture(lines: string[]): string[] {
  const key = (line: string) => line.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const line of lines) {
    const k = key(line);
    if (k.length > 15) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return lines.filter((line) => {
    if (/^\s*(page\s*)?\d+(\s*(of|\/)\s*\d+)?\s*$/i.test(line)) return false;
    return (counts.get(key(line)) ?? 0) < 3;
  });
}

/** Words a wrapped heading can break after ("… Issuing, Renewing and" / "Cancelling …"). */
const DANGLING_WORD = /\b(and|or|of|for|to|the|in|on|with|from|by|a|an|at|its|their|under)$|['’]s?$/i;

/**
 * A short first line that isn't a sentence or list item is the article's heading. A heading
 * wrapped onto a second line is joined back; a first line whose next line carries on in
 * lower case is the start of a sentence, not a heading.
 */
function splitHeading(lines: string[]): { heading: string | null; rest: string[] } {
  const filled = lines.flatMap((line, index) => (line.trim() ? [index] : []));
  if (filled.length === 0) return { heading: null, rest: [] };
  const [first, second] = filled;
  let candidate = lines[first].trim().replace(/\s+/g, ' ');
  let end = first + 1;
  const next = second === undefined ? '' : lines[second].trim();
  if (/^\p{Ll}/u.test(next)) return { heading: null, rest: lines.slice(first) };
  if (DANGLING_WORD.test(candidate) && next) {
    candidate = `${candidate} ${next.replace(/\s+/g, ' ')}`;
    end = second + 1;
  }
  const isHeading =
    candidate.length <= 120 &&
    !SENTENCE_END.test(candidate) &&
    !LIST_MARKER.test(candidate) &&
    !/^\d/.test(candidate) &&
    !/\b(shall|must)\b/i.test(candidate) &&
    !/^(a|an|any|if|whoever)\s+\p{Ll}/iu.test(candidate);
  if (!isHeading) return { heading: null, rest: lines.slice(first) };
  return { heading: titleCase(candidate), rest: lines.slice(end) };
}

/** Headings extracted in capitals ("INDIVIDUAL LABOUR COMPLAINT") read better in title case. */
function titleCase(heading: string): string {
  const cleaned = heading.replace(/\s+/g, ' ');
  if (cleaned !== cleaned.toUpperCase()) return cleaned;
  return cleaned
    .toLowerCase()
    .replace(/(^|[\s(-])(\p{L})/gu, (_, gap: string, letter: string) => gap + letter.toUpperCase());
}

/**
 * Rejoins lines that PDF extraction wrapped mid-sentence, keeps numbered items and
 * paragraphs on their own lines, and collapses the layout's indentation.
 */
function joinWrappedLines(lines: string[]): string {
  const paragraphs: string[] = [];
  for (const raw of lines) {
    const line = raw
      .trim()
      .replace(/^[•▪−]\s*/, '- ')
      .replace(/\s{2,}/g, ' ');
    if (!line) continue;
    const previous = paragraphs.at(-1);
    const continues = previous !== undefined && !SENTENCE_END.test(previous) && !LIST_MARKER.test(line);
    if (continues) {
      paragraphs[paragraphs.length - 1] = `${previous} ${line}`;
    } else {
      paragraphs.push(line);
    }
  }
  return paragraphs.join('\n').trim();
}

/** Keywords per topic; a match in the heading outweighs any number in the body. */
const TOPIC_KEYWORDS: [LawTopic, RegExp][] = [
  [LawTopic.Overtime, /\bovertime\b|additional (working )?hours/gi],
  [LawTopic.WorkingHours, /working hours|rest period|\bbreak\b|rest day|midday|weekly rest/gi],
  [LawTopic.Salary, /\bwages?\b|salar(y|ies)|wage protection|\bwps\b|deduct/gi],
  [LawTopic.Leave, /\bleave\b|holiday|vacation|maternity|sick/gi],
  [LawTopic.Probation, /probation/gi],
  [LawTopic.Gratuity, /end[- ]of[- ]service|gratuity|savings scheme|alternative.*scheme/gi],
  [LawTopic.Termination, /terminat|notice period|dismiss|resign|expiry of the (employment )?contract/gi],
  [LawTopic.Passport, /passport|identity documents|personal documents/gi],
  [LawTopic.RecruitmentFees, /recruit|placement|commission|fees? from the worker/gi],
  [LawTopic.Safety, /safety|injur|occupational disease|accommodation|housing|health|trafficking|forced labou?r/gi],
  [LawTopic.Complaints, /complain|dispute|\bcourt\b|lawsuit|claim/gi],
  [LawTopic.Contract, /employment contract|\bcontract\b|work permit|job offer/gi],
];

export function classifyTopic(heading: string | null, body: string): LawTopic {
  let best: { topic: LawTopic; score: number } = { topic: LawTopic.Other, score: 0 };
  for (const [topic, pattern] of TOPIC_KEYWORDS) {
    const score = 1000 * (heading?.match(pattern)?.length ?? 0) + (body.match(pattern)?.length ?? 0);
    if (score > best.score) best = { topic, score };
  }
  return best.topic;
}
