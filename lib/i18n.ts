/**
 * 9-language interface + voice layer. English is the fallback dictionary, so a
 * missing key in any locale degrades gracefully instead of showing a blank.
 */
export type Lang = 'en' | 'hi' | 'mr' | 'te' | 'ta' | 'kn' | 'gu' | 'bn' | 'pa';

export const LANGS: { code: Lang; name: string; native: string; voice: string; flag: string }[] = [
  { code: 'en', name: 'English', native: 'English', voice: 'en-IN', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'hi', name: 'Hindi', native: '\u0939\u093f\u0928\u094d\u0926\u0940', voice: 'hi-IN', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'mr', name: 'Marathi', native: '\u092e\u0930\u093e\u0920\u0940', voice: 'mr-IN', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'te', name: 'Telugu', native: '\u0c24\u0c46\u0c32\u0c41\u0c17\u0c41', voice: 'te-IN', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'ta', name: 'Tamil', native: '\u0ba4\u0bae\u0bbf\u0bb4\u0bcd', voice: 'ta-IN', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'kn', name: 'Kannada', native: '\u0c95\u0ca8\u0ccd\u0ca8\u0ca1', voice: 'kn-IN', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'gu', name: 'Gujarati', native: '\u0a97\u0ac1\u0a9c\u0ab0\u0abe\u0aa4\u0ac0', voice: 'gu-IN', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'bn', name: 'Bengali', native: '\u09ac\u09be\u0982\u09b2\u09be', voice: 'bn-IN', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'pa', name: 'Punjabi', native: '\u0a2a\u0a70\u0a1c\u0a3e\u0a2c\u0a40', voice: 'pa-IN', flag: '\u{1F1EE}\u{1F1F3}' },
];

type Dict = Record<string, string>;

const en: Dict = {
  home: 'Home', scan: 'Scan', market: 'Market', twin: 'Twin', more: 'More',
  goodMorning: 'Good morning', goodAfternoon: 'Good afternoon', goodEvening: 'Good evening',
  offline: 'Offline', online: 'Online', synced: 'Synced', pending: 'Pending',
  quality: 'Quality', grade: 'Grade', priceRange: 'Price range', netValue: 'Net value',
  sellNow: 'Sell today', hold2: 'Hold 2 days', hold5: 'Hold 5 days',
  irrigation: 'Irrigation', disease: 'Disease', advisor: 'Advisor', passport: 'Farm Passport',
  takePhoto: 'Take photo', pickPhoto: 'Choose photo', analyzing: 'Analysing on device\u2026',
  aiEstimate: 'AI estimate \u2014 not a guaranteed price',
  irrigateNow: 'Irrigate now', holdWater: 'Hold irrigation',
  askAnything: 'Ask anything about your farm', listening: 'Listening\u2026',
  village: 'Village', finance: 'Finance', shop: 'Market', settings: 'Settings',
};

const dicts: Record<Lang, Dict> = {
  en,
  hi: {
    home: '\u0918\u0930', scan: '\u0938\u094d\u0915\u0948\u0928', market: '\u092e\u0902\u0921\u0940', twin: '\u0938\u093f\u092e\u0941\u0932\u0947\u091f\u0930', more: '\u0914\u0930',
    goodMorning: '\u0938\u0941\u092a\u094d\u0930\u092d\u093e\u0924', goodAfternoon: '\u0928\u092e\u0938\u094d\u0924\u0947', goodEvening: '\u0936\u0941\u092d \u0938\u0902\u0927\u094d\u092f\u093e',
    offline: '\u0911\u092b\u093c\u0932\u093e\u0907\u0928', online: '\u0911\u0928\u0932\u093e\u0907\u0928',
    quality: '\u0917\u0941\u0923\u0935\u0924\u094d\u0924\u093e', grade: '\u0917\u094d\u0930\u0947\u0921', priceRange: '\u092e\u0942\u0932\u094d\u092f \u0938\u0940\u092e\u093e', netValue: '\u0936\u0941\u0926\u094d\u0927 \u092e\u0942\u0932\u094d\u092f',
    sellNow: '\u0906\u091c \u092c\u0947\u091a\u0947\u0902', irrigation: '\u0938\u093f\u0902\u091a\u093e\u0908', disease: '\u0930\u094b\u0917', advisor: '\u0938\u0932\u093e\u0939\u0915\u093e\u0930',
    takePhoto: '\u092b\u094b\u091f\u094b \u0932\u0947\u0902', analyzing: '\u092b\u094b\u0928 \u092a\u0930 \u0935\u093f\u0936\u094d\u0932\u0947\u0937\u0923\u2026',
    aiEstimate: 'AI \u0905\u0928\u0941\u092e\u093e\u0928 \u2014 \u0917\u093e\u0930\u0902\u091f\u0940 \u0928\u0939\u0940\u0902',
    askAnything: '\u0905\u092a\u0928\u0947 \u0916\u0947\u0924 \u0915\u0947 \u092c\u093e\u0930\u0947 \u092e\u0947\u0902 \u092a\u0942\u091b\u0947\u0902', village: '\u0917\u093e\u0901\u0935', finance: '\u0935\u093f\u0924\u094d\u0924', settings: '\u0938\u0947\u091f\u093f\u0902\u0917',
  },
  mr: {
    home: '\u0918\u0930', scan: '\u0938\u094d\u0915\u0945\u0928', market: '\u092c\u093e\u091c\u093e\u0930', twin: '\u0938\u093f\u092e\u094d\u092f\u0941\u0932\u0947\u091f\u0930', more: '\u0906\u0923\u0916\u0940',
    goodMorning: '\u0938\u0941\u092a\u094d\u0930\u092d\u093e\u0924', quality: '\u0917\u0941\u0923\u0935\u0924\u094d\u0924\u093e', grade: '\u0926\u0930\u094d\u091c\u093e',
    priceRange: '\u0915\u093f\u0902\u092e\u0924 \u0936\u094d\u0930\u0947\u0923\u0940', irrigation: '\u092a\u093e\u0923\u0940', disease: '\u0930\u094b\u0917', advisor: '\u0938\u0932\u094d\u0932\u093e\u0917\u093e\u0930',
    takePhoto: '\u092b\u094b\u091f\u094b \u0918\u094d\u092f\u093e', village: '\u0917\u093e\u0935', finance: '\u0905\u0930\u094d\u0925', settings: '\u0938\u0947\u091f\u093f\u0902\u0917\u094d\u091c',
  },
  te: {
    home: '\u0c39\u0c4b\u0c2e\u0c4d', scan: '\u0c38\u0c4d\u0c15\u0c3e\u0c28\u0c4d', market: '\u0c2e\u0c3e\u0c30\u0c4d\u0c15\u0c46\u0c1f\u0c4d', twin: '\u0c38\u0c3f\u0c2e\u0c4d\u0c2f\u0c41\u0c32\u0c47\u0c1f\u0c30\u0c4d', more: '\u0c2e\u0c30\u0c3f\u0c28\u0c4d\u0c28\u0c3f',
    quality: '\u0c28\u0c3e\u0c23\u0c4d\u0c2f\u0c24', grade: '\u0c17\u0c4d\u0c30\u0c47\u0c21\u0c4d', irrigation: '\u0c28\u0c40\u0c30\u0c41', disease: '\u0c35\u0c4d\u0c2f\u0c3e\u0c27\u0c3f', advisor: '\u0c38\u0c32\u0c39\u0c26\u0c3e\u0c30\u0c41',
    takePhoto: '\u0c2b\u0c4b\u0c1f\u0c4b \u0c24\u0c40\u0c2f\u0c02\u0c21\u0c3f', village: '\u0c17\u0c4d\u0c30\u0c3e\u0c2e\u0c02', finance: '\u0c06\u0c30\u0c4d\u0c25\u0c3f\u0c15\u0c02', settings: '\u0c38\u0c46\u0c1f\u0c4d\u0c1f\u0c3f\u0c02\u0c17\u0c4d\u0c38\u0c4d',
  },
  ta: {
    home: '\u0bae\u0bc1\u0b95\u0baa\u0bcd\u0baa\u0bc1', scan: '\u0bb8\u0bcd\u0b95\u0bc7\u0ba9\u0bcd', market: '\u0b9a\u0ba8\u0bcd\u0ba4\u0bc8', twin: '\u0b89\u0bb0\u0bc1\u0bb5\u0b95\u0bae\u0bcd', more: '\u0bae\u0bc7\u0bb2\u0bc1\u0bae\u0bcd',
    quality: '\u0ba4\u0bb0\u0bae\u0bcd', grade: '\u0ba4\u0bb0\u0bae\u0bcd \u0ba8\u0bbf\u0bb2\u0bc8', irrigation: '\u0ba8\u0bc0\u0bb0\u0bcd\u0baa\u0bbe\u0b9a\u0ba9\u0bae\u0bcd', disease: '\u0ba8\u0bcb\u0baf\u0bcd', advisor: '\u0b86\u0bb2\u0bcb\u0b9a\u0b95\u0bb0\u0bcd',
    takePhoto: '\u0baa\u0b9f\u0bae\u0bcd \u0b8e\u0b9f\u0bc1', village: '\u0b95\u0bbf\u0bb0\u0bbe\u0bae\u0bae\u0bcd', finance: '\u0ba8\u0bbf\u0ba4\u0bbf', settings: '\u0b85\u0bae\u0bc8\u0baa\u0bcd\u0baa\u0bc1',
  },
  kn: {
    home: '\u0cae\u0ca8\u0cc6', scan: '\u0cb8\u0ccd\u0c95\u0cbe\u0ca8\u0ccd', market: '\u0cae\u0cbe\u0cb0\u0cc1\u0c95\u0c9f\u0ccd\u0c9f\u0cc6', twin: '\u0cb8\u0cbf\u0cae\u0cc1\u0cb2\u0cc7\u0c9f\u0cb0\u0ccd', more: '\u0cb9\u0cc6\u0c9a\u0ccd\u0c9a\u0cc1',
    quality: '\u0c97\u0cc1\u0ca3\u0cae\u0c9f\u0ccd\u0c9f', grade: '\u0ca6\u0cb0\u0ccd\u0c9c\u0cc6', irrigation: '\u0ca8\u0cc0\u0cb0\u0cbe\u0cb5\u0cb0\u0cbf', disease: '\u0cb0\u0acb\u0c97', advisor: '\u0cb8\u0cb2\u0cb9\u0cc6\u0c97\u0cbe\u0cb0',
    takePhoto: '\u0cab\u0ccb\u0c9f\u0ccb \u0ca4\u0cc6\u0c97\u0cc6', village: '\u0c97\u0ccd\u0cb0\u0cbe\u0cae', finance: '\u0cb9\u0ca3\u0c95\u0cbe\u0cb8\u0cc1', settings: '\u0cb8\u0cc6\u0c9f\u0ccd\u0c9f\u0cbf\u0c82\u0c97\u0ccd\u0cb8\u0ccd',
  },
  gu: {
    home: '\u0a98\u0ab0', scan: '\u0ab8\u0acd\u0a95\u0ac5\u0aa8', market: '\u0aac\u0a9c\u0abe\u0ab0', twin: '\u0ab8\u0abf\u0aae\u0acd\u0aaf\u0ac1\u0ab2\u0ac7\u0a9f\u0ab0', more: '\u0ab5\u0aa7\u0ac1',
    quality: '\u0a97\u0ac1\u0aa3\u0ab5\u0aa4\u0acd\u0aa4\u0abe', grade: '\u0a97\u0acd\u0ab0\u0ac7\u0aa1', irrigation: '\u0ab8\u0abf\u0a82\u0a9a\u0abe\u0a88', disease: '\u0ab0\u0acb\u0a97', advisor: '\u0ab8\u0ab2\u0abe\u0ab9\u0a95\u0abe\u0ab0',
    takePhoto: '\u0aab\u0acb\u0a9f\u0acb \u0ab2\u0acb', village: '\u0a97\u0abe\u0aae', finance: '\u0aa8\u0abe\u0aa3\u0abe\u0a82', settings: '\u0ab8\u0ac7\u0a9f\u0abf\u0a82\u0a97\u0acd\u0ab8',
  },
  bn: {
    home: '\u09ac\u09be\u09a1\u09bc\u09bf', scan: '\u09b8\u09cd\u0995\u09cd\u09af\u09be\u09a8', market: '\u09ac\u09be\u099c\u09be\u09b0', twin: '\u09b8\u09bf\u09ae\u09c1\u09b2\u09c7\u099f\u09b0', more: '\u0986\u09b0\u0993',
    quality: '\u09ae\u09be\u09a8', grade: '\u0997\u09cd\u09b0\u09c7\u09a1', irrigation: '\u09b8\u09c7\u099a', disease: '\u09b0\u09cb\u0997', advisor: '\u09aa\u09b0\u09be\u09ae\u09b0\u09cd\u09b6\u09a6\u09be\u09a4\u09be',
    takePhoto: '\u099b\u09ac\u09bf \u09a4\u09c1\u09b2\u09c1\u09a8', village: '\u0997\u09cd\u09b0\u09be\u09ae', finance: '\u0985\u09b0\u09cd\u09a5', settings: '\u09b8\u09c7\u099f\u09bf\u0982\u09b8',
  },
  pa: {
    home: '\u0a18\u0a30', scan: '\u0a38\u0a15\u0a48\u0a28', market: '\u0a2e\u0a70\u0a21\u0a40', twin: '\u0a38\u0a3f\u0a2e\u0a42\u0a32\u0a47\u0a1f\u0a30', more: '\u0a39\u0a4b\u0a30',
    quality: '\u0a17\u0a41\u0a23\u0a35\u0a71\u0a24\u0a3e', grade: '\u0a17\u0a4d\u0a30\u0a47\u0a21', irrigation: '\u0a38\u0a3f\u0a70\u0a1a\u0a3e\u0a08', disease: '\u0a2c\u0a3f\u0a2e\u0a3e\u0a30\u0a40', advisor: '\u0a38\u0a32\u0a3e\u0a39\u0a15\u0a3e\u0a30',
    takePhoto: '\u0a2b\u0a4b\u0a1f\u0a4b \u0a32\u0a13', village: '\u0a2a\u0a3f\u0a70\u0a21', finance: '\u0a35\u0a3f\u0a71\u0a24', settings: '\u0a38\u0a48\u0a1f\u0a3f\u0a70\u0a17\u0a3e\u0a02',
  },
};

export function makeT(lang: Lang) {
  return (key: keyof typeof en | string): string => dicts[lang]?.[key] ?? en[key] ?? String(key);
}

export const voiceLocale = (lang: Lang) => LANGS.find((l) => l.code === lang)?.voice ?? 'en-IN';
