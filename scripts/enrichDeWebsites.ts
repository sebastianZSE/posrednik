import { config } from 'dotenv'
config({ path: '.env.local' })

import { createClient } from '@supabase/supabase-js'
import { load } from 'cheerio'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import {
  deRules,
  isBlockedHost,
  isLikelyContactLink,
} from './deRules'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl) {
  throw new Error('Brakuje NEXT_PUBLIC_SUPABASE_URL w .env.local')
}

if (!serviceRoleKey) {
  throw new Error('Brakuje SUPABASE_SERVICE_ROLE_KEY w .env.local')
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

const phoneLabelHints = [
  'tel',
  'telefon',
  'phone',
  'mobil',
  'mobile',
  'handy',
]

type CompanyRow = {
  id: string
  company_name: string | null
  website: string | null
  country: string | null
  status: string | null
  website_enrich_status: string | null
  website_enrich_attempts: number | null
}

type CompanyBaseRow = {
  id: string
  domain: string | null
  address: string | null
  city: string | null
}

type CompanyContactRow = {
  contact_type: 'phone' | 'email'
}

function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null

  const normalized = email
    .trim()
    .toLowerCase()
    .replace(/^mailto:/i, '')
    .replace(/[),.;:]+$/g, '')

  if (!normalized.includes('@')) return null
  if (normalized.includes('example.com')) return null
  if (normalized.length > 120) return null

  return normalized
}

function normalizePhone(
  phone: string | null | undefined,
  country: string | null | undefined
): string | null {
  if (!phone) return null

  const cleaned = phone.trim()

  if (!cleaned) return null

  const countryCode =
    country && typeof country === 'string'
      ? country.trim().toUpperCase()
      : undefined

  try {
    const parsed = parsePhoneNumberFromString(
      cleaned,
      countryCode as 'DE' | 'AT' | 'CH' | undefined
    )

    if (parsed?.isValid()) {
      return parsed.number
    }
  } catch {
  }

  return null
}

function calculateLeadStatus(params: {
  hasEmail: boolean
  hasPhone: boolean
}) {
  if (params.hasEmail && params.hasPhone) return 'ready'
  if (params.hasEmail || params.hasPhone) return 'enrich'
  return 'skip'
}

function calculateQualityScore(params: {
  domain: string | null
  address: string | null
  city: string | null
  hasEmail: boolean
  hasPhone: boolean
}) {
  let score = 0

  if (params.domain) score += 2
  if (params.hasEmail) score += 2
  if (params.hasPhone) score += 2
  if (params.address) score += 1
  if (params.city) score += 1

  return score
}

function getHostWithoutWww(url: string) {
  const parsed = new URL(url)
  return parsed.hostname.replace(/^www\./, '').toLowerCase()
}

function isCompanyDomainEmail(email: string, pageUrl: string) {
  const emailDomain = email.split('@')[1]?.toLowerCase().trim()
  if (!emailDomain) return false

  const siteDomain = getHostWithoutWww(pageUrl)

  return emailDomain === siteDomain || emailDomain.endsWith(`.${siteDomain}`)
}

async function fetchHtml(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), deRules.requestTimeoutMs)

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': deRules.userAgent,
        'accept-language': 'de-DE,de;q=0.9,en;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') ?? ''

    if (!contentType.includes('text/html')) {
      throw new Error(`Nieobslugiwany content-type: ${contentType}`)
    }

    return await response.text()
  } finally {
    clearTimeout(timeout)
  }
}

function toAbsoluteUrl(baseUrl: string, href: string) {
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return null
  }
}

function normalizeLine(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function collectCandidateLines(html: string) {
  const $ = load(html)

  $('script, style, noscript, svg, iframe, template').remove()

  const lines = new Set<string>()

  $('p, li, a, address, td, th, h1, h2, h3, h4, h5, h6, strong, small').each(
    (_, element) => {
      const text = normalizeLine($(element).text())

      if (!text) return
      if (text.length < 6) return
      if (text.length > 220) return

      lines.add(text)
    }
  )

  return [...lines]
}

function extractEmailsFromLines(params: {
  lines: string[]
  pageUrl: string
}) {
  const emailSet = new Set<string>()

  for (const line of params.lines) {
    const matches =
      line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}\b/gi) ?? []

    for (const match of matches) {
      const email = normalizeEmail(match)

      if (!email) continue
      if (!isCompanyDomainEmail(email, params.pageUrl)) continue

      emailSet.add(email)
    }
  }

  return [...emailSet]
}

function lineLooksLikePhoneLine(line: string) {
  const normalized = line.toLowerCase()

  if (phoneLabelHints.some((hint) => normalized.includes(hint))) {
    return true
  }

  return false
}

function extractPhonesFromLines(params: {
  lines: string[]
  country: string
}) {
  const phoneSet = new Set<string>()

  for (const line of params.lines) {
    if (!lineLooksLikePhoneLine(line)) {
      continue
    }

    const matches =
      line.match(/(?:\+49[\d\s()./-]{6,}\d|0[\d\s()./-]{6,}\d)/g) ?? []

    for (const match of matches) {
      const normalized = normalizePhone(match, params.country)

      if (!normalized) continue

      phoneSet.add(normalized)
    }
  }

  return [...phoneSet]
}

function extractContactDataFromHtml(params: {
  html: string
  pageUrl: string
  country: string
}) {
  const $ = load(params.html)

  $('script, style, noscript, svg, iframe, template').remove()

  const emailSet = new Set<string>()
  const phoneSet = new Set<string>()
  const nextUrls = new Set<string>()

  $('a[href]').each((_, element) => {
    const href = $(element).attr('href')?.trim() ?? ''
    const text = $(element).text().trim()

    if (!href) return

    if (href.startsWith('mailto:')) {
      const email = normalizeEmail(href)
      if (email && isCompanyDomainEmail(email, params.pageUrl)) {
        emailSet.add(email)
      }
      return
    }

    if (href.startsWith('tel:')) {
      const phone = normalizePhone(href.replace(/^tel:/i, ''), params.country)
      if (phone) {
        phoneSet.add(phone)
      }
      return
    }

    const absoluteUrl = toAbsoluteUrl(params.pageUrl, href)

    if (!absoluteUrl) return

    let parsedUrl: URL
    try {
      parsedUrl = new URL(absoluteUrl)
    } catch {
      return
    }

    if (isBlockedHost(parsedUrl.hostname)) {
      return
    }

    const currentHost = new URL(params.pageUrl).hostname.replace(/^www\./, '')
    const targetHost = parsedUrl.hostname.replace(/^www\./, '')

    if (currentHost !== targetHost) {
      return
    }

    if (isLikelyContactLink({ href: absoluteUrl, text })) {
      nextUrls.add(absoluteUrl)
    }
  })

  const candidateLines = collectCandidateLines(params.html)

  for (const email of extractEmailsFromLines({
    lines: candidateLines,
    pageUrl: params.pageUrl,
  })) {
    emailSet.add(email)
  }

  for (const phone of extractPhonesFromLines({
    lines: candidateLines,
    country: params.country,
  })) {
    phoneSet.add(phone)
  }

  for (const contactPath of deRules.contactPathHints) {
    const absoluteUrl = toAbsoluteUrl(params.pageUrl, contactPath)
    if (absoluteUrl) {
      nextUrls.add(absoluteUrl)
    }
  }

  return {
    emails: [...emailSet].slice(0, 5),
    phones: [...phoneSet].slice(0, 5),
    nextUrls: [...nextUrls].slice(0, deRules.maxPagesPerCompany - 1),
  }
}

async function addContactIfMissing(params: {
  companyId: string
  contactType: 'phone' | 'email'
  contactValue: string
  normalizedValue: string
  source: string
}) {
  const { data: existingContact, error: findError } = await supabase
    .from('company_contacts')
    .select('id')
    .eq('company_id', params.companyId)
    .eq('contact_type', params.contactType)
    .eq('normalized_value', params.normalizedValue)
    .limit(1)

  if (findError) {
    throw new Error(`Blad przy szukaniu kontaktu: ${findError.message}`)
  }

  if (existingContact && existingContact.length > 0) {
    return false
  }

  const { count, error: countError } = await supabase
    .from('company_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', params.companyId)
    .eq('contact_type', params.contactType)

  if (countError) {
    throw new Error(`Blad przy liczeniu kontaktow: ${countError.message}`)
  }

  const isPrimary = (count ?? 0) === 0

  const { error: insertError } = await supabase
    .from('company_contacts')
    .insert({
      company_id: params.companyId,
      contact_type: params.contactType,
      contact_value: params.contactValue,
      normalized_value: params.normalizedValue,
      is_primary: isPrimary,
      is_verified: false,
      source: params.source,
    })

  if (insertError) {
    throw new Error(`Blad przy dodawaniu kontaktu: ${insertError.message}`)
  }

  return true
}

async function refreshCompanyStatusAndQuality(companyId: string) {
  const { data: companyData, error: companyError } = await supabase
    .from('companies')
    .select('id, domain, address, city')
    .eq('id', companyId)
    .single()

  if (companyError) {
    throw new Error(`Blad przy pobieraniu firmy do refresh: ${companyError.message}`)
  }

  const { data: contactsData, error: contactsError } = await supabase
    .from('company_contacts')
    .select('contact_type')
    .eq('company_id', companyId)

  if (contactsError) {
    throw new Error(`Blad przy pobieraniu kontaktow do refresh: ${contactsError.message}`)
  }

  const company = companyData as CompanyBaseRow
  const contacts = (contactsData ?? []) as CompanyContactRow[]

  const hasEmail = contacts.some((contact) => contact.contact_type === 'email')
  const hasPhone = contacts.some((contact) => contact.contact_type === 'phone')

  const status = calculateLeadStatus({
    hasEmail,
    hasPhone,
  })

  const qualityScore = calculateQualityScore({
    domain: company.domain,
    address: company.address,
    city: company.city,
    hasEmail,
    hasPhone,
  })

  const { error: updateError } = await supabase
    .from('companies')
    .update({
      status,
      quality_score: qualityScore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', companyId)

  if (updateError) {
    throw new Error(`Blad przy refresh status i qualityScore: ${updateError.message}`)
  }
}

async function markCompanyWebsiteEnrich(params: {
  companyId: string
  status: 'success' | 'no_contact_found' | 'error'
  attempts: number
  errorMessage?: string
}) {
  const { error } = await supabase
    .from('companies')
    .update({
      website_enrich_status: params.status,
      website_enriched_at: new Date().toISOString(),
      website_enrich_error: params.errorMessage ?? null,
      website_enrich_attempts: params.attempts,
    })
    .eq('id', params.companyId)

  if (error) {
    throw new Error(`Blad przy aktualizacji website_enrich_status: ${error.message}`)
  }
}

async function enrichCompanyWebsite(company: CompanyRow) {
  if (!company.website) {
    throw new Error('Brak website')
  }

  const homepageHtml = await fetchHtml(company.website)

  const homepageData = extractContactDataFromHtml({
    html: homepageHtml,
    pageUrl: company.website,
    country: company.country ?? 'DE',
  })

  const emailSet = new Set<string>(homepageData.emails)
  const phoneSet = new Set<string>(homepageData.phones)

  const urlsToVisit = homepageData.nextUrls.slice(0, deRules.maxPagesPerCompany - 1)

  for (const url of urlsToVisit) {
    try {
      const html = await fetchHtml(url)

      const pageData = extractContactDataFromHtml({
        html,
        pageUrl: url,
        country: company.country ?? 'DE',
      })

      for (const email of pageData.emails) {
        emailSet.add(email)
      }

      for (const phone of pageData.phones) {
        phoneSet.add(phone)
      }
    } catch {
    }
  }

  let addedContacts = 0

  for (const email of [...emailSet].slice(0, 5)) {
    const inserted = await addContactIfMissing({
      companyId: company.id,
      contactType: 'email',
      contactValue: email,
      normalizedValue: email,
      source: deRules.source,
    })

    if (inserted) {
      addedContacts += 1
    }
  }

  for (const phone of [...phoneSet].slice(0, 5)) {
    const inserted = await addContactIfMissing({
      companyId: company.id,
      contactType: 'phone',
      contactValue: phone,
      normalizedValue: phone,
      source: deRules.source,
    })

    if (inserted) {
      addedContacts += 1
    }
  }

  await refreshCompanyStatusAndQuality(company.id)

  return {
    addedContacts,
    emailsFound: [...emailSet],
    phonesFound: [...phoneSet],
  }
}

async function main() {
  const { data, error } = await supabase
    .from('companies')
    .select(
      'id, company_name, website, country, status, website_enrich_status, website_enrich_attempts'
    )
    .eq('country', deRules.country)
    .eq('status', deRules.targetStatus)
    .not('website', 'is', null)
    .in('website_enrich_status', ['new', 'error'])
    .order('created_at', { ascending: true })
    .limit(deRules.maxCompaniesPerRun)

  if (error) {
    throw new Error(`Blad przy pobieraniu firm do enrich: ${error.message}`)
  }

  const companies = (data ?? []) as CompanyRow[]

  console.log(`Znaleziono firm do website enrichment: ${companies.length}`)

  if (companies.length === 0) {
    console.log('Brak firm do website enrichment.')
    return
  }

  let successCount = 0
  let noContactFoundCount = 0
  let errorCount = 0
  let addedContactsCount = 0

  for (const company of companies) {
    try {
      const result = await enrichCompanyWebsite(company)
      const nextAttempts = (company.website_enrich_attempts ?? 0) + 1

      if (result.addedContacts > 0) {
        await markCompanyWebsiteEnrich({
          companyId: company.id,
          status: 'success',
          attempts: nextAttempts,
        })

        successCount += 1
        addedContactsCount += result.addedContacts

        console.log(
          `[OK] ${company.company_name} | addedContacts=${result.addedContacts} | emails=${result.emailsFound.length} | phones=${result.phonesFound.length}`
        )
      } else {
        await markCompanyWebsiteEnrich({
          companyId: company.id,
          status: 'no_contact_found',
          attempts: nextAttempts,
        })

        noContactFoundCount += 1

        console.log(
          `[NO_CONTACT] ${company.company_name} | emails=${result.emailsFound.length} | phones=${result.phonesFound.length}`
        )
      }
    } catch (error) {
      const nextAttempts = (company.website_enrich_attempts ?? 0) + 1
      const errorMessage =
        error instanceof Error ? error.message : 'Nieznany blad'

      await markCompanyWebsiteEnrich({
        companyId: company.id,
        status: 'error',
        attempts: nextAttempts,
        errorMessage,
      })

      errorCount += 1

      console.error(`[ERR] ${company.company_name ?? company.id}: ${errorMessage}`)
    }
  }

  console.log('Website enrichment DE zakonczony.')
  console.log(`successCount=${successCount}`)
  console.log(`noContactFoundCount=${noContactFoundCount}`)
  console.log(`errorCount=${errorCount}`)
  console.log(`addedContactsCount=${addedContactsCount}`)
}

main().catch((error) => {
  console.error('Skrypt enrichDeWebsites nie udal sie:')
  console.error(error)
  process.exit(1)
})