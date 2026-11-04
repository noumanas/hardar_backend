export enum UrgentCategory {
  PassportHeld = 'passport_held',
  NoFoodOrHousing = 'no_food_or_housing',
  UnsafeWork = 'unsafe_work',
  Violence = 'violence',
  Confinement = 'confinement',
}

export interface UrgentAssessment {
  urgent: boolean;
  categories: UrgentCategory[];
}

/**
 * Keyword patterns in English, Roman Urdu, Urdu, Hindi and Bengali. Deliberately broad: a false
 * alarm only adds a helpline line to the reply, while a miss could leave a worker at risk.
 */
const PATTERNS: Record<UrgentCategory, RegExp[]> = {
  [UrgentCategory.PassportHeld]: [/passport/i, /پاسپورٹ/, /पासपोर्ट/, /পাসপোর্ট/],
  [UrgentCategory.NoFoodOrHousing]: [
    /\bno (food|water|housing|accommodation|room)\b/i,
    /\b(starving|homeless|hungry)\b/i,
    /\b(khana|khaana) nahi\b/i,
    /کھانا نہیں/,
    /بھوکا/,
    /رہائش نہیں/,
    /بے گھر/,
    /खाना नहीं/,
    /भूख/,
    /रहने की जगह नहीं/,
    /बेघर/,
    /খাবার নেই/,
    /খেতে দেয় না/,
    /ক্ষুধার্ত/,
    /থাকার জায়গা নেই/,
    /গৃহহীন/,
  ],
  [UrgentCategory.UnsafeWork]: [
    /\b(unsafe|dangerous|injur(ed|y)|accident|heat ?stroke|fainted)\b/i,
    /\b(khatarnak|zakhmi)\b/i,
    /خطرناک/,
    /زخمی/,
    /حادثہ/,
    /بے ہوش/,
    /ख़?तरनाक/,
    /घायल/,
    /ज़?ख़?्मी/,
    /हादसा/,
    /दुर्घटना/,
    /बेहोश/,
    /বিপজ্জনক/,
    /আহত/,
    /দুর্ঘটনা/,
    /অজ্ঞান/,
  ],
  [UrgentCategory.Violence]: [
    /\b(beat|beaten|hit me|abuse[ds]?|assault(ed)?|threat(en|ened)?)\b/i,
    /\bmaar(a|ta)\b/i,
    /مارا/,
    /مارتا/,
    /دھمکی/,
    // Not "मारा" alone, which is inside "हमारा" (our).
    /मुझे मारा/,
    /मारता/,
    /मारपीट/,
    /पीटा/,
    /धमकी/,
    /মারধর/,
    /মেরেছে/,
    /মারছে/,
    /হুমকি/,
  ],
  [UrgentCategory.Confinement]: [
    /\b(locked|trapped|not allowed to leave)\b/i,
    /\b(qaid|band kar)\b/i,
    /قید/,
    /بند کر/,
    /क़?ैद/,
    /बंद कर/,
    /আটকে রেখেছে/,
    /বন্দি/,
    /তালা দিয়ে/,
  ],
};

/** FR-11: spots cases where the worker needs an official helpline before anything else. */
export class UrgentCaseDetector {
  assess(text: string): UrgentAssessment {
    const categories = (Object.keys(PATTERNS) as UrgentCategory[]).filter((category) =>
      PATTERNS[category].some((pattern) => pattern.test(text)),
    );
    return { urgent: categories.length > 0, categories };
  }
}
