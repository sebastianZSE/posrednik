// normalizeCountryCode(...)

// To mały helper, żeby nie powtarzać wszędzie:

// country.trim().toUpperCase()
// warunku dla DE / AT / CH

// To jest mały krok do spójności.

// normalizeEmail(...)

// Ta wersja jest lepsza niż lokalna z importEnrichResults.ts, bo:

// czyści mailto:
// czyści końcówki typu ; ) . :
// odrzuca example.com
// trzyma lowercase

// To nadal jest normalizacja, nie walidacja biznesowa.

// normalizePhone(...)

// Ta wersja:

// czyści tel:
// próbuje poprawnie zparsować numer przez libphonenumber-js
// jeśli parser nie da rady, robi fallback

// To jest dobry, praktyczny standard dla Twojego pipeline’u.



import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

function normalizeCountryCode(
  country: string | null | undefined,
): CountryCode | undefined {
  if (!country) return undefined;

  const normalized = country.trim().toUpperCase();

  if (normalized === "DE" || normalized === "AT" || normalized === "CH") {
    return normalized as CountryCode;
  }

  return undefined;
}

export function normalizeEmail(
  email: string | null | undefined,
): string | null {
  if (!email) return null;

  const normalized = email
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, "")
    .replace(/[),.;:]+$/g, "");

  if (!normalized) return null;
  if (!normalized.includes("@")) return null;
  if (normalized.includes("example.com")) return null;
  if (normalized.length > 120) return null;

  return normalized;
}

export function normalizePhone(
  phone: string | null | undefined,
  country: string | null | undefined,
): string | null {
  if (!phone) return null;

  const cleaned = phone
    .trim()
    .replace(/^tel:/i, "");

  if (!cleaned) return null;

  const countryCode = normalizeCountryCode(country);

  try {
    const parsed = parsePhoneNumberFromString(cleaned, countryCode);

    if (parsed?.isValid()) {
      return parsed.number;
    }
  } catch {
  }

  const fallback = cleaned
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+");

  return fallback || null;
}