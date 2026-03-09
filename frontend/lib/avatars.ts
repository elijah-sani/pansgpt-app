const AVATAR_BASE_URL = 'https://api.dicebear.com/9.x/toon-head/svg';
const AVATAR_QUERY =
  'translateY=5&beardProbability=30&eyebrows=happy,neutral,raised,sad,angry&hairColor=2c1b18,724133,a55728,b58143&backgroundColor=ffdfbf,ffd5dc,d1d4f9,c0aede,b6e3f4';

export const DEFAULT_AVATAR_SEEDS = [
  'atlas',
  'nova',
  'sage',
  'milo',
  'zuri',
  'kora',
  'lyra',
  'jasper',
  'niko',
  'talia',
  'orion',
  'sanaa',
] as const;

export function buildAvatarUrl(seed: string) {
  return `${AVATAR_BASE_URL}?${AVATAR_QUERY}&seed=${encodeURIComponent(seed)}`;
}

export function getRandomDefaultAvatarUrl() {
  const seed = DEFAULT_AVATAR_SEEDS[Math.floor(Math.random() * DEFAULT_AVATAR_SEEDS.length)] ?? 'atlas';
  return buildAvatarUrl(seed);
}
