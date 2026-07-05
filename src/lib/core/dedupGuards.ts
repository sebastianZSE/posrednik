// Bezpieczniki deduplikacji przy imporcie firm.
//
// Problem, który rozwiązują (audyt 2026-07-05): scalanie firm po domenie lub
// telefonie sklejało RÓŻNE firmy w jeden rekord, gdy dzieliły wspólny portal
// (np. elektrikerportal.com — 69 firm w jednym rekordzie) albo wspólny numer.

// Domeny współdzielone przez wiele firm — nigdy nie są kluczem scalania.
export const SHARED_DOMAINS = new Set([
  "elektrikerportal.com",
  "sites.google.com",
  "google.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "xing.com",
  "youtube.com",
  "gelbeseiten.de",
  "dasoertliche.de",
  "11880.com",
  "wlw.de",
  "yelp.de",
  "yelp.com",
]);

export function isSharedDomain(domain: string | null | undefined): boolean {
  if (!domain) return false;
  return SHARED_DOMAINS.has(domain.trim().toLowerCase());
}

// Tokeny zbyt ogólne, by świadczyć o tożsamości firmy elektrycznej.
const GENERIC_NAME_TOKENS = new Set([
  "elektro",
  "elektrotechnik",
  "elektroinstallation",
  "elektroinstallationen",
  "elektroservice",
  "elektroanlagen",
  "elektronik",
  "elektrogeschaft",
  "elektriker",
  "installation",
  "installationen",
  "technik",
  "service",
  "meisterbetrieb",
  "inhaber",
  "gmbh",
  "und",
  "der",
  "die",
  "das",
]);

function significantTokens(name: string): Set<string> {
  return new Set(
    name
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4 && !GENERIC_NAME_TOKENS.has(token)),
  );
}

// true = scalenie dozwolone. Blokuje tylko, gdy OBIE nazwy istnieją,
// obie mają znaczące tokeny i nie dzielą żadnego z nich.
export function hasSignificantNameOverlap(
  nameA: string | null | undefined,
  nameB: string | null | undefined,
): boolean {
  if (!nameA || !nameB) return true;

  const tokensA = significantTokens(nameA);
  const tokensB = significantTokens(nameB);

  if (tokensA.size === 0 || tokensB.size === 0) return true;

  for (const token of tokensA) {
    if (tokensB.has(token)) return true;
  }

  return false;
}
