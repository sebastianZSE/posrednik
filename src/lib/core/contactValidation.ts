import {
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js';

export type ContactValidationStatus = 'validLike' | 'risky' | 'invalidLike';
export type EmailKind = 'generic' | 'personal' | 'unknown';

export type ContactValidationMetadata = {
  validationStatus: ContactValidationStatus;
  validationCheckedAt: string;
  validationVersion: string;
  emailKind: EmailKind | null;
  emailSameDomainAsCompany: boolean | null;
  phoneE164: string | null;
  phoneCountryCode: string | null;
};

export const CONTACT_VALIDATION_VERSION = 'contact_validation_v1';

const FREE_EMAIL_PROVIDERS = new Set([
  'gmail.com',
  'googlemail.com',
  'gmx.de',
  'gmx.net',
  'web.de',
  'yahoo.com',
  'yahoo.de',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  't-online.de',
  'freenet.de',
  'arcor.de',
]);

const GENERIC_EMAIL_LOCAL_PARTS = new Set([
  'info',
  'kontakt',
  'contact',
  'mail',
  'office',
  'buero',
  'buro',
  'service',
  'support',
  'team',
  'sales',
  'vertrieb',
  'anfrage',
  'anfragen',
  'admin',
  'post',
  'hello',
  'hallo',
  'buchhaltung',
  'rechnung',
  'jobs',
  'karriere',
]);

function normalizeCountryCode(
  country: string | null | undefined
): CountryCode | undefined {
  if (!country) return undefined;

  const normalized = country.trim().toUpperCase();

  if (normalized === 'DE' || normalized === 'AT' || normalized === 'CH') {
    return normalized as CountryCode;
  }

  return undefined;
}

function normalizeTextForComparison(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDomainValue(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();

  if (!trimmed) return null;

  try {
    const withProtocol = /^https?:\/\//.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

    const url = new URL(withProtocol);

    return (
      url.hostname
        .replace(/^www\./, '')
        .trim()
        .toLowerCase() || null
    );
  } catch {
    return (
      trimmed
        .replace(/^www\./, '')
        .trim()
        .toLowerCase() || null
    );
  }
}

function getEmailParts(normalizedEmail: string) {
  const [localPart = '', domainPart = ''] = normalizedEmail.split('@');

  return {
    localPart: localPart.trim().toLowerCase(),
    domainPart: domainPart.trim().toLowerCase(),
  };
}

function detectEmailKind(localPart: string): EmailKind {
  const normalizedLocalPart = normalizeTextForComparison(localPart);

  if (!normalizedLocalPart) {
    return 'unknown';
  }

  if (GENERIC_EMAIL_LOCAL_PARTS.has(normalizedLocalPart)) {
    return 'generic';
  }

  const genericPrefixMatch = [...GENERIC_EMAIL_LOCAL_PARTS].some(
    (prefix) =>
      normalizedLocalPart === prefix ||
      normalizedLocalPart.startsWith(`${prefix}.`) ||
      normalizedLocalPart.startsWith(`${prefix}_`) ||
      normalizedLocalPart.startsWith(`${prefix}-`) ||
      normalizedLocalPart.startsWith(`${prefix}+`) ||
      normalizedLocalPart.startsWith(`${prefix}1`) ||
      normalizedLocalPart.startsWith(`${prefix}2`)
  );

  if (genericPrefixMatch) {
    return 'generic';
  }

  const looksLikePersonal =
    /^[a-z]{1,20}[._-][a-z]{1,30}$/i.test(normalizedLocalPart) ||
    /^[a-z]\.[a-z]{2,30}$/i.test(normalizedLocalPart) ||
    /^[a-z]{2,20}[._-][a-z]\.[a-z]{2,30}$/i.test(normalizedLocalPart);

  if (looksLikePersonal) {
    return 'personal';
  }

  return 'unknown';
}

function computeSameDomainAsCompany(params: {
  emailDomain: string;
  companyDomain: string | null;
}) {
  if (!params.companyDomain) {
    return null;
  }

  if (params.emailDomain === params.companyDomain) {
    return true;
  }

  if (params.emailDomain.endsWith(`.${params.companyDomain}`)) {
    return true;
  }

  return false;
}

function buildMetadata(params: {
  validationStatus: ContactValidationStatus;
  emailKind?: EmailKind | null;
  emailSameDomainAsCompany?: boolean | null;
  phoneE164?: string | null;
  phoneCountryCode?: string | null;
}): ContactValidationMetadata {
  return {
    validationStatus: params.validationStatus,
    validationCheckedAt: new Date().toISOString(),
    validationVersion: CONTACT_VALIDATION_VERSION,
    emailKind: params.emailKind ?? null,
    emailSameDomainAsCompany: params.emailSameDomainAsCompany ?? null,
    phoneE164: params.phoneE164 ?? null,
    phoneCountryCode: params.phoneCountryCode ?? null,
  };
}

export function buildFailedValidationMetadata(): ContactValidationMetadata {
  return buildMetadata({
    validationStatus: 'invalidLike',
  });
}

export function isValidLikeValidationStatus(
  value: string | null | undefined
): boolean {
  return value === 'validLike';
}

export function validateNormalizedEmailContact(params: {
  normalizedEmail: string;
  companyDomain: string | null;
}): ContactValidationMetadata {
  const normalizedEmail = params.normalizedEmail.trim().toLowerCase();
  const { localPart, domainPart } = getEmailParts(normalizedEmail);
  const normalizedCompanyDomain = normalizeDomainValue(params.companyDomain);

  const hasBasicShape =
    Boolean(localPart) &&
    Boolean(domainPart) &&
    /^[a-z0-9.-]+\.[a-z]{2,24}$/i.test(domainPart);

  if (!hasBasicShape) {
    return buildMetadata({
      validationStatus: 'invalidLike',
      emailKind: 'unknown',
      emailSameDomainAsCompany: null,
    });
  }

  const emailKind = detectEmailKind(localPart);
  const sameDomainAsCompany = computeSameDomainAsCompany({
    emailDomain: domainPart,
    companyDomain: normalizedCompanyDomain,
  });

  if (sameDomainAsCompany === true) {
    return buildMetadata({
      validationStatus: 'validLike',
      emailKind,
      emailSameDomainAsCompany: true,
    });
  }

  if (FREE_EMAIL_PROVIDERS.has(domainPart)) {
    return buildMetadata({
      validationStatus: 'risky',
      emailKind,
      emailSameDomainAsCompany: sameDomainAsCompany,
    });
  }

  return buildMetadata({
    validationStatus: 'risky',
    emailKind,
    emailSameDomainAsCompany: sameDomainAsCompany,
  });
}

export function validatePhoneContact(params: {
  rawPhone: string | null | undefined;
  normalizedPhone: string;
  companyCountry: string | null | undefined;
}): ContactValidationMetadata {
  const normalizedPhone = params.normalizedPhone.trim();
  const rawPhone = (params.rawPhone ?? '').trim();

  if (!normalizedPhone && !rawPhone) {
    return buildFailedValidationMetadata();
  }

  const countryCode = normalizeCountryCode(params.companyCountry);

  try {
    const parsed =
      (normalizedPhone.startsWith('+')
        ? parsePhoneNumberFromString(normalizedPhone)
        : null) ??
      (rawPhone.startsWith('+')
        ? parsePhoneNumberFromString(rawPhone)
        : null) ??
      (rawPhone ? parsePhoneNumberFromString(rawPhone, countryCode) : null) ??
      (normalizedPhone
        ? parsePhoneNumberFromString(normalizedPhone, countryCode)
        : null);

    if (!parsed || !parsed.isValid()) {
      return buildMetadata({
        validationStatus: 'invalidLike',
        phoneE164: null,
        phoneCountryCode: null,
      });
    }

    const parsedCountry = parsed.country ?? null;
    const normalizedCompanyCountry =
      params.companyCountry?.trim().toUpperCase() ?? null;

    const validationStatus: ContactValidationStatus =
      normalizedCompanyCountry &&
      parsedCountry &&
      normalizedCompanyCountry !== parsedCountry
        ? 'risky'
        : 'validLike';

    return buildMetadata({
      validationStatus,
      phoneE164: parsed.number,
      phoneCountryCode: parsedCountry,
    });
  } catch {
    return buildMetadata({
      validationStatus: 'invalidLike',
      phoneE164: null,
      phoneCountryCode: null,
    });
  }
}
