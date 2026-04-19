import { supabaseAdmin } from "./supabaseAdmin";

type CompanyBaseRow = {
  id: string;
  domain: string | null;
  address: string | null;
  city: string | null;
  website: string | null;
};

type CompanyContactRow = {
  contact_type: "phone" | "email";
  contact_value: string | null;
  normalized_value: string | null;
  validation_status: string | null;
  email_same_domain_as_company: boolean | null;
  phone_e164: string | null;
};

const BLOCKED_EMAIL_LOCAL_PARTS = new Set([
  "datenschutz",
  "privacy",
  "legal",
  "jobs",
  "job",
  "karriere",
  "career",
  "bewerbung",
]);

function normalizeEmailForStatus(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, "");
}

function hasExactlyOneAtSign(value: string) {
  return (value.match(/@/g) ?? []).length === 1;
}

function isOutreachSafeEmailContact(contact: CompanyContactRow) {
  if (contact.contact_type !== "email") return false;
  if (contact.validation_status !== "validLike") return false;
  if (contact.email_same_domain_as_company !== true) return false;

  const email = normalizeEmailForStatus(contact.contact_value);

  if (!email) return false;
  if (!hasExactlyOneAtSign(email)) return false;
  if (email.includes(" ")) return false;
  if (email.includes("%20")) return false;
  if (email.includes("www")) return false;
  if (email.includes("|")) return false;
  if (email.includes("http://")) return false;
  if (email.includes("https://")) return false;

  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}$/i.test(email)) {
    return false;
  }

  const [localPart = ""] = email.split("@");

  if (!localPart) return false;
  if (BLOCKED_EMAIL_LOCAL_PARTS.has(localPart)) return false;
  if (/^\d{4,}/.test(localPart)) return false;

  return true;
}

function normalizePhoneForStatus(contact: CompanyContactRow) {
  return (
    contact.phone_e164 ??
    contact.normalized_value ??
    contact.contact_value ??
    ""
  ).trim();
}

function isUsablePhoneContact(contact: CompanyContactRow) {
  if (contact.contact_type !== "phone") return false;
  if (!["validLike", "risky"].includes(contact.validation_status ?? "")) {
    return false;
  }

  const phone = normalizePhoneForStatus(contact);

  if (!phone) return false;
  if (!phone.startsWith("+")) return false;

  const digits = phone.replace(/\D/g, "");

  if (digits.length < 10) return false;
  if (digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  return true;
}

function hasOutreachSafeEmail(contacts: CompanyContactRow[]) {
  return contacts.some(isOutreachSafeEmailContact);
}

function hasUsablePhoneContact(contacts: CompanyContactRow[]) {
  return contacts.some(isUsablePhoneContact);
}

export function calculateLeadStatus(params: {
  hasWebsite?: boolean;
  hasOutreachSafeEmail?: boolean;
  hasUsablePhone?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasValidEmail?: boolean;
}) {
  const hasOutreachSafeEmail = Boolean(
    params.hasOutreachSafeEmail ?? params.hasValidEmail ?? params.hasEmail,
  );

  const hasWebsite = Boolean(params.hasWebsite);

  if (hasOutreachSafeEmail) {
    return "ready";
  }

  if (hasWebsite) {
    return "enrich";
  }

  return "skip";
}

export function calculateQualityScore(params: {
  domain: string | null;
  address: string | null;
  city: string | null;
  hasOutreachSafeEmail?: boolean;
  hasUsablePhone?: boolean;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasValidEmail?: boolean;
}) {
  let score = 0;

  const hasEmailForScore = Boolean(
    params.hasOutreachSafeEmail ?? params.hasValidEmail ?? params.hasEmail,
  );

  const hasPhoneForScore = Boolean(params.hasUsablePhone ?? params.hasPhone);

  if (params.domain) score += 2;
  if (hasEmailForScore) score += 3;
  if (hasPhoneForScore) score += 1;
  if (params.address) score += 1;
  if (params.city) score += 1;

  return score;
}

export async function refreshCompanyStatusAndQuality(companyId: string) {
  const { data: companyData, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, domain, address, city, website")
    .eq("id", companyId)
    .single();

  if (companyError) {
    throw new Error(
      `Blad przy pobieraniu firmy do refresh: ${companyError.message}`,
    );
  }

  const { data: contactsData, error: contactsError } = await supabaseAdmin
    .from("company_contacts")
    .select(
      "contact_type, contact_value, normalized_value, validation_status, email_same_domain_as_company, phone_e164",
    )
    .eq("company_id", companyId);

  if (contactsError) {
    throw new Error(
      `Blad przy pobieraniu kontaktow do refresh: ${contactsError.message}`,
    );
  }

  const company = companyData as CompanyBaseRow;
  const contacts = (contactsData ?? []) as CompanyContactRow[];

  const hasWebsite = Boolean(company.website?.trim());
  const hasOutreachEmail = hasOutreachSafeEmail(contacts);
  const hasUsablePhone = hasUsablePhoneContact(contacts);

  const status = calculateLeadStatus({
    hasWebsite,
    hasOutreachSafeEmail: hasOutreachEmail,
    hasUsablePhone,
  });

  const qualityScore = calculateQualityScore({
    domain: company.domain,
    address: company.address,
    city: company.city,
    hasOutreachSafeEmail: hasOutreachEmail,
    hasUsablePhone,
  });

  const { error: updateError } = await supabaseAdmin
    .from("companies")
    .update({
      status,
      quality_score: qualityScore,
      updated_at: new Date().toISOString(),
    })
    .eq("id", companyId);

  if (updateError) {
    throw new Error(
      `Blad przy refresh status i qualityScore: ${updateError.message}`,
    );
  }
}
