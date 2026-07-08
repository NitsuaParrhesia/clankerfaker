export type LocalProfile = {
  id: string;
  displayName: string;
  createdAt: number;
};

const PROFILE_STORAGE_KEY = "clanker-faker-profile-v1";
const PROFILE_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const PROFILE_ID_LENGTH = 18;
const PROFILE_ID_PATTERN = /^cf_[A-Za-z0-9_-]{18}$/u;
const LEGACY_DEFAULT_DISPLAY_NAME_PATTERN = /^Clanker [A-Z0-9]{4}$/u;
const CURRENT_DEFAULT_DISPLAY_NAME_PATTERN = /^[A-Za-z]+[A-Za-z]+#\d{4}$/u;
const NAME_ADJECTIVES = [
  "Sneaky",
  "Rusty",
  "Chrome",
  "Static",
  "Wobbly",
  "Turbo",
  "Covert",
  "Shifty",
  "Jittery",
  "Secret",
  "Spark",
  "Rogue",
  "Fizzy",
  "Patchy",
  "Clever",
  "Tinny",
];
const NAME_NOUNS = [
  "Servo",
  "Clanker",
  "Circuit",
  "Widget",
  "Cog",
  "Bolt",
  "Module",
  "Gizmo",
  "Decoy",
  "Switch",
  "Scanner",
  "Gear",
  "Relay",
  "Bot",
  "Droid",
  "Unit",
];

export function getLocalProfile(): LocalProfile {
  const stored = readStoredProfile();
  if (stored) {
    return stored;
  }

  const profile = createLocalProfile();
  writeStoredProfile(profile);
  return profile;
}

function readStoredProfile(): LocalProfile | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const value = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!value) {
      return null;
    }

    const parsed = JSON.parse(value) as Partial<LocalProfile>;
    if (
      typeof parsed.id !== "string" ||
      !PROFILE_ID_PATTERN.test(parsed.id) ||
      typeof parsed.displayName !== "string" ||
      parsed.displayName.trim().length === 0 ||
      typeof parsed.createdAt !== "number"
    ) {
      return null;
    }

    const profile = {
      id: parsed.id,
      displayName: parsed.displayName.slice(0, 32),
      createdAt: parsed.createdAt,
    };

    if (isOutdatedDefaultDisplayName(profile.displayName)) {
      profile.displayName = createDefaultDisplayName(profile.id);
      writeStoredProfile(profile);
    }

    return profile;
  } catch {
    return null;
  }
}

function writeStoredProfile(profile: LocalProfile): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Private browsing or storage restrictions should not block play.
  }
}

function createLocalProfile(): LocalProfile {
  const id = createProfileId();

  return {
    id,
    displayName: createDefaultDisplayName(id),
    createdAt: Date.now(),
  };
}

export function createDefaultDisplayName(profileId: string): string {
  const firstIndex = hashString(`${profileId}:adjective`) % NAME_ADJECTIVES.length;
  const secondIndex = hashString(`${profileId}:noun`) % NAME_NOUNS.length;
  const idNumber = String(hashString(`${profileId}:tag`) % 10_000).padStart(4, "0");
  return `${NAME_ADJECTIVES[firstIndex]}${NAME_NOUNS[secondIndex]}#${idNumber}`;
}

export function resolveProfileDisplayName(displayName: string | null | undefined, profile: LocalProfile): string {
  const resolvedDisplayName = resolveGeneratedProfileDisplayName(profile.id, displayName);
  if (resolvedDisplayName === createDefaultDisplayName(profile.id)) {
    return profile.displayName;
  }

  return resolvedDisplayName;
}

export function resolveGeneratedProfileDisplayName(
  profileId: string,
  displayName: string | null | undefined,
): string {
  const normalized = displayName?.trim();
  if (!normalized || isOutdatedDefaultDisplayName(normalized)) {
    return createDefaultDisplayName(profileId);
  }

  return normalized.slice(0, 32);
}

export function isLegacyDefaultDisplayName(displayName: string): boolean {
  return LEGACY_DEFAULT_DISPLAY_NAME_PATTERN.test(displayName);
}

function isOutdatedDefaultDisplayName(displayName: string): boolean {
  return (
    isLegacyDefaultDisplayName(displayName) ||
    !CURRENT_DEFAULT_DISPLAY_NAME_PATTERN.test(displayName) ||
    isOldWordBankDisplayName(displayName)
  );
}

function isOldWordBankDisplayName(displayName: string): boolean {
  return NAME_ADJECTIVES.some((adjective) =>
    NAME_NOUNS.some((noun) => displayName === `${adjective} ${noun}` || displayName === `${adjective}${noun}`),
  );
}

function createProfileId(): string {
  const bytes = new Uint8Array(PROFILE_ID_LENGTH);
  crypto.getRandomValues(bytes);

  let id = "cf_";
  for (const byte of bytes) {
    id += PROFILE_ID_ALPHABET[byte % PROFILE_ID_ALPHABET.length];
  }

  return id;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
