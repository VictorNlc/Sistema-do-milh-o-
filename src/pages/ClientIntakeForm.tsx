import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  SUPPORTED_COUNTRIES,
  lookupPostalCode,
  formatPostalCode,
  sanitizePostalCode,
  isPostalCodeComplete,
  getPostalCodePlaceholder,
  getPostalCodeMaxLength,
  getPostalCodeLength,
  getReferencePostcodeForUruguay,
} from '../services/postalCode'
import { getCoordinates, normalizeManualCity } from '../services/geocodingService'
import { calculateDistance } from '../services/distanceService'
import UY_CITIES_BY_DEPT from '../data/uyCitiesByDept.json'
import './ClientIntakeForm.css'
const URUGUAY_DEPARTMENTS = [
  'Artigas',
  'Canelones',
  'Cerro Largo',
  'Colonia',
  'Durazno',
  'Flores',
  'Florida',
  'Lavalleja',
  'Maldonado',
  'Montevideo',
  'Paysandú',
  'Río Negro',
  'Rivera',
  'Rocha',
  'Salto',
  'San José',
  'Soriano',
  'Tacuarembó',
  'Treinta y Tres',
]

interface FormData {
  clientName: string
  pharmacyName: string
  country: string
  postalCode: string
  city: string
  state: string
  address: string
  number: string
  complement: string
  phone: string
  employees: string
  spaceMode: 'dimensions' | 'floorplan'
  width: string
  height: string
  floorPlanFile: File | null
  floorPlanPreview: string | null
}

const EMPLOYEE_OPTIONS = [
  '1 a 3 funcionários',
  '4 a 7 funcionários',
  '8 a 15 funcionários',
  '16 a 30 funcionários',
  'Mais de 30 funcionários',
]

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

export default function ClientIntakeForm() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData | 'general' | 'postalCode', string>>>({})

  // Postal code lookup state
  const [postalLoading, setPostalLoading] = useState(false)
  const [postalMessage, setPostalMessage] = useState<string | null>(null)
  const [lastFetchedKey, setLastFetchedKey] = useState<string>('')

  // Freight / geocoding message
  const [freightMessage, setFreightMessage] = useState<string | null>(null)
  const [freightData, setFreightData] = useState<{ distanceKm: number; freightCost: number } | null>(null)

  // Flag for manual city entry (when API returns only province)
  const [isCityManual, setIsCityManual] = useState(false)

  // Autocomplete state for Uruguay cities
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  const [form, setForm] = useState<FormData>({
    clientName: '',
    pharmacyName: '',
    country: '',
    postalCode: '',
    city: '',
    state: '',
    address: '',
    number: '',
    complement: '',
    phone: '',
    employees: '',
    spaceMode: 'dimensions',
    width: '',
    height: '',
    floorPlanFile: null,
    floorPlanPreview: null,
  })

  const set = (field: keyof FormData, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ── Validation Logic ────────────────────────────────────────────────────
  const validateField = useCallback((field: keyof FormData, currentForm: FormData): string | undefined => {
    if (field === 'clientName' && !currentForm.clientName.trim()) return 'Informe seu nome.'
    if (field === 'pharmacyName' && !currentForm.pharmacyName.trim()) return 'Informe o nome da farmácia.'
    if (field === 'country' && !currentForm.country) return 'Selecione o país.'
    if (field === 'postalCode') {
      if (!currentForm.postalCode.trim()) return 'Informe o CEP / Código postal.'
      if (currentForm.country) {
        const sanitized = sanitizePostalCode(currentForm.country, currentForm.postalCode)
        if (currentForm.country === 'AR' && !/^[A-Z]\d{4}[A-Z]{3}$/.test(sanitized)) {
          return 'Informe um código postal argentino válido. Exemplo: C1043AAZ'
        }
        if (currentForm.country === 'PY' && !/^\d{4,6}$/.test(sanitized)) {
          return 'Informe um código postal paraguaio válido. Exemplos: 1000, 10001 ou 100001'
        }
        const expected = getPostalCodeLength(currentForm.country, currentForm.postalCode)
        if (sanitized.length !== expected) {
          return `Código postal deve conter ${expected} dígitos.`
        }
      }
    }
    if (field === 'city' && !currentForm.city.trim()) {
      if (currentForm.country === 'UY') {
        return 'Informe a cidade para continuar.'
      }
      return 'Cidade não preenchida. Verifique o código postal ou informe manualmente.'
    }
    if (field === 'state' && !currentForm.state.trim()) return 'Estado não preenchido. Verifique o código postal.'
    if (field === 'address' && !currentForm.address.trim()) return 'Informe o endereço.'
    if (field === 'phone' && currentForm.phone.replace(/\D/g, '').length < 10) return 'Informe um telefone válido.'
    if (field === 'employees' && !currentForm.employees) return 'Selecione o número de funcionários.'
    return undefined
  }, [])

  const handleBlur = (field: keyof FormData) => {
    const error = validateField(field, form)
    if (error) {
      setErrors(prev => ({ ...prev, [field]: error }))
    }
  }

  // Reactive error clearance
  useEffect(() => {
    setErrors(prev => {
      const next = { ...prev }
      let changed = false
      Object.keys(next).forEach(key => {
        if (key === 'general') return
        const field = key as keyof FormData
        const error = validateField(field, form)
        if (!error && next[field]) {
          delete next[field]
          changed = true
        } else if (error && next[field] && next[field] !== error) {
          next[field] = error
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [form, validateField])

  // ── Postal code auto-lookup ─────────────────────────────────────────────
  const performLookup = useCallback(async (country: string, postalCode: string) => {
    const sanitized = sanitizePostalCode(country, postalCode)
    const key = `${country}:${sanitized}`

    // Prevent duplicate calls for the same country+postal code
    if (key === lastFetchedKey) return

    if (!isPostalCodeComplete(country, postalCode)) return

    setLastFetchedKey(key)
    setPostalLoading(true)
    setPostalMessage(null)
    setErrors(prev => ({ ...prev, postalCode: undefined }))

    const result = await lookupPostalCode(country, postalCode)

    setPostalLoading(false)

    if (result.success && result.data) {
      if (country === 'UY') {
        setForm(prev => ({
          ...prev,
          city: '',
          state: result.data!.state,
        }))
        setPostalMessage(null)
        setIsCityManual(true)
        console.log('[UY] Código postal válido. Departamento preenchido automaticamente.')
        return
      }

      setForm(prev => ({
        ...prev,
        city: result.data!.city,
        state: result.data!.state,
      }))
      setPostalMessage(null)

      if (!result.data!.city) {
        console.warn('[Freight] Apenas província identificada.')
        console.log('[Freight] Utilizando campo Cidade existente para preenchimento manual.')
        setIsCityManual(true)
        setFreightMessage(
          'Não foi possível identificar sua cidade através do código postal.\n\nPara calcular o frete corretamente, informe a cidade onde você está localizado.'
        )
      } else {
        setIsCityManual(false)
        setFreightMessage(null)

        // Pipeline: Geocoding → Distância → Frete (tudo em console)
        const geoResult = await getCoordinates(country, result.data!.state, result.data!.city)

        if (geoResult.success && geoResult.data) {
          const freightRes = await calculateDistance(geoResult.data.latitude, geoResult.data.longitude)

          if (freightRes.success && freightRes.data) {
            setFreightData({
              distanceKm: freightRes.data.distanceKm,
              freightCost: freightRes.data.shippingCost
            })
          }
        }
      }
    } else {
      if (country === 'UY') {
        setIsCityManual(true)
        setPostalMessage('Código postal não encontrado na base do Uruguai.')
        return
      }
      setIsCityManual(false)
      setForm(prev => ({ ...prev, city: '', state: '' }))
      setPostalMessage(result.error || 'Código postal inválido.')
    }
  }, [lastFetchedKey])

  // Auto-trigger lookup when postal code changes and country is selected
  useEffect(() => {
    if (!form.country) return

    // UY: não auto-preencher cidade/estado, não limpar campos manuais
    if (form.country === 'UY') {
      const sanitized = sanitizePostalCode(form.country, form.postalCode)
      const expectedLength = getPostalCodeLength(form.country, form.postalCode)
      if (sanitized.length === expectedLength) {
        performLookup(form.country, form.postalCode)
      }
      return
    }

    const sanitized = sanitizePostalCode(form.country, form.postalCode)
    const expectedLength = getPostalCodeLength(form.country, form.postalCode)

    // Clear city/state if postal code is incomplete
    if (sanitized.length < expectedLength) {
      if (form.city || form.state) {
        setForm(prev => ({ ...prev, city: '', state: '' }))
      }
      setPostalMessage(null)
      return
    }

    // Auto-fetch when postal code is complete
    if (sanitized.length === expectedLength) {
      performLookup(form.country, form.postalCode)
    }
  }, [form.postalCode, form.country, performLookup, form.city, form.state])

  // Reset location fields when country changes
  useEffect(() => {
    setForm(prev => ({ ...prev, postalCode: '', city: '', state: '' }))
    setPostalMessage(null)
    setFreightMessage(null)
    setLastFetchedKey('')
    setIsCityManual(form.country === 'UY')
    setShowSuggestions(false)
  }, [form.country])

  // ── Geocoding + Frete com cidade/estado manuais ─────────────────────────
  useEffect(() => {
    if (!isCityManual) return

    // UY: se a cidade estiver vazia, exibe mensagem informativa de obrigatoriedade e não consulta Nominatim
    if (form.country === 'UY' && !form.city.trim()) {
      setFreightMessage('Cidade obrigatória para cálculo do frete.')
      return
    }

    if (!form.city.trim() || form.city.trim().length < 2) return
    if (!form.state.trim() || form.state.trim().length < 2) return

    setFreightMessage(null)

    const timer = setTimeout(async () => {
      const normalizedCity = normalizeManualCity(form.city)
      console.log('[Freight] Utilizando cidade e estado informados manualmente pelo usuário.')
      console.log('[Freight] Cidade informada:', normalizedCity)

      const geoResult = await getCoordinates(form.country, form.state.trim(), normalizedCity)

      if (!geoResult.success || !geoResult.data) {
        console.warn('[Freight] Cidade não localizada no Nominatim.')
        setFreightMessage('Não foi possível localizar a cidade, precisa calcular manualmente.')
        return
      }

      setFreightMessage(null)
      const freightRes = await calculateDistance(geoResult.data.latitude, geoResult.data.longitude)
      if (freightRes.success && freightRes.data) {
        setFreightData({
          distanceKm: freightRes.data.distanceKm,
          freightCost: freightRes.data.shippingCost
        })
      }
    }, 1500) // debounce de 1.5s para aguardar digitação

    return () => clearTimeout(timer)
  }, [isCityManual, form.country, form.city, form.state])

  // ── Autocomplete Logic for Uruguay ───────────────────────────────────────
  const citiesInDept = useMemo(() => {
    if (form.country !== 'UY' || !form.state) return []
    return (UY_CITIES_BY_DEPT as Record<string, string[]>)[form.state] || []
  }, [form.country, form.state])

  const filteredCities = useMemo(() => {
    if (form.country !== 'UY' || !form.city || form.city.trim().length < 2) return []

    const normalize = (s: string) =>
      s.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()

    const query = normalize(form.city)
    return citiesInDept.filter(city => normalize(city).includes(query))
  }, [form.country, form.city, citiesInDept])

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSelectSuggestion = (city: string) => {
    set('city', city)
    setShowSuggestions(false)
  }

  const handleCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (form.country !== 'UY' || !showSuggestions || filteredCities.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveSuggestionIndex(prev => (prev + 1) % filteredCities.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveSuggestionIndex(prev => (prev - 1 + filteredCities.length) % filteredCities.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (activeSuggestionIndex >= 0 && activeSuggestionIndex < filteredCities.length) {
        handleSelectSuggestion(filteredCities[activeSuggestionIndex])
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // ── Postal code input handler ───────────────────────────────────────────
  const handlePostalCodeChange = (value: string) => {
    if (form.country) {
      set('postalCode', formatPostalCode(form.country, value))
    } else {
      set('postalCode', value)
    }
  }

  const handleUruguayDepartmentChange = (department: string) => {
    setForm(prev => ({
      ...prev,
      state: department,
      city: '',
      postalCode: getReferencePostcodeForUruguay(department) || prev.postalCode
    }))
    setShowSuggestions(false)
  }

  // ── Step 1 validation ──────────────────────────────────────────────────
  const validateStep1 = () => {
    const errs: typeof errors = {}
    const fieldsToValidate: (keyof FormData)[] = [
      'clientName', 'pharmacyName', 'country', 'postalCode', 'city', 'state', 'address', 'phone', 'employees'
    ]

    fieldsToValidate.forEach(field => {
      const error = validateField(field, form)
      if (error) errs[field] = error
    })

    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  // ── Step 2 validation ──────────────────────────────────────────────────
  const validateStep2 = () => {
    const errs: typeof errors = {}
    if (form.spaceMode === 'dimensions') {
      const w = parseFloat(form.width)
      const h = parseFloat(form.height)
      if (!form.width || isNaN(w) || w < 3 || w > 100) errs.width = 'Largura deve ser entre 3m e 100m.'
      if (!form.height || isNaN(h) || h < 3 || h > 100) errs.height = 'Comprimento deve ser entre 3m e 100m.'
    } else {
      if (!form.floorPlanFile) errs.floorPlanFile = 'Selecione uma imagem da planta baixa.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = () => {
    if (validateStep1()) setStep(2)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
    if (!allowed.includes(file.type)) {
      setErrors(prev => ({ ...prev, floorPlanFile: 'Use JPG, PNG, WEBP ou PDF.' }))
      return
    }
    const reader = new FileReader()
    reader.onload = ev => {
      set('floorPlanPreview', ev.target?.result as string)
    }
    reader.readAsDataURL(file)
    set('floorPlanFile', file)
  }

  const handleSubmit = async () => {
    if (!validateStep2()) return
    setIsSubmitting(true)

    const selectedCountry = SUPPORTED_COUNTRIES.find(c => c.code === form.country)

    // Save client data to sessionStorage so Editor can consume it
    const intakeData = {
      clientName: form.clientName.trim(),
      pharmacyName: form.pharmacyName.trim(),
      country: form.country,
      countryName: selectedCountry?.name || form.country,
      postalCode: form.postalCode.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      address: form.address.trim(),
      number: form.number.trim(),
      complement: form.complement.trim(),
      phone: form.phone,
      employees: form.employees,
      spaceMode: form.spaceMode,
      width: form.spaceMode === 'dimensions' ? parseFloat(form.width) : null,
      height: form.spaceMode === 'dimensions' ? parseFloat(form.height) : null,
      hasFloorPlan: form.spaceMode === 'floorplan',
      floorPlanDataUrl: form.spaceMode === 'floorplan' ? form.floorPlanPreview : null,
      freightData,
    }
    sessionStorage.setItem('projefarma_intake', JSON.stringify(intakeData))
    sessionStorage.setItem('projefarma_client_details', JSON.stringify({
      clientName: form.clientName.trim(),
      pharmacyName: form.pharmacyName.trim(),
      phone: form.phone,
      city: form.city.trim(),
      state: form.state.trim(),
      address: form.address.trim(),
      number: form.number.trim(),
      complement: form.complement.trim(),
      postalCode: form.postalCode.trim(),
      countryName: selectedCountry?.name || form.country,
    }))

    // Small delay for UX
    await new Promise(r => setTimeout(r, 700))

    const params = new URLSearchParams()
    if (form.spaceMode === 'dimensions') {
      params.set('w', String(parseFloat(form.width)))
      params.set('h', String(parseFloat(form.height)))
    }
    if (form.spaceMode === 'floorplan') {
      params.set('floorplan', '1')
    }

    navigate(`/editor?${params.toString()}`)
  }

  // ── Render ───────────────────────────────────────

  return (
    <div className="cif-root">
      {/* Background decoration */}
      <div className="cif-bg-blob blob-a" />
      <div className="cif-bg-blob blob-b" />
      <div className="cif-bg-blob blob-c" />

      {/* Header */}
      <header className="cif-header">
        <button className="cif-logo" onClick={() => navigate('/')}>
          <div className="cif-logo-mark">P</div>
          <div>
            <span className="cif-logo-name">ProjeLayout</span>
            <span className="cif-logo-by">by Projefarma</span>
          </div>
        </button>
        <button className="cif-back-btn" onClick={() => navigate('/')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Voltar
        </button>
      </header>

      {/* Card */}
      <main className="cif-main">
        <div className="cif-card">

          {/* Progress */}
          <div className="cif-progress-wrap">
            <div className={`cif-step-dot ${step >= 1 ? 'active' : ''}`}>
              {step > 1 ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : '1'}
            </div>
            <div className={`cif-progress-line ${step >= 2 ? 'filled' : ''}`} />
            <div className={`cif-step-dot ${step >= 2 ? 'active' : ''}`}>2</div>
          </div>
          <div className="cif-step-labels">
            <span className={step === 1 ? 'active' : ''}>Dados da Farmácia</span>
            <span className={step === 2 ? 'active' : ''}>Espaço da Loja</span>
          </div>

          {/* ── STEP 1 ── */}
          {step === 1 && (
            <div className="cif-body cif-fade-in">
              <div className="cif-step-header">
                <div className="cif-step-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <h2 className="cif-step-title">Dados da Farmácia</h2>
                  <p className="cif-step-desc">Preencha suas informações para personalizarmos seu layout.</p>
                </div>
              </div>

              <div className="cif-fields">
                <div className="cif-field-row">
                  <div className="cif-field">
                    <label htmlFor="cif-clientName">Seu nome completo <span className="cif-required">*</span></label>
                    <input
                      id="cif-clientName"
                      type="text"
                      placeholder="Ex: João da Silva"
                      value={form.clientName}
                      onChange={e => set('clientName', e.target.value.slice(0, 40))}
                      onBlur={() => handleBlur('clientName')}
                      className={errors.clientName ? 'error' : ''}
                      maxLength={40}
                    />
                    {errors.clientName && <span className="cif-error-msg">{errors.clientName}</span>}
                  </div>
                  <div className="cif-field">
                    <label htmlFor="cif-pharmacyName">Nome da farmácia <span className="cif-required">*</span></label>
                    <input
                      id="cif-pharmacyName"
                      type="text"
                      placeholder="Ex: Farmácia Saúde & Vida"
                      value={form.pharmacyName}
                      onChange={e => set('pharmacyName', e.target.value.slice(0, 40))}
                      onBlur={() => handleBlur('pharmacyName')}
                      className={errors.pharmacyName ? 'error' : ''}
                      maxLength={40}
                    />
                    {errors.pharmacyName && <span className="cif-error-msg">{errors.pharmacyName}</span>}
                  </div>
                </div>

                {/* Country + Postal Code row */}
                <div className="cif-field-row">
                  <div className="cif-field">
                    <label htmlFor="cif-country">País <span className="cif-required">*</span></label>
                    <select
                      id="cif-country"
                      value={form.country}
                      onChange={e => set('country', e.target.value)}
                      onBlur={() => handleBlur('country')}
                      className={errors.country ? 'error' : ''}
                    >
                      <option value="" disabled>Selecione o país</option>
                      {SUPPORTED_COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                      ))}
                    </select>
                    {errors.country && <span className="cif-error-msg">{errors.country}</span>}
                  </div>
                  <div className="cif-field">
                    <label htmlFor="cif-postalCode">
                      Código Postal <span className="cif-required">*</span>
                    </label>
                    <div className="cif-input-cep-wrap">
                      <input
                        id="cif-postalCode"
                        type="text"
                        placeholder={form.country ? getPostalCodePlaceholder(form.country) : 'Código postal'}
                        value={form.postalCode}
                        onChange={e => handlePostalCodeChange(e.target.value)}
                        onBlur={() => handleBlur('postalCode')}
                        className={errors.postalCode || postalMessage ? 'error' : ''}
                        maxLength={form.country ? getPostalCodeMaxLength(form.country, form.postalCode) : 20}
                      />
                      {postalLoading && (
                        <div className="cif-cep-loading">
                          <span className="cif-spinner-sm" />
                        </div>
                      )}
                    </div>
                    {errors.postalCode && <span className="cif-error-msg">{errors.postalCode}</span>}
                    {postalMessage && !errors.postalCode && <span className="cif-error-msg">{postalMessage}</span>}
                  </div>
                </div>

                {/* City + State row */}
                <div className="cif-field-row">
                  <div className="cif-field">
                    <label htmlFor="cif-city">
                      Cidade
                      {form.country && !isCityManual && <span className="cif-autofill-badge">Preenchimento automático</span>}
                      {isCityManual && <span className="cif-required">*</span>}
                    </label>
                    {form.country === 'UY' ? (
                      <div className="cif-autocomplete-wrap" ref={suggestionsRef}>
                        <input
                          id="cif-city"
                          type="text"
                          placeholder="Informe a cidade"
                          value={form.city}
                          readOnly={false}
                          onChange={e => {
                            set('city', e.target.value)
                            setShowSuggestions(true)
                            setActiveSuggestionIndex(0)
                          }}
                          onFocus={() => setShowSuggestions(true)}
                          onBlur={() => handleBlur('city')}
                          onKeyDown={handleCityKeyDown}
                          className={errors.city ? 'error' : ''}
                          tabIndex={0}
                          autoComplete="off"
                        />
                        {showSuggestions && filteredCities.length > 0 && (
                          <ul className="cif-autocomplete-dropdown">
                            {filteredCities.map((city, idx) => (
                              <li
                                key={city}
                                className={`cif-autocomplete-item ${idx === activeSuggestionIndex ? 'active' : ''}`}
                                onMouseDown={() => handleSelectSuggestion(city)}
                                onMouseEnter={() => setActiveSuggestionIndex(idx)}
                              >
                                {city}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <input
                        id="cif-city"
                        type="text"
                        placeholder={
                          !form.country
                            ? 'Selecione o país primeiro'
                            : isCityManual
                              ? 'Informe a cidade'
                              : 'Preenchido pelo código postal'
                        }
                        value={form.city}
                        readOnly={!isCityManual}
                        onChange={isCityManual ? e => set('city', e.target.value) : undefined}
                        onBlur={() => handleBlur('city')}
                        className={`${errors.city ? 'error' : ''} ${!isCityManual ? 'cif-readonly' : ''}`}
                        tabIndex={isCityManual ? 0 : -1}
                      />
                    )}
                    {errors.city && <span className="cif-error-msg">{errors.city}</span>}
                    {form.country === 'UY' && (
                      <span className="cif-info-msg" style={{ fontSize: '0.75rem', color: 'rgba(11, 61, 46, 0.6)', marginTop: '4px', display: 'block', lineHeight: '1.4' }}>
                        Alguns códigos postais do Uruguai atendem várias cidades. Informe manualmente sua cidade para um cálculo de frete mais preciso.
                      </span>
                    )}
                  </div>
                  <div className="cif-field">
                    <label htmlFor="cif-state">
                      Estado / Província
                      {form.country && form.country !== 'UY' && <span className="cif-autofill-badge">Preenchimento automático</span>}
                      {form.country === 'UY' && <span className="cif-required">*</span>}
                    </label>
                    {form.country === 'UY' ? (
                      <select
                        id="cif-state"
                        value={form.state}
                        onChange={e => handleUruguayDepartmentChange(e.target.value)}
                        onBlur={() => handleBlur('state')}
                        className={errors.state ? 'error' : ''}
                      >
                        <option value="" disabled>Selecione o departamento</option>
                        {URUGUAY_DEPARTMENTS.map(dept => (
                          <option key={dept} value={dept}>{dept}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id="cif-state"
                        type="text"
                        placeholder={
                          !form.country
                            ? 'Selecione o país primeiro'
                            : 'Preenchido pelo código postal'
                        }
                        value={form.state}
                        readOnly={true}
                        className={`${errors.state ? 'error' : ''} cif-readonly`}
                        tabIndex={-1}
                      />
                    )}
                    {errors.state && <span className="cif-error-msg">{errors.state}</span>}
                    {form.country === 'UY' && (
                      <span className="cif-info-msg" style={{ fontSize: '0.75rem', color: 'rgba(11, 61, 46, 0.6)', marginTop: '4px', display: 'block', lineHeight: '1.4' }}>
                        Não sabe seu código postal? Selecione seu Departamento e o sistema preencherá automaticamente um código postal de referência.
                      </span>
                    )}
                  </div>
                </div>

                {/* Mensagem de geocoding/frete/manual city */}
                {freightMessage && (
                  <div className="cif-freight-msg" style={{ whiteSpace: 'pre-line' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                    {freightMessage}
                  </div>
                )}

                <div className="cif-field-row">
                  <div className="cif-field">
                    <label htmlFor="cif-address">Endereço <span className="cif-required">*</span></label>
                    <input
                      id="cif-address"
                      type="text"
                      placeholder="Ex: Av. Brasil"
                      value={form.address}
                      onChange={e => set('address', e.target.value.slice(0, 120))}
                      onBlur={() => handleBlur('address')}
                      className={errors.address ? 'error' : ''}
                      maxLength={120}
                    />
                    {errors.address && <span className="cif-error-msg">{errors.address}</span>}
                  </div>
                  <div className="cif-field">
                    <label htmlFor="cif-number">Número</label>
                    <input
                      id="cif-number"
                      type="text"
                      placeholder="Ex: 123"
                      value={form.number}
                      onChange={e => set('number', e.target.value.slice(0, 15))}
                      onBlur={() => handleBlur('number')}
                      maxLength={15}
                    />
                  </div>
                </div>

                <div className="cif-field-row">
                  <div className="cif-field">
                    <label htmlFor="cif-complement">Complemento</label>
                    <input
                      id="cif-complement"
                      type="text"
                      placeholder="Ex: Bloco A, Sala 4"
                      value={form.complement}
                      onChange={e => set('complement', e.target.value.slice(0, 60))}
                      onBlur={() => handleBlur('complement')}
                      maxLength={60}
                    />
                  </div>
                  <div className="cif-field">
                    <label htmlFor="cif-phone">Telefone para contato <span className="cif-required">*</span></label>
                    <input
                      id="cif-phone"
                      type="tel"
                      placeholder="(11) 99999-9999"
                      value={form.phone}
                      onChange={e => set('phone', formatPhone(e.target.value).slice(0, 25))}
                      onBlur={() => handleBlur('phone')}
                      className={errors.phone ? 'error' : ''}
                      maxLength={25}
                    />
                    {errors.phone && <span className="cif-error-msg">{errors.phone}</span>}
                  </div>
                </div>

                <div className="cif-field">
                  <label>Número de funcionários na loja <span className="cif-required">*</span></label>
                  <div className="cif-employee-grid">
                    {EMPLOYEE_OPTIONS.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        className={`cif-emp-option ${form.employees === opt ? 'selected' : ''}`}
                        onClick={() => set('employees', opt)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {errors.employees && <span className="cif-error-msg">{errors.employees}</span>}
                </div>
              </div>

              <div className="cif-actions">
                <button className="cif-btn-secondary" onClick={() => navigate('/')}>Cancelar</button>
                <button className="cif-btn-primary" onClick={handleNext}>
                  Próximo
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2 ── */}
          {step === 2 && (
            <div className="cif-body cif-fade-in">
              <div className="cif-step-header">
                <div className="cif-step-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M3 9h18M9 21V9" />
                  </svg>
                </div>
                <div>
                  <h2 className="cif-step-title">Espaço da Loja</h2>
                  <p className="cif-step-desc">Informe as dimensões ou envie a planta baixa da sua farmácia.</p>
                </div>
              </div>

              {/* Mode toggle */}
              <div className="cif-mode-toggle">
                <button
                  type="button"
                  className={`cif-mode-btn ${form.spaceMode === 'dimensions' ? 'active' : ''}`}
                  onClick={() => set('spaceMode', 'dimensions')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <line x1="6" y1="7" x2="6" y2="17" />
                    <line x1="18" y1="7" x2="18" y2="17" />
                    <line x1="12" y1="9" x2="12" y2="15" />
                  </svg>
                  Informar dimensões
                </button>
                <button
                  type="button"
                  className={`cif-mode-btn ${form.spaceMode === 'floorplan' ? 'active' : ''}`}
                  onClick={() => set('spaceMode', 'floorplan')}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Enviar planta baixa
                </button>
              </div>

              {/* Dimensions mode */}
              {form.spaceMode === 'dimensions' && (
                <div className="cif-fields cif-fade-in">
                  <div className="cif-dim-hint">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                    Informe as dimensões internas da loja em metros. Se não souber com exatidão, uma estimativa já ajuda muito.
                  </div>
                  <div className="cif-field-row">
                    <div className="cif-field">
                      <label htmlFor="cif-width">Largura da loja <span className="cif-required">*</span></label>
                      <div className="cif-input-unit">
                        <input
                          id="cif-width"
                          type="number"
                          min="3"
                          max="100"
                          step="0.5"
                          placeholder="Ex: 8"
                          value={form.width}
                          onChange={e => set('width', e.target.value)}
                          className={errors.width ? 'error' : ''}
                        />
                        <span className="cif-unit">m</span>
                      </div>
                      {errors.width && <span className="cif-error-msg">{errors.width}</span>}
                    </div>
                    <div className="cif-field">
                      <label htmlFor="cif-height">Comprimento da loja <span className="cif-required">*</span></label>
                      <div className="cif-input-unit">
                        <input
                          id="cif-height"
                          type="number"
                          min="3"
                          max="100"
                          step="0.5"
                          placeholder="Ex: 12"
                          value={form.height}
                          onChange={e => set('height', e.target.value)}
                          className={errors.height ? 'error' : ''}
                        />
                        <span className="cif-unit">m</span>
                      </div>
                      {errors.height && <span className="cif-error-msg">{errors.height}</span>}
                    </div>
                  </div>
                  {form.width && form.height && !errors.width && !errors.height && (
                    <div className="cif-area-preview">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                      Área total: <strong>{(parseFloat(form.width) * parseFloat(form.height)).toFixed(1)} m²</strong>
                    </div>
                  )}
                </div>
              )}

              {/* Floor plan upload mode */}
              {form.spaceMode === 'floorplan' && (
                <div className="cif-fields cif-fade-in">
                  <div className="cif-dim-hint">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                    Nossa IA irá analisar sua planta baixa e configurar automaticamente as dimensões e paredes da loja.
                  </div>
                  <div
                    className={`cif-upload-zone ${form.floorPlanPreview ? 'has-file' : ''} ${errors.floorPlanFile ? 'error' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => {
                      e.preventDefault()
                      const file = e.dataTransfer.files[0]
                      if (file) {
                        const fakeEvent = { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>
                        handleFileChange(fakeEvent)
                      }
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                    />
                    {form.floorPlanPreview ? (
                      <div className="cif-upload-preview">
                        {form.floorPlanFile?.type === 'application/pdf' ? (
                          <div className="cif-pdf-badge">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                            <span>{form.floorPlanFile?.name}</span>
                          </div>
                        ) : (
                          <img src={form.floorPlanPreview} alt="Planta baixa" className="cif-preview-img" />
                        )}
                        <button
                          type="button"
                          className="cif-remove-file"
                          onClick={e => { e.stopPropagation(); set('floorPlanFile', null); set('floorPlanPreview', null) }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                          Remover
                        </button>
                      </div>
                    ) : (
                      <div className="cif-upload-empty">
                        <div className="cif-upload-icon">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </div>
                        <p className="cif-upload-title">Clique ou arraste a planta baixa aqui</p>
                        <p className="cif-upload-sub">JPG, PNG, WEBP ou PDF · Máx. 10 MB</p>
                      </div>
                    )}
                  </div>
                  {errors.floorPlanFile && <span className="cif-error-msg">{errors.floorPlanFile}</span>}
                </div>
              )}

              <div className="cif-actions">
                <button className="cif-btn-secondary" onClick={() => setStep(1)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                  Voltar
                </button>
                <button
                  className="cif-btn-primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <span className="cif-spinner" />
                      Preparando layout...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <path d="M3 9h18M9 21V9" />
                      </svg>
                      Criar Meu Layout
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Trust badges */}
        <div className="cif-trust">
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            Gratuito
          </span>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            Sem cadastro
          </span>
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            Dados protegidos
          </span>
        </div>
      </main>
    </div>
  )
}
