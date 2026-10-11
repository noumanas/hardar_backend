import { UrgentCaseDetector, UrgentCategory } from './urgent-case.detector.js';

describe('UrgentCaseDetector', () => {
  const detector = new UrgentCaseDetector();

  it.each([
    ['English passport', 'My company keeps my passport', UrgentCategory.PassportHeld],
    ['Urdu passport', 'کمپنی نے میرا پاسپورٹ رکھ لیا ہے', UrgentCategory.PassportHeld],
    ['no food (English)', 'We have no food in the camp', UrgentCategory.NoFoodOrHousing],
    ['no food (Roman Urdu)', 'khana nahi mila do din se', UrgentCategory.NoFoodOrHousing],
    ['no food (Urdu)', 'دو دن سے کھانا نہیں ملا', UrgentCategory.NoFoodOrHousing],
    ['injury', 'My friend was injured at the site', UrgentCategory.UnsafeWork],
    ['dangerous work (Urdu)', 'کام بہت خطرناک ہے', UrgentCategory.UnsafeWork],
    ['violence', 'The supervisor hit me', UrgentCategory.Violence],
    ['violence (Urdu)', 'سپروائزر نے مجھے مارا', UrgentCategory.Violence],
    ['confinement', 'We are locked in the room', UrgentCategory.Confinement],
    ['confinement (Urdu)', 'ہمیں کمرے میں بند کر دیا', UrgentCategory.Confinement],
  ])('spots %s', (_case, text, category) => {
    expect(detector.assess(text)).toEqual({ urgent: true, categories: [category] });
  });

  it('reports every category that applies', () => {
    expect(detector.assess('They took my passport and there is no food').categories).toEqual([
      UrgentCategory.PassportHeld,
      UrgentCategory.NoFoodOrHousing,
    ]);
  });

  it.each(['How much end-of-service money will I get?', 'میری تنخواہ دو مہینے سے نہیں آئی'])(
    'does not raise an alarm for an ordinary question: %s',
    (text) => {
      expect(detector.assess(text)).toEqual({ urgent: false, categories: [] });
    },
  );
});
