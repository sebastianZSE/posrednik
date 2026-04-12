import { supabaseAdmin } from "./supabaseAdmin";
import type { ContactValidationStatus, EmailKind } from "./contactValidation";

export async function addContactIfMissing(params: {
  companyId: string;
  contactType: "phone" | "email";
  contactValue: string;
  normalizedValue: string;
  source: string;
  validationStatus?: ContactValidationStatus | null;
  validationCheckedAt?: string | null;
  validationVersion?: string | null;
  emailKind?: EmailKind | null;
  emailSameDomainAsCompany?: boolean | null;
  phoneE164?: string | null;
  phoneCountryCode?: string | null;
}) {
  const { data: existingContact, error: findError } = await supabaseAdmin
    .from("company_contacts")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("contact_type", params.contactType)
    .eq("normalized_value", params.normalizedValue)
    .limit(1);

  if (findError) {
    throw new Error(`Blad przy szukaniu kontaktu: ${findError.message}`);
  }

  if (existingContact && existingContact.length > 0) {
    return false;
  }

  const { count, error: countError } = await supabaseAdmin
    .from("company_contacts")
    .select("*", { count: "exact", head: true })
    .eq("company_id", params.companyId)
    .eq("contact_type", params.contactType);

  if (countError) {
    throw new Error(`Blad przy liczeniu kontaktow: ${countError.message}`);
  }

  const isPrimary = (count ?? 0) === 0;

  const insertPayload: Record<string, unknown> = {
    company_id: params.companyId,
    contact_type: params.contactType,
    contact_value: params.contactValue,
    normalized_value: params.normalizedValue,
    is_primary: isPrimary,
    is_verified: false,
    source: params.source,
  };

  if (params.validationStatus !== undefined) {
    insertPayload.validation_status = params.validationStatus;
  }

  if (params.validationCheckedAt !== undefined) {
    insertPayload.validation_checked_at = params.validationCheckedAt;
  }

  if (params.validationVersion !== undefined) {
    insertPayload.validation_version = params.validationVersion;
  }

  if (params.emailKind !== undefined) {
    insertPayload.email_kind = params.emailKind;
  }

  if (params.emailSameDomainAsCompany !== undefined) {
    insertPayload.email_same_domain_as_company =
      params.emailSameDomainAsCompany;
  }

  if (params.phoneE164 !== undefined) {
    insertPayload.phone_e164 = params.phoneE164;
  }

  if (params.phoneCountryCode !== undefined) {
    insertPayload.phone_country_code = params.phoneCountryCode;
  }

  const { error: insertError } = await supabaseAdmin
    .from("company_contacts")
    .insert(insertPayload);

  if (insertError) {
    throw new Error(`Blad przy dodawaniu kontaktu: ${insertError.message}`);
  }

  return true;
}
