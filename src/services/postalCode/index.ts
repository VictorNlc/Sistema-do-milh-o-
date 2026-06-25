// Barrel export — Postal Code Service
export {
  lookupPostalCode,
  sanitizePostalCode,
  formatPostalCode,
  isPostalCodeComplete,
  getPostalCodeLength,
  getPostalCodePlaceholder,
  getPostalCodeMaxLength,
  getProvider,
  SUPPORTED_COUNTRIES,
  getReferencePostcodeForUruguay,
} from './postalCodeService'

export type {
  PostalLookupResult,
  ProviderResult,
  SupportedCountry,
  PostalCodeProvider,
} from './types'
