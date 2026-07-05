// Dekodowanie anty-spamowych zapisów adresów e-mail spotykanych na
// niemieckich stronach (Impressum/Kontakt), np.:
//   info (at) firma (punkt) de   ->  info@firma.de
//   kontakt[at]firma[dot]de      ->  kontakt@firma.de
//   service {at} firma.de        ->  service@firma.de
//
// Konserwatywnie: "at" musi być ujęte w nawiasy (()/[]/{}), żeby zwykłe
// zdania ("open at five") nie zamieniały się w adresy.

const OBFUSCATED_EMAIL_PATTERN = new RegExp(
  // część lokalna
  "([a-z0-9._%+-]+)" +
    // (at) / [at] / {at} / (@) — z dowolnymi spacjami
    "\\s*[([{]\\s*(?:at|@)\\s*[)\\]}]\\s*" +
    // domena: człony rozdzielone (dot)/(punkt)/[dot] albo zwykłą kropką
    "((?:[a-z0-9-]+)(?:(?:\\s*[([{]\\s*(?:dot|punkt)\\s*[)\\]}]\\s*|\\s*\\.\\s*)[a-z0-9-]+)+)",
  "gi",
);

function normalizeDomainPart(raw: string): string {
  return raw
    .replace(/\s*[([{]\s*(?:dot|punkt)\s*[)\]}]\s*/gi, ".")
    .replace(/\s*\.\s*/g, ".")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// Zwraca tekst z odkodowanymi adresami — dalsza ekstrakcja regexem
// znajdzie je jak zwykłe e-maile.
export function deobfuscateEmailText(text: string): string {
  return text.replace(
    OBFUSCATED_EMAIL_PATTERN,
    (_match, localPart: string, domainRaw: string) =>
      `${localPart.toLowerCase()}@${normalizeDomainPart(domainRaw)}`,
  );
}
