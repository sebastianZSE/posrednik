// czyta parametry z URL

// czyli:

// view
// search
// country
// status
// 2. pobiera firmy i kontakty z Supabase
// 3. stosuje dokładnie tę samą logikę filtrowania

// jak na stronie /companies

// 4. buduje CSV

// i zwraca go jako plik do pobrania


import { supabase } from '@/lib/supabase'

type CompanyItem = {
  id: string
  company_name: string | null
  legal_name: string | null
  domain: string | null
  website: string | null
  city: string | null
  country: string | null
  category: string | null
  status: string | null
  quality_score: number | null
  created_at: string | null
}

type ContactItem = {
  id: string
  company_id: string
  contact_type: 'phone' | 'email'
  contact_value: string
  normalized_value: string | null
  is_primary: boolean | null
  is_verified: boolean | null
  source: string | null
  created_at: string | null
}

function getSingleValue(value: string | null) {
  return value ?? ''
}

function normalizeSearchValue(value: string | null | undefined) {
  if (!value) return ''

  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function groupContactsByCompany(contacts: ContactItem[]) {
  const contactMap = new Map<string, ContactItem[]>()

  for (const contact of contacts) {
    const currentList = contactMap.get(contact.company_id) ?? []
    currentList.push(contact)
    contactMap.set(contact.company_id, currentList)
  }

  return contactMap
}

function getEffectiveStatus(params: {
  view: string
  status: string
}) {
  if (params.status) {
    return params.status
  }

  if (params.view === 'all') {
    return ''
  }

  if (params.view === 'enrich') {
    return 'enrich'
  }

  if (params.view === 'skip') {
    return 'skip'
  }

  return 'ready'
}

function getPrimaryContact(
  contacts: ContactItem[],
  contactType: 'phone' | 'email'
) {
  const primary = contacts.find(
    (contact) => contact.contact_type === contactType && contact.is_primary
  )

  if (primary) return primary.contact_value

  const fallback = contacts.find((contact) => contact.contact_type === contactType)
  return fallback?.contact_value ?? ''
}

function getAllContacts(
  contacts: ContactItem[],
  contactType: 'phone' | 'email'
) {
  return contacts
    .filter((contact) => contact.contact_type === contactType)
    .map((contact) => contact.contact_value)
    .join(' | ')
}

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? '')
  const escapedValue = stringValue.replace(/"/g, '""')
  return `"${escapedValue}"`
}

function buildCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
}

function buildFileName(params: {
  view: string
  country: string
  search: string
}) {
  const safeView = params.view || 'ready'
  const safeCountry = params.country || 'all'
  const safeSearch = params.search
    ? params.search.replace(/[^\p{L}\p{N}]+/gu, '_')
    : 'all'

  return `companies_${safeView}_${safeCountry}_${safeSearch}.csv`
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const search = getSingleValue(searchParams.get('search'))
  const country = getSingleValue(searchParams.get('country'))
  const statusFromUrl = getSingleValue(searchParams.get('status'))
  const viewFromUrl = getSingleValue(searchParams.get('view'))

  const activeView = viewFromUrl || 'ready'
  const effectiveStatus = getEffectiveStatus({
    view: activeView,
    status: statusFromUrl,
  })

  const normalizedSearch = normalizeSearchValue(search)

  const { data: companiesData, error: companiesError } = await supabase
    .from('companies')
    .select(
      'id, company_name, legal_name, domain, website, city, country, category, status, quality_score, created_at'
    )
    .order('created_at', { ascending: false })

  if (companiesError) {
    return new Response(`Blad companies: ${companiesError.message}`, {
      status: 500,
    })
  }

  const { data: contactsData, error: contactsError } = await supabase
    .from('company_contacts')
    .select(
      'id, company_id, contact_type, contact_value, normalized_value, is_primary, is_verified, source, created_at'
    )
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: false })

  if (contactsError) {
    return new Response(`Blad contacts: ${contactsError.message}`, {
      status: 500,
    })
  }

  const allCompanies = (companiesData ?? []) as CompanyItem[]
  const allContacts = (contactsData ?? []) as ContactItem[]
  const contactMap = groupContactsByCompany(allContacts)

  const filteredCompanies = allCompanies.filter((company) => {
    const normalizedCompanyName = normalizeSearchValue(company.company_name)
    const normalizedLegalName = normalizeSearchValue(company.legal_name)

    const matchesSearch =
      !normalizedSearch ||
      normalizedCompanyName.includes(normalizedSearch) ||
      normalizedLegalName.includes(normalizedSearch)

    const matchesCountry = !country || company.country === country
    const matchesStatus = !effectiveStatus || company.status === effectiveStatus

    return matchesSearch && matchesCountry && matchesStatus
  })

  const csvRows: string[][] = [
    [
      'companyId',
      'companyName',
      'legalName',
      'domain',
      'website',
      'city',
      'country',
      'category',
      'status',
      'qualityScore',
      'primaryPhone',
      'allPhones',
      'primaryEmail',
      'allEmails',
      'contactsCount',
      'createdAt',
    ],
  ]

  for (const company of filteredCompanies) {
    const companyContacts = contactMap.get(company.id) ?? []

    const primaryPhone = getPrimaryContact(companyContacts, 'phone')
    const allPhones = getAllContacts(companyContacts, 'phone')
    const primaryEmail = getPrimaryContact(companyContacts, 'email')
    const allEmails = getAllContacts(companyContacts, 'email')

    csvRows.push([
      company.id,
      company.company_name ?? '',
      company.legal_name ?? '',
      company.domain ?? '',
      company.website ?? '',
      company.city ?? '',
      company.country ?? '',
      company.category ?? '',
      company.status ?? '',
      String(company.quality_score ?? ''),
      primaryPhone,
      allPhones,
      primaryEmail,
      allEmails,
      String(companyContacts.length),
      company.created_at ?? '',
    ])
  }

  const csvContent = buildCsv(csvRows)
  const fileName = buildFileName({
    view: activeView,
    country,
    search,
  })

  return new Response(csvContent, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  })
}