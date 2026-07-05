// Test jednostkowy dekodera zapisów anty-spamowych (offline, bez bazy i sieci).
// Uruchom: npx tsx scripts/testEmailDeobfuscation.ts

import { deobfuscateEmailText } from "../src/lib/core/emailDeobfuscation";

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi;

function extract(line: string): string[] {
  return (deobfuscateEmailText(line).match(EMAIL_REGEX) ?? []).map((e) =>
    e.toLowerCase(),
  );
}

const cases: Array<[string, string[]]> = [
  ["info (at) mueller-elektro (punkt) de", ["info@mueller-elektro.de"]],
  ["kontakt[at]firma[dot]de", ["kontakt@firma.de"]],
  ["service {at} firma.de", ["service@firma.de"]],
  ["mail: buero (AT) elektro-schmidt (PUNKT) de, tel: 0911...", ["buero@elektro-schmidt.de"]],
  ["E-Mail: max.mustermann (at) sub.firma (dot) de", ["max.mustermann@sub.firma.de"]],
  ["zwykly adres info@firma.de zostaje", ["info@firma.de"]],
  ["we open at five, close at ten", []],
  ["Treffpunkt at Hauptbahnhof dot Nord", []],
  ["impressum ohne mail", []],
  ["info(at)firma(punkt)de und post[at]zweite[dot]com", ["info@firma.de", "post@zweite.com"]],
];

let failures = 0;

for (const [input, expected] of cases) {
  const got = extract(input);
  const ok =
    got.length === expected.length && got.every((g, i) => g === expected[i]);
  if (!ok) {
    failures++;
    console.log(`FAIL: "${input}"`);
    console.log(`   oczekiwano: ${JSON.stringify(expected)}`);
    console.log(`   otrzymano:  ${JSON.stringify(got)}`);
  } else {
    console.log(`ok: "${input}" -> ${JSON.stringify(got)}`);
  }
}

console.log("");
console.log(failures === 0 ? "TEST-OK: wszystkie przypadki przechodzą" : `TEST-FAIL: ${failures} przypadków nie przeszło`);
process.exit(failures === 0 ? 0 : 1);
