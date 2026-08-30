/**
 * Static image registry. Metro needs literal require() calls, so every bundled
 * illustration is listed here once and referenced by key everywhere else.
 * All artwork is generated offline by scripts/make_assets.py (Pillow) and
 * ships inside the app — nothing is fetched from a network at runtime.
 */
import type { CropKey } from './agro';

export const HERO = {
  farm: require('../assets/images/hero_farm.png'),
  market: require('../assets/images/hero_market.png'),
  help: require('../assets/images/hero_help.png'),
  splash: require('../assets/images/hero_splash.png'),
};

export const CROP_IMG: Record<CropKey, any> = {
  tomato: require('../assets/images/crop_tomato.png'),
  wheat: require('../assets/images/crop_wheat.png'),
  rice: require('../assets/images/crop_rice.png'),
  onion: require('../assets/images/crop_onion.png'),
  potato: require('../assets/images/crop_potato.png'),
  cotton: require('../assets/images/crop_cotton.png'),
  chilli: require('../assets/images/crop_chilli.png'),
  maize: require('../assets/images/crop_maize.png'),
  banana: require('../assets/images/crop_banana.png'),
  grape: require('../assets/images/crop_grape.png'),
};

export const TILE = {
  scan: require('../assets/images/tile_scan.png'),
  price: require('../assets/images/tile_price.png'),
  water: require('../assets/images/tile_water.png'),
  doctor: require('../assets/images/tile_doctor.png'),
  market: require('../assets/images/tile_market.png'),
  learn: require('../assets/images/tile_learn.png'),
  village: require('../assets/images/tile_village.png'),
  money: require('../assets/images/tile_money.png'),
  passport: require('../assets/images/tile_passport.png'),
  weather: require('../assets/images/tile_weather.png'),
  animal: require('../assets/images/tile_animal.png'),
  seed: require('../assets/images/tile_seed.png'),
};
export type TileKey = keyof typeof TILE;

export const WX = {
  sunny: require('../assets/images/wx_sunny.png'),
  cloudy: require('../assets/images/wx_cloudy.png'),
  rainy: require('../assets/images/wx_rainy.png'),
  storm: require('../assets/images/wx_storm.png'),
};

export const AVATARS = [
  require('../assets/images/avatar_1.png'),
  require('../assets/images/avatar_2.png'),
  require('../assets/images/avatar_3.png'),
  require('../assets/images/avatar_4.png'),
];

export const EMPTY = {
  scan: require('../assets/images/empty_scan.png'),
  market: require('../assets/images/empty_market.png'),
  leaf: require('../assets/images/empty_leaf.png'),
};

export const BADGE_POLLINATOR = require('../assets/images/badge_pollinator.png');

export const avatarFor = (seed: string) => {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
};

export const wxFor = (rainMm: number, windMs = 0) =>
  rainMm > 25 || windMs > 8 ? WX.storm : rainMm > 8 ? WX.rainy : rainMm > 0 ? WX.cloudy : WX.sunny;
