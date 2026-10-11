import type { ContractTerms } from './contract-terms.js';

export interface ContractImage {
  data: Buffer;
  mimeType: string;
}

export interface ContractExtraction {
  /** False when the photo is too blurry or partial to read; the worker is asked for a clearer one. */
  legible: boolean;
  terms: ContractTerms;
}

/** Reads contract terms from a photo (FR-5). Implemented by a vision model adapter. */
export abstract class ContractExtractor {
  abstract extract(image: ContractImage): Promise<ContractExtraction>;
}
