import { languageOf, type Language } from '../../workers/domain/language.js';

export interface FixedReplies {
  /** FR-4: sent once the worker has chosen a language. */
  greetingAndConsent: string;
  menu: string;
  consentDeclined: string;
  /** FR-14. */
  dataDeleted: string;
  voiceNotUnderstood: string;
  photoUnclear: string;
  unsupportedMessage: string;
  /** FR-11: placed before the answer whenever a case looks urgent. */
  urgentNotice: string;
  /** Sent when the agent can't answer, so the worker always has the official route. */
  fallback: string;
}

/**
 * Fixed replies sent without the LLM, in simple language. Keeping them in code means consent,
 * safety and error messages are always exactly these words. The Hindi and Bengali texts
 * should be checked by a native speaker before launch.
 */
export const REPLIES: Record<Language, FixedReplies> = {
  ur: {
    greetingAndConsent:
      'السلام علیکم! میں حقدار ہوں، ایک مفت مددگار۔ میں وکیل نہیں ہوں۔ ' +
      'میں آپ کو یو اے ای کے لیبر قانون کے بارے میں معلومات دیتا ہوں اور وزارتِ محنت (MOHRE) تک پہنچنے میں مدد کرتا ہوں۔\n\n' +
      'آپ کے پیغامات پڑھنے کے لیے آپ کی اجازت چاہیے۔ اگر آپ راضی ہیں تو "ہاں" لکھیں، ورنہ "نہیں" لکھیں۔',
    menu:
      'شکریہ! میں ان کاموں میں مدد کر سکتا ہوں:\n' +
      '1. میرا معاہدہ پڑھیں: معاہدے کی تصویر بھیجیں\n' +
      '2. سوال پوچھیں: اپنے حقوق کے بارے میں\n' +
      '3. میرے پیسوں کا حساب: اوور ٹائم یا سروس کے آخر کی رقم\n' +
      '4. شکایت میں مدد: MOHRE میں شکایت کا طریقہ\n\n' +
      'وائس نوٹ یا پیغام بھیجیں۔ زبان بدلنے کے لیے "زبان" لکھیں۔ اپنا سارا ڈیٹا ختم کرنے کے لیے "ڈیٹا ختم کریں" لکھیں۔',
    consentDeclined:
      'ٹھیک ہے۔ آپ کی اجازت کے بغیر میں آپ کے پیغامات محفوظ نہیں کروں گا۔ ' +
      'جب چاہیں "ہاں" لکھ کر شروع کریں۔ سرکاری مدد کے لیے MOHRE کو 600590000 پر کال کریں۔',
    dataDeleted: 'آپ کا تمام ڈیٹا حذف کر دیا گیا ہے۔ دوبارہ بات کرنے کے لیے کوئی بھی پیغام بھیجیں۔',
    voiceNotUnderstood: 'معاف کیجیے، میں آپ کا وائس نوٹ نہیں سمجھ سکا۔ براہ کرم دوبارہ بولیں یا لکھ کر بھیجیں۔',
    photoUnclear: 'تصویر واضح نہیں ہے۔ براہ کرم روشنی میں معاہدے کے پورے صفحے کی صاف تصویر بھیجیں۔',
    unsupportedMessage: 'میں ابھی صرف پیغام، وائس نوٹ اور معاہدے کی تصویر سمجھ سکتا ہوں۔',
    urgentNotice:
      'یہ ایک سنگین معاملہ لگتا ہے۔ فوری مدد کے لیے MOHRE کو 600590000 پر کال کریں۔ ' +
      'اگر آپ کی جان کو خطرہ ہو تو پولیس کو 999 پر کال کریں۔',
    fallback: 'معاف کیجیے، ابھی جواب دینے میں مسئلہ ہے۔ فوری مدد کے لیے MOHRE کو 600590000 پر کال کریں۔',
  },
  hi: {
    greetingAndConsent:
      'नमस्ते! मैं हक़दार हूँ, एक मुफ़्त मददगार। मैं वकील नहीं हूँ। ' +
      'मैं आपको यूएई के श्रम क़ानून के बारे में जानकारी देता हूँ और श्रम मंत्रालय (MOHRE) तक पहुँचने में मदद करता हूँ।\n\n' +
      'आपके संदेश पढ़ने के लिए मुझे आपकी अनुमति चाहिए। अगर आप सहमत हैं तो "हाँ" लिखें, नहीं तो "नहीं" लिखें।',
    menu:
      'धन्यवाद! मैं इन कामों में मदद कर सकता हूँ:\n' +
      '1. मेरा अनुबंध पढ़ें: अनुबंध की फ़ोटो भेजें\n' +
      '2. सवाल पूछें: अपने अधिकारों के बारे में\n' +
      '3. मेरे पैसों का हिसाब: ओवरटाइम या नौकरी ख़त्म होने की रक़म (ग्रेच्युटी)\n' +
      '4. शिकायत में मदद: MOHRE में शिकायत का तरीक़ा\n\n' +
      'वॉइस नोट या संदेश भेजें। भाषा बदलने के लिए "भाषा" लिखें। अपना सारा डेटा मिटाने के लिए "डेटा मिटाएं" लिखें।',
    consentDeclined:
      'ठीक है। आपकी अनुमति के बिना मैं आपके संदेश सेव नहीं करूँगा। ' +
      'जब चाहें "हाँ" लिखकर शुरू करें। सरकारी मदद के लिए MOHRE को 600590000 पर कॉल करें।',
    dataDeleted: 'आपका सारा डेटा मिटा दिया गया है। फिर से बात करने के लिए कोई भी संदेश भेजें।',
    voiceNotUnderstood: 'माफ़ कीजिए, मैं आपका वॉइस नोट नहीं समझ सका। कृपया फिर से बोलें या लिखकर भेजें।',
    photoUnclear: 'फ़ोटो साफ़ नहीं है। कृपया रोशनी में अनुबंध के पूरे पन्ने की साफ़ फ़ोटो भेजें।',
    unsupportedMessage: 'मैं अभी सिर्फ़ संदेश, वॉइस नोट और अनुबंध की फ़ोटो समझ सकता हूँ।',
    urgentNotice:
      'यह एक गंभीर मामला लगता है। तुरंत मदद के लिए MOHRE को 600590000 पर कॉल करें। ' +
      'अगर आपकी जान को ख़तरा हो तो पुलिस को 999 पर कॉल करें।',
    fallback: 'माफ़ कीजिए, अभी जवाब देने में दिक़्क़त है। तुरंत मदद के लिए MOHRE को 600590000 पर कॉल करें।',
  },
  bn: {
    greetingAndConsent:
      'আসসালামু আলাইকুম! আমি হকদার, একজন বিনামূল্যের সাহায্যকারী। আমি উকিল নই। ' +
      'আমি আপনাকে সংযুক্ত আরব আমিরাতের শ্রম আইন সম্পর্কে তথ্য দিই এবং শ্রম মন্ত্রণালয় (MOHRE)-এর কাছে পৌঁছাতে সাহায্য করি।\n\n' +
      'আপনার বার্তা পড়ার জন্য আপনার অনুমতি দরকার। রাজি থাকলে "হ্যাঁ" লিখুন, না হলে "না" লিখুন।',
    menu:
      'ধন্যবাদ! আমি এই কাজগুলোতে সাহায্য করতে পারি:\n' +
      '1. আমার চুক্তি পড়ুন: চুক্তির ছবি পাঠান\n' +
      '2. প্রশ্ন করুন: আপনার অধিকার সম্পর্কে\n' +
      '3. আমার টাকার হিসাব: ওভারটাইম বা চাকরি শেষের টাকা (গ্র্যাচুইটি)\n' +
      '4. অভিযোগে সাহায্য: MOHRE-তে অভিযোগ করার নিয়ম\n\n' +
      'ভয়েস নোট বা বার্তা পাঠান। ভাষা বদলাতে "ভাষা" লিখুন। আপনার সব ডেটা মুছতে "ডেটা মুছুন" লিখুন।',
    consentDeclined:
      'ঠিক আছে। আপনার অনুমতি ছাড়া আমি আপনার বার্তা সংরক্ষণ করব না। ' +
      'যখন চান "হ্যাঁ" লিখে শুরু করুন। সরকারি সাহায্যের জন্য MOHRE-কে 600590000 নম্বরে কল করুন।',
    dataDeleted: 'আপনার সব ডেটা মুছে ফেলা হয়েছে। আবার কথা বলতে যেকোনো বার্তা পাঠান।',
    voiceNotUnderstood: 'দুঃখিত, আমি আপনার ভয়েস নোট বুঝতে পারিনি। দয়া করে আবার বলুন বা লিখে পাঠান।',
    photoUnclear: 'ছবিটি পরিষ্কার নয়। দয়া করে আলোতে চুক্তির পুরো পাতার একটি পরিষ্কার ছবি পাঠান।',
    unsupportedMessage: 'আমি এখন শুধু বার্তা, ভয়েস নোট আর চুক্তির ছবি বুঝতে পারি।',
    urgentNotice:
      'এটি একটি গুরুতর বিষয় মনে হচ্ছে। দ্রুত সাহায্যের জন্য MOHRE-কে 600590000 নম্বরে কল করুন। ' +
      'আপনার জীবনের ঝুঁকি থাকলে পুলিশকে 999 নম্বরে কল করুন।',
    fallback: 'দুঃখিত, এখন উত্তর দিতে সমস্যা হচ্ছে। দ্রুত সাহায্যের জন্য MOHRE-কে 600590000 নম্বরে কল করুন।',
  },
  en: {
    greetingAndConsent:
      'Hello! I am Haqdar, a free helper. I am not a lawyer. ' +
      'I give you information about UAE labour law and help you reach the Ministry of Human Resources (MOHRE).\n\n' +
      'I need your permission to read your messages. If you agree, write "yes". If not, write "no".',
    menu:
      'Thank you! I can help you with:\n' +
      '1. Read my contract: send a photo of your contract\n' +
      '2. Ask a question: about your rights\n' +
      '3. Check my money: overtime or end-of-service pay\n' +
      '4. Help with a complaint: how to complain to MOHRE\n\n' +
      'Send a voice note or a message. To change language, write "language". To delete all your data, write "delete my data".',
    consentDeclined:
      'Okay. Without your permission I will not save your messages. ' +
      'Write "yes" whenever you want to start. For official help, call MOHRE on 600590000.',
    dataDeleted: 'All your data has been deleted. Send any message to talk again.',
    voiceNotUnderstood: 'Sorry, I could not understand your voice note. Please speak again or type your message.',
    photoUnclear: 'The photo is not clear. Please send a clear photo of the full contract page in good light.',
    unsupportedMessage: 'Right now I can only understand messages, voice notes and photos of a contract.',
    urgentNotice:
      'This sounds serious. For urgent help, call MOHRE on 600590000. ' +
      'If your life is in danger, call the police on 999.',
    fallback: 'Sorry, I cannot answer right now. For urgent help, call MOHRE on 600590000.',
  },
};

export const repliesFor = (worker: { language: string | null }): FixedReplies => REPLIES[languageOf(worker)];

/**
 * The first message every new worker gets, in all four languages at once because their
 * language is not known yet. Sent as text only: a voice note can't read four scripts well.
 */
export const LANGUAGE_MENU =
  'Haqdar · حقدار\n' +
  'اپنی زبان چنیں · अपनी भाषा चुनें · আপনার ভাষা বেছে নিন · Choose your language\n\n' +
  '1. اردو (Urdu)\n' +
  '2. हिन्दी (Hindi)\n' +
  '3. বাংলা (Bangla)\n' +
  '4. English\n\n' +
  'Reply 1, 2, 3 or 4.';

/** How the agent is told which language to write in, appended to its standing instructions. */
export const LANGUAGE_INSTRUCTIONS: Record<Language, string> = {
  ur: 'The worker chose Urdu. Write every reply in simple Urdu in Urdu script (not Roman Urdu).',
  hi: 'The worker chose Hindi. Write every reply in simple Hindi in Devanagari script (not Roman Hindi).',
  bn: 'The worker chose Bengali. Write every reply in simple Bengali (Bangla) in Bengali script.',
  en: 'The worker chose English. Write every reply in simple English.',
};
