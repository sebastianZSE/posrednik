// jakie strony sprawdzamy
// jakie linki traktujemy jako kontaktowe
// jakie hosty ignorujemy

// Dzięki temu nie piszesz skryptu “na cały świat”, tylko skrypt pod realny use case:
// niemiecka firma, niemiecka strona, kontakt i impressum

export const deRules = {
  country: "DE",
  source: "deWebsiteExtractor",
  targetStatus: "enrich",
  maxCompaniesPerRun: 25,
  maxWebsiteEnrichAttempts: 3,
  maxPagesPerCompany: 5,
  requestTimeoutMs: 10000,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",

  contactPathHints: [
    "/kontakt",
    "/kontakt/",
    "/contact",
    "/contact/",
    "/impressum",
    "/impressum/",
    "/standorte",
    "/standorte/",
    "/ueber-uns",
    "/uber-uns",
    "/about",
    "/about-us",
  ],

  contactTextHints: [
    "kontakt",
    "contact",
    "impressum",
    "standorte",
    "ueber uns",
    "uber uns",
    "about",
    "anfahrt",
  ],

  blockedHosts: [
    "facebook.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "tiktok.com",
    "xing.com",
    "twitter.com",
    "x.com",
  ],
};

export function normalizeHintValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBlockedHost(host: string) {
  const normalizedHost = host.trim().toLowerCase();

  return deRules.blockedHosts.some(
    (blockedHost) =>
      normalizedHost === blockedHost ||
      normalizedHost.endsWith(`.${blockedHost}`),
  );
}

export function isLikelyContactLink(params: { href: string; text: string }) {
  const normalizedHref = normalizeHintValue(params.href);
  const normalizedText = normalizeHintValue(params.text);

  const hrefMatch = deRules.contactTextHints.some((hint) =>
    normalizedHref.includes(hint),
  );

  const textMatch = deRules.contactTextHints.some((hint) =>
    normalizedText.includes(hint),
  );

  return hrefMatch || textMatch;
}
