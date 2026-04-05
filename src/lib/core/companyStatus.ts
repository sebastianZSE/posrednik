import { supabaseAdmin } from "./supabaseAdmin";

type CompanyBaseRow = {
  id: string;
  domain: string | null;
  address: string | null;
  city: string | null;
};

type CompanyContactRow = {
  contact_type: "phone" | "email";
};

export function calculateLeadStatus(params: {
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  if (params.hasEmail && params.hasPhone) return "ready";
  if (params.hasEmail || params.hasPhone) return "enrich";
  return "skip";
}

export function calculateQualityScore(params: {
  domain: string | null;
  address: string | null;
  city: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  let score = 0;

  if (params.domain) score += 2;
  if (params.hasEmail) score += 2;
  if (params.hasPhone) score += 2;
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
    .select("contact_type")
    .eq("company_id", companyId);

  if (contactsError) {
    throw new Error(
      `Blad przy pobieraniu kontaktow do refresh: ${contactsError.message}`,
    );
  }

  const company = companyData as CompanyBaseRow;
  const contacts = (contactsData ?? []) as CompanyContactRow[];

  const hasEmail = contacts.some((contact) => contact.contact_type === "email");
  const hasPhone = contacts.some((contact) => contact.contact_type === "phone");

  const status = calculateLeadStatus({
    hasEmail,
    hasPhone,
  });

  const qualityScore = calculateQualityScore({
    domain: company.domain,
    address: company.address,
    city: company.city,
    hasEmail,
    hasPhone,
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