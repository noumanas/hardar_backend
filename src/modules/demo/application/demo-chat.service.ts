import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

import { CryptoService } from '../../../common/crypto/crypto.service.js';
import { AgentRunner, DEMO_AGENT_RUNNER, type ConversationTurn } from '../../agent/domain/agent-runner.port.js';
import { LlmUnavailableError } from '../../llm/llm.constants.js';
import { UrgentCaseDetector } from '../../safety/domain/urgent-case.detector.js';
import { SpeechToText, type Audio } from '../../speech/domain/speech.ports.js';
import { GeminiTextToSpeech } from '../../speech/infrastructure/gemini-text-to-speech.js';
import type { UploadedMedia } from './demo-contract.service.js';
import { AgentStage, CaseStep } from '../domain/demo-script.js';
import { needsTranslation, ReplyTranslator } from '../domain/reply-translator.port.js';

/** Turns sent back to the model; older ones are dropped to bound cost per message. */
export const DEMO_CHAT_HISTORY_LIMIT = 12;

export const DEMO_FALLBACK_REPLY =
  "I can't answer that right now. For help, call MOHRE on 600590000. / معاف کیجیے، ابھی جواب نہیں دے سکتا۔ مدد کے لیے MOHRE کو 600590000 پر کال کریں۔";

/** About a minute of 16 kHz mono WAV, or several minutes of compressed audio. */
export const DEMO_VOICE_MAX_BYTES = 4 * 1024 * 1024;

export const DEMO_NOT_HEARD_REPLY =
  "I couldn't hear that clearly. Please record again in a quiet place, or type your question. / آواز صاف نہیں آئی۔ دوبارہ ریکارڈ کریں یا لکھ کر بھیجیں۔";

/** File signatures for the audio formats the demo accepts. */
const AUDIO_SIGNATURES: Record<string, (data: Buffer) => boolean> = {
  'audio/wav': (data) => data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WAVE',
  'audio/ogg': (data) => data.toString('ascii', 0, 4) === 'OggS',
  'audio/mpeg': (data) => data.toString('ascii', 0, 3) === 'ID3' || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0),
  'audio/flac': (data) => data.toString('ascii', 0, 4) === 'fLaC',
};

export interface DemoVoiceReply extends DemoChatReply {
  /** What Haqdar heard, or null when the recording had no clear speech. */
  transcript: string | null;
}

export interface DemoChatReply {
  reply: string;
  /** The answer in plain English when it was written in another language; null otherwise. */
  translation: string | null;
  /** Law references the answer relied on, from the real knowledge-base search. */
  citations: string[];
  /** Names of the tools the agent used, in order, so the site can show what it did. */
  tools: string[];
  /** True when the message describes an emergency; the site shows the MOHRE helpline first. */
  urgent: boolean;
  /** Where this turn puts the case; the site keeps the furthest step reached. */
  progress: { caseStep: CaseStep; agentStage: AgentStage };
  /**
   * Lets the site fetch this reply as a voice note from `POST /demo/speech`. Signed so that
   * endpoint only ever speaks Haqdar's own answers, never arbitrary text.
   */
  speechToken: string;
}

const STEP_FOR_TOOL: Record<string, CaseStep> = {
  search_labour_law: CaseStep.RightsExplained,
  calculate_gratuity: CaseStep.RightsExplained,
  calculate_overtime: CaseStep.RightsExplained,
  get_complaint_guide: CaseStep.ComplaintGuided,
};

const STAGE_FOR_TOOL: Record<string, AgentStage> = {
  search_labour_law: AgentStage.Checking,
  calculate_gratuity: AgentStage.UsingTools,
  calculate_overtime: AgentStage.UsingTools,
  get_complaint_guide: AgentStage.UsingTools,
};

const STEP_ORDER = Object.values(CaseStep);

const ARTICLE = /\bArt\.?\s*(\d+)/i;
/**
 * How an answer names an article: English "Art." / "Article", Urdu "آرٹیکل" / "دفعہ" / "شق",
 * Arabic "المادة", Hindi "अनुच्छेद" / "धारा".
 */
const ARTICLE_WORDS = String.raw`(?:\bArt\.?|\bArticle|آرٹیکل|دفعہ|شق|المادة|مادة|अनुच्छेद|धारा)`;
const mentionsArticle = (reply: string, number: string) =>
  new RegExp(String.raw`${ARTICLE_WORDS}\s*${number}(?!\d)`, 'i').test(reply);

/** A named source counts when the answer uses its full name or the short form in brackets ("ILOE"). */
const namesSource = (reply: string, citation: string) => {
  const short = citation.match(/\(([^)]+)\)/)?.[1];
  const text = reply.toLowerCase();
  return text.includes(citation.toLowerCase()) || (short !== undefined && text.includes(short.toLowerCase()));
};

/**
 * The sources worth showing: those the answer actually names, one per article. The law
 * search returns its top matches, and not all of them end up in the answer. If the answer
 * names none, every distinct source is kept.
 */
export function citedSources(reply: string, citations: string[]): string[] {
  const unique = new Map<string, string>();
  for (const citation of citations) {
    const key = citation.match(ARTICLE)?.[1] ?? citation;
    const known = unique.get(key);
    if (!known || citation.length < known.length) unique.set(key, citation);
  }
  const named = [...unique.entries()]
    .filter(([key, citation]) => (citation.match(ARTICLE) ? mentionsArticle(reply, key) : namesSource(reply, citation)))
    .map(([, citation]) => citation);
  return named.length > 0 ? named : [...unique.values()];
}

function progressFor(tools: string[]): DemoChatReply['progress'] {
  const steps = tools.map((tool) => STEP_FOR_TOOL[tool]).filter((step): step is CaseStep => step !== undefined);
  const caseStep = steps.reduce(
    (furthest, step) => (STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(furthest) ? step : furthest),
    CaseStep.ProblemShared,
  );
  const last = tools.at(-1);
  return { caseStep, agentStage: (last && STAGE_FOR_TOOL[last]) || AgentStage.Understanding };
}

/**
 * The live chat on the website demo: each message runs the real Haqdar agent (Gemini,
 * law search, calculators, complaint guides). Stateless and unsaved: the browser sends the
 * recent turns with every message, and no worker, conversation or message row is created.
 */
@Injectable()
export class DemoChatService {
  private readonly logger = new Logger(DemoChatService.name);

  constructor(
    @Inject(DEMO_AGENT_RUNNER) private readonly runner: AgentRunner,
    private readonly urgency: UrgentCaseDetector,
    private readonly speech: SpeechToText,
    private readonly voice: GeminiTextToSpeech,
    private readonly crypto: CryptoService,
    private readonly translator: ReplyTranslator,
  ) {}

  /** Records whether an answer helped. Only the rating and the tools used: no text is kept. */
  recordFeedback(helpful: boolean, tools: string[]): void {
    this.logger.log(`Demo feedback: ${helpful ? 'helpful' : 'not helpful'} (tools: ${tools.join(', ') || 'none'})`);
  }

  /** A translation is a convenience: if it fails, the answer is shown without one. */
  private async translate(text: string): Promise<string | null> {
    if (!needsTranslation(text)) return null;
    try {
      return await this.translator.toEnglish(text);
    } catch (error) {
      this.logger.warn(`Demo translation failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /** A reply as a voice note, only for text this service produced (checked by its token). */
  async speak(text: string, token: string): Promise<Audio> {
    if (!this.crypto.safeEqual(token, this.sign(text))) {
      throw new ForbiddenException('Only Haqdar replies can be turned into voice notes');
    }

    let audio: Audio | null;
    try {
      audio = await this.voice.synthesize(text);
    } catch (error) {
      if (!(error instanceof LlmUnavailableError)) {
        this.logger.error(`Demo voice reply failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      audio = null;
    }
    if (!audio)
      throw new ServiceUnavailableException("The voice note isn't available right now. The text answer is above.");
    return audio;
  }

  private sign(text: string): string {
    return this.crypto.hash(`demo-speech:${text}`);
  }

  /** A voice note: transcribed in whatever language was spoken, then answered in text. */
  async replyToVoice(recording: UploadedMedia | undefined, history: ConversationTurn[]): Promise<DemoVoiceReply> {
    if (!recording || recording.size === 0) throw new BadRequestException('Attach the recording as "audio"');
    const mimeType = recording.mimetype.split(';')[0].trim().toLowerCase();
    if (!AUDIO_SIGNATURES[mimeType]?.(recording.buffer)) {
      throw new UnsupportedMediaTypeException('Send the voice note as WAV, Ogg, MP3 or FLAC');
    }

    let transcript: string | null;
    try {
      transcript = await this.speech.transcribe({ data: recording.buffer, mimeType });
    } catch (error) {
      if (!(error instanceof LlmUnavailableError)) {
        this.logger.error(`Demo voice note failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw new ServiceUnavailableException("Voice notes aren't available right now. Please type your question.");
    }

    if (!transcript) {
      return {
        transcript: null,
        reply: DEMO_NOT_HEARD_REPLY,
        // Already written in English and Urdu.
        translation: null,
        citations: [],
        tools: [],
        urgent: false,
        progress: progressFor([]),
        speechToken: this.sign(DEMO_NOT_HEARD_REPLY),
      };
    }
    return { transcript, ...(await this.reply(transcript, history)) };
  }

  async reply(message: string, history: ConversationTurn[]): Promise<DemoChatReply> {
    const text = message.trim();
    const { urgent } = this.urgency.assess(text);

    let run;
    try {
      run = await this.runner.run({
        message: text,
        history: history.slice(-DEMO_CHAT_HISTORY_LIMIT),
        // The demo tools never read the context; these ids only satisfy the runner's contract.
        context: { workerId: 'website-demo', conversationId: 'website-demo' },
      });
    } catch (error) {
      if (!(error instanceof LlmUnavailableError)) {
        this.logger.error(`Demo chat failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw new ServiceUnavailableException("The live chat isn't available right now.");
    }

    const tools = run.toolCalls.filter((call) => call.ok).map((call) => call.name);
    const reply = run.text ?? DEMO_FALLBACK_REPLY;
    return {
      reply,
      translation: run.text ? await this.translate(run.text) : null,
      citations: run.text ? citedSources(run.text, run.citations) : [],
      tools,
      urgent,
      progress: progressFor(tools),
      speechToken: this.sign(reply),
    };
  }
}
