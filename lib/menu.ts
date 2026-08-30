/**
 * Single source of truth for every tool in the app.
 * Each entry carries BOTH a plain-language farmer label ("Will it pay to store?")
 * and the technical name, so Simple mode and Expert mode read from one list.
 * Farmers pin any of these to their own home screen.
 */
import { TILE, TileKey } from './images';

export type Tool = {
  route: string;
  simple: string;      // plain words, max ~3
  expert: string;      // technical name
  hint: string;        // one short sentence a farmer understands
  icon: string;
  tile: TileKey;
  group: 'field' | 'money' | 'village' | 'trust';
  pinnable: boolean;
};

export const TOOLS: Tool[] = [
  // ── field ───────────────────────────────────────────────────────────────
  { route: 'Irrigation', simple: 'Water today?', expert: 'FAO-56 irrigation', hint: 'How much water your field needs today', icon: 'water', tile: 'water', group: 'field', pinnable: true },
  { route: 'Scan', simple: 'Check my crop', expert: 'Disease & quality scan', hint: 'Photograph a leaf or your produce', icon: 'camera', tile: 'scan', group: 'field', pinnable: true },
  { route: 'Twin', simple: 'What if…', expert: 'Digital twin simulation', hint: 'Try changes before you spend money', icon: 'cube', tile: 'learn', group: 'field', pinnable: true },
  { route: 'FieldMap', simple: 'Field map', expert: 'Live map & scouting', hint: 'See your land, your position and weak patches', icon: 'map', tile: 'village', group: 'field', pinnable: true },
  { route: 'CropDetail', simple: 'About my crop', expert: 'Crop guide & water needs', hint: 'Everything about your crop, live', icon: 'leaf', tile: 'seed', group: 'field', pinnable: true },
  { route: 'Scouting', simple: 'Satellite view', expert: 'Sentinel-2 auto-scouting', hint: 'Satellite finds weak patches for you', icon: 'earth', tile: 'village', group: 'field', pinnable: true },
  { route: 'PestSentinel', simple: 'Spray safely', expert: 'Pest-resistance sentinel', hint: 'Stop pests getting used to your spray', icon: 'shield-half', tile: 'doctor', group: 'field', pinnable: true },
  { route: 'Intercrop', simple: 'Two crops', expert: 'Intercropping planner', hint: 'Grow a second crop in the same field', icon: 'git-merge', tile: 'seed', group: 'field', pinnable: true },
  { route: 'Seeds', simple: 'Which seed?', expert: 'Variety doctor & seed exchange', hint: 'Pick the right variety, swap seed', icon: 'flower', tile: 'seed', group: 'field', pinnable: true },
  { route: 'ARSpray', simple: 'Spray check', expert: 'AR spray verification', hint: 'Did the spray actually reach the leaf?', icon: 'scan-circle', tile: 'doctor', group: 'field', pinnable: true },
  { route: 'Livestock', simple: 'My animals', expert: 'Livestock health', hint: 'Milk, feed and vaccination reminders', icon: 'paw', tile: 'animal', group: 'field', pinnable: true },
  { route: 'Disaster', simple: 'Storm help', expert: 'Disaster mode', hint: 'What to do before and after a storm', icon: 'thunderstorm', tile: 'weather', group: 'field', pinnable: true },

  // ── money ───────────────────────────────────────────────────────────────
  { route: 'Market', simple: 'Best price', expert: 'Mandi net-price comparison', hint: 'Where you earn the most after costs', icon: 'storefront', tile: 'market', group: 'money', pinnable: true },
  { route: 'ColdChain', simple: 'Store or sell?', expert: 'Cold-chain advisor', hint: 'Does keeping it longer pay?', icon: 'snow', tile: 'price', group: 'money', pinnable: true },
  { route: 'Finance', simple: 'Loan & cover', expert: 'FarmScore & insurance', hint: 'Credit without land papers, fast claims', icon: 'wallet', tile: 'money', group: 'money', pinnable: true },
  { route: 'Equipment', simple: 'Rent machine', expert: 'Equipment sharing', hint: 'Hire a tractor or sprayer nearby', icon: 'construct', tile: 'village', group: 'money', pinnable: true },
  { route: 'FPO', simple: 'Group money', expert: 'FPO group ledger', hint: 'Shared accounts nobody can change', icon: 'people-circle', tile: 'money', group: 'money', pinnable: true },
  { route: 'Carbon', simple: 'Earn green', expert: 'Carbon credits & pollinator badge', hint: 'Get paid for good practices', icon: 'earth-outline', tile: 'seed', group: 'money', pinnable: true },

  // ── village ─────────────────────────────────────────────────────────────
  { route: 'Advisor', simple: 'Ask expert', expert: 'Offline AI agronomist', hint: 'Ask anything, in your language', icon: 'chatbubbles', tile: 'learn', group: 'village', pinnable: true },
  { route: 'Outbreak', simple: 'Village alert', expert: 'Disease Watch (village radar)', hint: 'Disease news from farms near you', icon: 'warning', tile: 'village', group: 'village', pinnable: true },
  { route: 'Live', simple: 'Live now', expert: 'Realtime event stream', hint: 'See everything happening right now', icon: 'pulse', tile: 'weather', group: 'village', pinnable: true },
  { route: 'Mesh', simple: 'Share data', expert: 'Mesh sync', hint: 'Works with no signal, syncs later', icon: 'git-network', tile: 'village', group: 'village', pinnable: true },
  { route: 'SecureChat', simple: 'Safe chat', expert: 'Encrypted chat', hint: 'Private messages to buyers', icon: 'lock-closed', tile: 'passport', group: 'village', pinnable: true },
  { route: 'Family', simple: 'My family', expert: 'Family delegation', hint: 'Let family use parts of the app', icon: 'people-outline', tile: 'village', group: 'village', pinnable: true },
  { route: 'Academy', simple: 'Learn', expert: 'Academy', hint: '5-minute lessons that pay off', icon: 'school', tile: 'learn', group: 'village', pinnable: true },
  { route: 'Channels', simple: 'No smartphone', expert: 'WhatsApp / SMS / USSD / IVR', hint: 'Works on any old phone too', icon: 'chatbox-ellipses', tile: 'village', group: 'village', pinnable: true },
  { route: 'Robotics', simple: 'Machines', expert: 'Robotics & IoT', hint: 'Valves, sensors and rovers', icon: 'hardware-chip', tile: 'weather', group: 'village', pinnable: true },

  // ── trust ───────────────────────────────────────────────────────────────
  { route: 'Passport', simple: 'Crop proof', expert: 'Farm Passport', hint: 'A QR that proves how you grew it', icon: 'qr-code', tile: 'passport', group: 'trust', pinnable: true },
  { route: 'Security', simple: 'Safety', expert: 'Security centre', hint: 'How your data is protected', icon: 'shield-checkmark', tile: 'passport', group: 'trust', pinnable: true },
  { route: 'Dashboard', simple: 'All numbers', expert: 'Expert dashboard', hint: 'Every figure behind the advice', icon: 'stats-chart', tile: 'price', group: 'trust', pinnable: true },
  { route: 'Settings', simple: 'Settings', expert: 'Settings', hint: 'Language, voice, text size', icon: 'settings', tile: 'learn', group: 'trust', pinnable: false },
];

export const toolByRoute = (route: string) => TOOLS.find((t) => t.route === route);
export const tileFor = (route: string) => TILE[(toolByRoute(route)?.tile ?? 'learn') as TileKey];

export const GROUP_LABEL: Record<Tool['group'], { simple: string; expert: string; icon: string }> = {
  field: { simple: 'My field', expert: 'Field intelligence', icon: 'leaf' },
  money: { simple: 'My money', expert: 'Money & markets', icon: 'cash' },
  village: { simple: 'My village', expert: 'Village network', icon: 'people' },
  trust: { simple: 'Trust', expert: 'Trust & control', icon: 'shield-checkmark' },
};
