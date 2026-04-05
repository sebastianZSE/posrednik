import { supabaseAdmin } from "./supabaseAdmin";

export async function addContactIfMissing(params: {
  companyId: string;
  contactType: "phone" | "email";
  contactValue: string;
  normalizedValue: string;
  source: string;
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

  const { error: insertError } = await supabaseAdmin
    .from("company_contacts")
    .insert({
      company_id: params.companyId,
      contact_type: params.contactType,
      contact_value: params.contactValue,
      normalized_value: params.normalizedValue,
      is_primary: isPrimary,
      is_verified: false,
      source: params.source,
    });

  if (insertError) {
    throw new Error(`Blad przy dodawaniu kontaktu: ${insertError.message}`);
  }

  return true;
}
