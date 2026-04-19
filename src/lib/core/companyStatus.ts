import { supabaseAdmin } from "./supabaseAdmin";

type CompanyBaseRow = {
  id: string;
  domain: string | null;
  address: string | null;
  city: string | null;
};

type CompanyContactRow = {
  contact_type: "phone" | "email";
  validation_status: string | null;
};

function hasAnyEmail(contacts: CompanyContactRow[]) {
  return contacts.some((contact) => contact.contact_type === "email");
}

function hasAnyPhone(contacts: CompanyContactRow[]) {
  return contacts.some((contact) => contact.contact_type === "phone");
}

function hasValidLikeEmail(contacts: CompanyContactRow[]) {
  return contacts.some(
    (contact) =>
      contact.contact_type === "email" &&
      contact.validation_status === "validLike",
  );
}

function hasUsablePhoneContact(contacts: CompanyContactRow[]) {
  return contacts.some(
    (contact) =>
      contact.contact_type === "phone" &&
      (contact.validation_status === "validLike" ||
        contact.validation_status === "risky"),
  );
}

export function calculateLeadStatus(params: {
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasValidEmail?: boolean;
  hasUsablePhone?: boolean;
}) {
  const usesValidationAwareInputs =
    params.hasValidEmail !== undefined || params.hasUsablePhone !== undefined;

  if (usesValidationAwareInputs) {
    const hasValidEmail = Boolean(params.hasValidEmail);
    const hasUsablePhone = Boolean(params.hasUsablePhone);

    if (hasValidEmail) return "ready";
    if (hasUsablePhone) return "enrich";
    return "skip";
  }

  if (params.hasEmail && params.hasPhone) return "ready";
  if (params.hasEmail || params.hasPhone) return "enrich";
  return "skip";
}

export function calculateQualityScore(params: {
  domain: string | null;
  address: string | null;
  city: string | null;
  hasEmail?: boolean;
  hasPhone?: boolean;
  hasValidEmail?: boolean;
  hasUsablePhone?: boolean;
}) {
  let score = 0;

  if (params.domain) score += 2;

  const hasEmailForScore =
    params.hasValidEmail !== undefined
      ? Boolean(params.hasValidEmail)
      : Boolean(params.hasEmail);

  const hasPhoneForScore =
    params.hasUsablePhone !== undefined
      ? Boolean(params.hasUsablePhone)
      : Boolean(params.hasPhone);

  if (hasEmailForScore) score += 2;
  if (hasPhoneForScore) score += 2;
  if (params.address) score += 1;
  if (params.city) score += 1;

  return score;
}

export async function refreshCompanyStatusAndQuality(companyId: string) {
  const { data: companyData, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, domain, address, city")
    .eq("id", companyId)
    .single();

  if (companyError) {
    throw new Error(
      `Blad przy pobieraniu firmy do refresh: ${companyError.message}`,
    );
  }

  const { data: contactsData, error: contactsError } = await supabaseAdmin
    .from("company_contacts")
    .select("contact_type, validation_status")
    .eq("company_id", companyId);

  if (contactsError) {
    throw new Error(
      `Blad przy pobieraniu kontaktow do refresh: ${contactsError.message}`,
    );
  }

  const company = companyData as CompanyBaseRow;
  const contacts = (contactsData ?? []) as CompanyContactRow[];

  const hasEmail = hasAnyEmail(contacts);
  const hasPhone = hasAnyPhone(contacts);
  const hasValidEmail = hasValidLikeEmail(contacts);
  const hasUsablePhone = hasUsablePhoneContact(contacts);

  const status = calculateLeadStatus({
    hasEmail,
    hasPhone,
    hasValidEmail,
    hasUsablePhone,
  });

  const qualityScore = calculateQualityScore({
    domain: company.domain,
    address: company.address,
    city: company.city,
    hasEmail,
    hasPhone,
    hasValidEmail,
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
