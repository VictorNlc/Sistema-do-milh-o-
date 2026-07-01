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
  getParaguayDepartments,
  getParaguayCities,
  getParaguayPostcode,
  getArgentinaProvinces,
  getArgentinaCities,
} from '../services/postalCode'
import { getCoordinates, normalizeManualCity } from '../services/geocodingService'
import { calculateDistance } from '../services/distanceService'
import { supabase } from '../services/supabase'
import UY_CITIES_BY_DEPT from '../data/uyCitiesByDept.json'
import UY_CITY_TO_POSTCODE from '../data/uyCityToPostcode.json'
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

interface ArgentinaProvince {
  id: string
  nombre: string
}

interface ArgentinaMunicipio {
  id: string
  nombre: string
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
  // Etapa atual do formulário (wizard): 1 = Dados da Farmácia, 2 = Espaço da Loja, 3 = Porta de Entrada
  const [step, setStep] = useState(1)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData | 'general' | 'postalCode', string>>>({})
  const [profileId, setProfileId] = useState<string | null>(null)
  const [isValidatingPhone, setIsValidatingPhone] = useState(false)

  // Door states for Step 3
  const [doorWidth, setDoorWidth] = useState('2')
  const [doorOrientation, setDoorOrientation] = useState<'N' | 'S' | 'E' | 'W'>('S')
  const [doorOffset, setDoorOffset] = useState('0')
  const isDraggingDoorRef = useRef(false)

  // Second door (corner pharmacy)
  const [hasDoor2, setHasDoor2] = useState(false)
  const [door2Width, setDoor2Width] = useState('2')
  const [door2Orientation, setDoor2Orientation] = useState<'N' | 'S' | 'E' | 'W'>('E')
  const [door2Offset, setDoor2Offset] = useState('0')
  const isDraggingDoor2Ref = useRef(false)

  // Postal code lookup state
  const [postalLoading, setPostalLoading] = useState(false)
  const [postalMessage, setPostalMessage] = useState<string | null>(null)
  const [lastFetchedKey, setLastFetchedKey] = useState<string>('')

  // Freight / geocoding message
  const [freightMessage, setFreightMessage] = useState<string | null>(null)
  const [freightData, setFreightData] = useState<{ distanceKm: number; freightCost: number } | null>(null)

  // Flag for manual city entry (when API returns only province)
  const [isCityManual, setIsCityManual] = useState(false)
  const [isStateManual, setIsStateManual] = useState(false)

  // Autocomplete state for Uruguay cities
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0)
  const suggestionsRef = useRef<HTMLDivElement>(null)

  // Paraguay departments and cities states
  const [paraguayDepartments, setParaguayDepartments] = useState<string[]>([])
  const [pyCitiesInDept, setPyCitiesInDept] = useState<string[]>([])

  // Argentina provinces and cities states
  const [argentinaProvinces, setArgentinaProvinces] = useState<ArgentinaProvince[]>([])
  const [arCitiesInProvince, setArCitiesInProvince] = useState<ArgentinaMunicipio[]>([])
  const [arSelectedProvinceId, setArSelectedProvinceId] = useState<string>('')
  const [locationReady, setLocationReady] = useState(false)

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

  const wMeters = parseFloat(form.width) || 10
  const hMeters = parseFloat(form.height) || 12

  // Limites da largura da porta 1 (largura da parede menos 2m de margem nas extremidades)
  const wallLength1 = (doorOrientation === 'N' || doorOrientation === 'S') ? wMeters : hMeters
  const maxDoorWidth = Math.max(0.8, wallLength1 - 2)

  // Limites da largura da porta 2 (largura da parede menos 2m de margem nas extremidades)
  const wallLength2 = (door2Orientation === 'N' || door2Orientation === 'S') ? wMeters : hMeters
  const maxDoor2Width = Math.max(0.8, wallLength2 - 2)

  // Recalculates default centered door offset
  useEffect(() => {
    if (step !== 3) return
    const w = wMeters
    const h = hMeters
    const dWidth = parseFloat(doorWidth) || 2
    const wallLength = (doorOrientation === 'N' || doorOrientation === 'S') ? w : h
    const maxOffset = Math.max(0, wallLength - dWidth)
    setDoorOffset((maxOffset / 2).toFixed(1))
  }, [doorOrientation, doorWidth, form.width, form.height, step])

  const set = (field: keyof FormData, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // ── Validation Logic ────────────────────────────────────────────────────
  const validateField = useCallback((field: keyof FormData, currentForm: FormData): string | undefined => {
    if (field === 'clientName' && !currentForm.clientName.trim()) return 'Informe seu nome.'
    if (field === 'pharmacyName' && !currentForm.pharmacyName.trim()) return 'Informe o nome da farmácia.'
    if (field === 'country' && !currentForm.country) return 'Selecione o país.'
    if (field === 'postalCode') {
      if (currentForm.country === 'AR') {
        // CPA is optional for Argentina
        if (!currentForm.postalCode.trim()) return undefined
      } else {
        if (!currentForm.postalCode.trim()) return 'Informe o CEP / Código postal.'
      }

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
      if (currentForm.country === 'UY' || currentForm.country === 'PY' || currentForm.country === 'AR') {
        return 'Informe a cidade para continuar.'
      }
      return 'Cidade não preenchida. Verifique o código postal ou informe manualmente.'
    }
    if (field === 'state' && !currentForm.state.trim()) {
      if (currentForm.country === 'AR' && isStateManual) {
        return 'Informe o estado / província para continuar.'
      }
      return 'Estado não preenchido. Verifique o código postal.'
    }
    if (field === 'address' && !currentForm.address.trim()) return 'Informe o endereço.'
    if (field === 'phone' && currentForm.phone.replace(/\D/g, '').length < 10) return 'Informe um telefone válido.'
    if (field === 'employees' && !currentForm.employees) return 'Selecione o número de funcionários.'
    return undefined
  }, [isCityManual, isStateManual])

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

        return
      }

      if (country === 'AR') {
        setForm(prev => ({
          ...prev,
          city: result.data!.city || '',
          state: result.data!.state || '',
        }))
        setPostalMessage(null)

        if (!result.data!.city) {
          console.warn('[Freight] Apenas província identificada.')
          setIsCityManual(true)
          setIsStateManual(true)
          setFreightMessage('Não foi possível identificar a cidade automaticamente. Informe sua cidade para continuar.')
          setLocationReady(false)
          setFreightData(null)

          getArgentinaProvinces().then(provs => {
            const found = provs.find(p => p.nombre.toLowerCase().trim() === result.data!.state.toLowerCase().trim())
            if (found) {
              setArSelectedProvinceId(found.id)
            }
          }).catch(() => { })
        } else {
          setIsCityManual(false)
          setIsStateManual(false)
          setFreightMessage(null)
          setLocationReady(true)

          getArgentinaProvinces().then(provs => {
            const found = provs.find(p => p.nombre.toLowerCase().trim() === result.data!.state.toLowerCase().trim())
            if (found) {
              setArSelectedProvinceId(found.id)
            }
          }).catch(() => { })

          // Pipeline: Geocoding → Distância → Frete

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

        setIsCityManual(true)
        if (country === 'AR') {
          setFreightMessage('Não foi possível identificar a cidade automaticamente. Informe sua cidade para continuar.')
          getArgentinaProvinces().then(provs => {
            const found = provs.find(p => p.nombre.toLowerCase().trim() === result.data!.state.toLowerCase().trim())
            if (found) {
              setArSelectedProvinceId(found.id)
            }
          }).catch(() => { })
        } else {
          setFreightMessage(
            'Não foi possível identificar sua cidade através do código postal.\n\nPara calcular o frete corretamente, informe a cidade onde você está localizado.'
          )
        }
      } else {
        setIsCityManual(false)
        if (country === 'AR') {
          setIsStateManual(false)
          getArgentinaProvinces().then(provs => {
            const found = provs.find(p => p.nombre.toLowerCase().trim() === result.data!.state.toLowerCase().trim())
            if (found) {
              setArSelectedProvinceId(found.id)
            }
          }).catch(() => { })
        }
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
      if (country === 'PY') {
        setIsCityManual(true)
        setPostalMessage('Código postal não encontrado na base do Paraguai.')
        return
      }
      if (country === 'AR') {
        setIsCityManual(true)
        setIsStateManual(true)
        setForm(prev => ({ ...prev, city: '', state: '' }))
        setPostalMessage(result.error || 'Não foi possível localizar este CPA automaticamente. Informe sua cidade e província para continuar.')
        setLocationReady(false)
        setFreightData(null)

        return
      }
      setIsCityManual(false)
      setIsStateManual(false)
      setForm(prev => ({ ...prev, city: '', state: '' }))
      setPostalMessage(result.error || 'Código postal inválido.')
    }
  }, [lastFetchedKey])

  // Auto-trigger lookup when postal code changes and country is selected
  useEffect(() => {
    if (!form.country) return

    // UY: não auto-preencher cidade/estado, não limpar campos manuais se selecionados via autocomplete
    if (form.country === 'UY') {
      const sanitized = sanitizePostalCode(form.country, form.postalCode)
      const expectedLength = getPostalCodeLength(form.country, form.postalCode)
      if (sanitized.length === expectedLength) {
        const key = `${form.state}|${form.city}`
        const matchedPostcode = (UY_CITY_TO_POSTCODE as Record<string, string>)[key]
        if (matchedPostcode === sanitized) {
          return
        }
        performLookup(form.country, form.postalCode)
      }
      return
    }

    // PY: não auto-preencher se selecionados via autocomplete
    if (form.country === 'PY') {
      const sanitized = sanitizePostalCode(form.country, form.postalCode)
      const expectedLength = getPostalCodeLength(form.country, form.postalCode)
      if (sanitized.length === expectedLength) {
        getParaguayPostcode(form.state, form.city).then(matchedPostcode => {
          if (matchedPostcode === sanitized) {
            return
          }
          performLookup(form.country, form.postalCode)
        })
      }
      return
    }

    // AR: não auto-preencher se selecionados via manual/autocomplete, e não limpar se incompleto
    if (form.country === 'AR') {
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
    setFreightData(null)
    setLastFetchedKey('')
    setIsCityManual(form.country === 'UY' || form.country === 'PY' || form.country === 'AR')
    setIsStateManual(form.country === 'AR')
    setArSelectedProvinceId('')
    setShowSuggestions(false)
    setLocationReady(false)
  }, [form.country])

  // Load Paraguay departments on demand when country is Paraguay
  useEffect(() => {
    if (form.country === 'PY' && paraguayDepartments.length === 0) {
      getParaguayDepartments().then(depts => {
        setParaguayDepartments(depts)
      }).catch(err => {
        console.error('[PY] Erro ao obter departamentos:', err)
      })
    }
  }, [form.country, paraguayDepartments.length])

  // Load Argentina provinces on demand when country is Argentina
  useEffect(() => {
    if (form.country === 'AR' && argentinaProvinces.length === 0) {
      getArgentinaProvinces().then(provs => {
        setArgentinaProvinces(provs)
      }).catch(err => {
        console.error('[AR] Erro ao obter províncias:', err)
        setPostalMessage('Não foi possível carregar a lista de províncias.')
      })
    }
  }, [form.country, argentinaProvinces.length])

  // Load cities of selected Argentina province
  useEffect(() => {
    if (form.country === 'AR') {
      if (arSelectedProvinceId) {
        getArgentinaCities(arSelectedProvinceId).then(cities => {
          setArCitiesInProvince(cities)
        }).catch(err => {
          console.error('[AR] Erro ao obter cidades:', err)
          setPostalMessage('Não foi possível carregar as cidades desta província.')
          setArCitiesInProvince([])
        })
      } else {
        setArCitiesInProvince([])
      }
    }
  }, [form.country, arSelectedProvinceId])

  // Load cities of selected Paraguay department
  useEffect(() => {
    if (form.country === 'PY') {
      if (form.state) {
        getParaguayCities(form.state).then(cities => {
          setPyCitiesInDept(cities)
        }).catch(err => {
          console.error('[PY] Erro ao obter cidades:', err)
          setPyCitiesInDept([])
        })
      } else {
        setPyCitiesInDept([])
      }
    }
  }, [form.country, form.state])

  // ── Geocoding + Frete com cidade/estado manuais ─────────────────────────
  useEffect(() => {
    if (!isCityManual) return

    // UY & PY: se a cidade estiver vazia, exibe mensagem informativa de obrigatoriedade e não consulta Nominatim
    if ((form.country === 'UY' || form.country === 'PY') && !form.city.trim()) {
      setFreightMessage('Cidade obrigatória para cálculo do frete.')
      return
    }

    // AR: se a cidade estiver vazia, ou a localização não estiver pronta
    if (form.country === 'AR') {
      if (!form.state.trim() || !form.city.trim() || !locationReady) {

        setFreightData(null)
        if (!form.city.trim()) {
          setFreightMessage('Não foi possível identificar a cidade automaticamente. Informe sua cidade para continuar.')
        } else {
          setFreightMessage('Cidade inválida ou não selecionada. Escolha uma cidade da lista.')
        }
        return
      }
    }

    if (!form.city.trim() || form.city.trim().length < 2) return
    if (!form.state.trim() || form.state.trim().length < 2) return

    setFreightMessage(null)

    const timer = setTimeout(async () => {
      if (form.country === 'AR') {

      } else {


      }

      const normalizedCity = normalizeManualCity(form.city)
      const geoResult = await getCoordinates(form.country, form.state.trim(), normalizedCity)

      if (!geoResult.success || !geoResult.data) {
        console.warn('[Freight] Cidade não localizada no Nominatim.')
        setFreightMessage('Não foi possível localizar a cidade, precisa calcular manualmente.')
        return
      }

      if (form.country === 'AR') {

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
  }, [isCityManual, form.country, form.city, form.state, locationReady])

  // ── Autocomplete Logic for Uruguay, Paraguay & Argentina ─────────────────
  const citiesInDept = useMemo(() => {
    if (form.country === 'UY') {
      return (UY_CITIES_BY_DEPT as Record<string, string[]>)[form.state] || []
    }
    if (form.country === 'PY') {
      return pyCitiesInDept
    }
    if (form.country === 'AR') {
      return arCitiesInProvince.map(c => c.nombre)
    }
    return []
  }, [form.country, form.state, pyCitiesInDept, arCitiesInProvince])

  const filteredCities = useMemo(() => {
    if ((form.country !== 'UY' && form.country !== 'PY' && form.country !== 'AR') || !form.city || form.city.trim().length < 2) return []

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

  const handleSelectSuggestion = async (city: string) => {
    if (form.country === 'UY') {
      const key = `${form.state}|${city}`
      const postcode = (UY_CITY_TO_POSTCODE as Record<string, string>)[key]

      setForm(prev => ({
        ...prev,
        city,
        postalCode: postcode || ''
      }))

      if (postcode) {
        setPostalMessage(null)
      } else {
        setPostalMessage('Não foi possível localizar o código postal para esta cidade.')
      }
    } else if (form.country === 'PY') {
      try {
        const postcode = await getParaguayPostcode(form.state, city)
        setForm(prev => ({
          ...prev,
          city,
          postalCode: postcode || ''
        }))
        if (postcode) {
          setPostalMessage(null)
        } else {
          setPostalMessage('Não foi possível localizar o código postal para esta cidade.')
        }
      } catch (err) {
        console.error('[PY] Erro ao obter código postal:', err)
        setForm(prev => ({ ...prev, city, postalCode: '' }))
        setPostalMessage('Erro ao obter o código postal.')
      }
    } else if (form.country === 'AR') {
      setForm(prev => ({
        ...prev,
        city
      }))
      setPostalMessage(null)
      setLocationReady(true)

    }

    setShowSuggestions(false)
  }

  const handleCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((form.country !== 'UY' && form.country !== 'PY' && form.country !== 'AR') || !showSuggestions || filteredCities.length === 0) return

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

  const handleCityBlur = () => {
    handleBlur('city')
    if (form.country === 'UY') {
      const key = `${form.state}|${form.city}`
      const postcode = (UY_CITY_TO_POSTCODE as Record<string, string>)[key]
      if (form.city.trim() && !postcode) {
        setPostalMessage('Não foi possível localizar o código postal para esta cidade.')
      } else {
        setPostalMessage(null)
      }
    } else if (form.country === 'PY') {
      if (form.city.trim()) {
        getParaguayPostcode(form.state, form.city).then(postcode => {
          if (!postcode) {
            setPostalMessage('Não foi possível localizar o código postal para esta cidade.')
          } else {
            setPostalMessage(null)
          }
        }).catch(() => {
          setPostalMessage('Não foi possível localizar o código postal para esta cidade.')
        })
      } else {
        setPostalMessage(null)
      }
    } else if (form.country === 'AR') {
      const trimmedCity = form.city.trim()
      const match = citiesInDept.find(c => c.toLowerCase().trim() === trimmedCity.toLowerCase())
      if (match) {
        setForm(prev => ({ ...prev, city: match }))
        setLocationReady(true)

      } else {
        setLocationReady(false)
        setFreightData(null)

      }
    }
  }

  // ── Postal code input handler ───────────────────────────────────────────
  const handlePostalCodeChange = (value: string) => {
    if (form.country) {
      set('postalCode', formatPostalCode(form.country, value))
      if (form.country === 'AR') {
        setLocationReady(false)
        setFreightData(null)
        setIsCityManual(true)
        setIsStateManual(true)

      }
    } else {
      set('postalCode', value)
    }
  }

  const handleUruguayDepartmentChange = (department: string) => {
    setForm(prev => ({
      ...prev,
      state: department,
      city: '',
      postalCode: ''
    }))
    setPostalMessage(null)
    setShowSuggestions(false)
  }

  const handleParaguayDepartmentChange = (department: string) => {
    setForm(prev => ({
      ...prev,
      state: department,
      city: '',
      postalCode: ''
    }))
    setPostalMessage(null)
    setShowSuggestions(false)
  }

  const handleArgentinaProvinceChange = (provinceName: string) => {
    const found = argentinaProvinces.find(p => p.nombre === provinceName)
    const provinceId = found ? found.id : ''

    setArSelectedProvinceId(provinceId)
    setForm(prev => ({
      ...prev,
      state: provinceName,
      city: '',
      postalCode: ''
    }))
    setPostalMessage(null)
    setShowSuggestions(false)
    setLocationReady(false)
    setFreightData(null)

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
      
      if (!errs.width && !errs.height) {
        if (w * h > 700) {
          errs.width = 'A área total não pode exceder 700m².'
          errs.height = 'A área total não pode exceder 700m².'
        }
        
      }
    } else {
      if (!form.floorPlanFile) errs.floorPlanFile = 'Selecione uma imagem da planta baixa.'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleNext = async () => {
    if (!validateStep1()) return
    
    setIsValidatingPhone(true)
    setErrors(prev => {
      const copy = { ...prev }
      delete copy.phone
      return copy
    })
    
    try {
      if (supabase) {
        const { data: existing, error } = await supabase
          .from('profiles')
          .select('id, name')
          .eq('phone', form.phone)
          .maybeSingle()
          
        if (error) {
          console.warn('Erro ao verificar telefone no Supabase:', error.message)
        }
        
        if (existing) {
          const inputName = form.clientName.trim().toLowerCase().replace(/\s+/g, ' ')
          const dbName = (existing.name || '').trim().toLowerCase().replace(/\s+/g, ' ')
          
          if (inputName !== dbName) {
            setErrors(prev => ({
              ...prev,
              phone: 'Este número de telefone já está cadastrado para outro cliente.'
            }))
            setIsValidatingPhone(false)
            return
          } else {
            // Mesmo cliente retornando, reaproveitamos o profileId
            setProfileId(existing.id)
          }
        } else {
          // Novo cliente
          setProfileId(null)
        }
      }
      setStep(2)
    } catch (err) {
      console.warn('Erro na validação do telefone:', err)
      setStep(2) // fallback
    } finally {
      setIsValidatingPhone(false)
    }
  }

  const handleStep2Next = () => {
    if (validateStep2()) setStep(3)
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

    // Reaproveita o ID existente ou gera um novo
    const idToSave = profileId || ((typeof crypto !== 'undefined' && crypto.randomUUID) 
      ? crypto.randomUUID() 
      : 'p_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15))

    // Try to save/update in Supabase profiles table
    if (supabase) {
      try {
        const { error } = await supabase.from('profiles').upsert({
          id: idToSave,
          name: form.clientName.trim(),
          pharmacyName: form.pharmacyName.trim(),
          phone: form.phone,
          country: form.country,
          postalCode: form.postalCode.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          address: form.address.trim(),
          number: form.number.trim(),
          complement: form.complement.trim(),
          employees: form.employees,
          storeWidth: form.spaceMode === 'dimensions' ? parseFloat(form.width) : null,
          storeHeight: form.spaceMode === 'dimensions' ? parseFloat(form.height) : null,
          role: 'user',
          updatedAt: new Date().toISOString()
        })
        if (error) {
          console.warn('⚠️ Erro ao salvar perfil no Supabase:', error.message)
        }
      } catch (err) {
        console.warn('⚠️ Falha ao salvar perfil no Supabase:', err)
      }
    }

    // Save client data to sessionStorage so Editor can consume it
    const intakeData = {
      profileId: idToSave,
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
      door: form.spaceMode === 'dimensions' ? {
        width: Math.min(maxDoorWidth, Math.max(0.8, parseFloat(doorWidth) || 2.0)),
        orientation: doorOrientation,
        offset: parseFloat(doorOffset) || 0.0
      } : null,
      door2: (form.spaceMode === 'dimensions' && hasDoor2) ? {
        width: Math.min(maxDoor2Width, Math.max(0.8, parseFloat(door2Width) || 2.0)),
        orientation: door2Orientation,
        offset: parseFloat(door2Offset) || 0.0
      } : null,
      isCorner: form.spaceMode === 'dimensions' && hasDoor2 &&
        doorOrientation !== door2Orientation &&
        !(
          (doorOrientation === 'N' && door2Orientation === 'S') ||
          (doorOrientation === 'S' && door2Orientation === 'N') ||
          (doorOrientation === 'E' && door2Orientation === 'W') ||
          (doorOrientation === 'W' && door2Orientation === 'E')
        )
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
      profileId: idToSave
    }))

    // Small delay for UX
    await new Promise(r => setTimeout(r, 700))

    const params = new URLSearchParams()
    if (form.spaceMode === 'floorplan') {
      params.set('floorplan', '1')
    } else {
      params.set('view3d', 'aerial')
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
            <div className={`cif-step-dot ${step >= 2 ? 'active' : ''}`}>
              {step > 2 ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              ) : '2'}
            </div>
            {form.spaceMode === 'dimensions' && (
              <>
                <div className={`cif-progress-line ${step >= 3 ? 'filled' : ''}`} />
                <div className={`cif-step-dot ${step >= 3 ? 'active' : ''}`}>3</div>
              </>
            )}
          </div>
          <div className="cif-step-labels">
            <span className={step === 1 ? 'active' : ''}>Dados da Farmácia</span>
            <span className={step === 2 ? 'active' : ''}>Espaço da Loja</span>
            {form.spaceMode === 'dimensions' && (
              <span className={step === 3 ? 'active' : ''}>Porta de Entrada</span>
            )}
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
                      Código Postal {form.country !== 'AR' && <span className="cif-required">*</span>}
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
                    {form.country === 'UY' || form.country === 'PY' || form.country === 'AR' ? (
                      <div className="cif-autocomplete-wrap" ref={suggestionsRef}>
                        <input
                          id="cif-city"
                          type="text"
                          placeholder="Informe a cidade"
                          value={form.city}
                          readOnly={false}
                          onChange={e => {
                            const val = e.target.value
                            if (form.country === 'UY') {
                              setForm(prev => {
                                const key = `${prev.state}|${val}`
                                const postcode = (UY_CITY_TO_POSTCODE as Record<string, string>)[key] || ''
                                return {
                                  ...prev,
                                  city: val,
                                  postalCode: postcode
                                }
                              })
                              setPostalMessage(null)
                            } else if (form.country === 'PY') {
                              // Paraguay
                              setForm(prev => ({
                                ...prev,
                                city: val,
                                postalCode: ''
                              }))
                              getParaguayPostcode(form.state, val).then(postcode => {
                                if (postcode) {
                                  setForm(prev => {
                                    if (prev.city === val) {
                                      return { ...prev, postalCode: postcode }
                                    }
                                    return prev
                                  })
                                  setPostalMessage(null)
                                }
                              }).catch(() => { })
                            } else if (form.country === 'AR') {
                              // Argentina
                              setForm(prev => ({
                                ...prev,
                                city: val
                              }))
                              setLocationReady(false)
                              setFreightData(null)

                            }
                            setShowSuggestions(true)
                            setActiveSuggestionIndex(0)
                          }}
                          onFocus={() => setShowSuggestions(true)}
                          onBlur={handleCityBlur}
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
                      {form.country && form.country !== 'UY' && form.country !== 'PY' && !isStateManual && (
                        <span className="cif-autofill-badge">Preenchimento automático</span>
                      )}
                      {(form.country === 'UY' || form.country === 'PY' || (form.country === 'AR' && isStateManual)) && (
                        <span className="cif-required">*</span>
                      )}
                    </label>
                    {form.country === 'UY' || form.country === 'PY' || form.country === 'AR' ? (
                      <select
                        id="cif-state"
                        value={form.state}
                        onChange={e => {
                          if (form.country === 'UY') {
                            handleUruguayDepartmentChange(e.target.value)
                          } else if (form.country === 'PY') {
                            handleParaguayDepartmentChange(e.target.value)
                          } else if (form.country === 'AR') {
                            handleArgentinaProvinceChange(e.target.value)
                          }
                        }}
                        onBlur={() => handleBlur('state')}
                        className={errors.state ? 'error' : ''}
                      >
                        <option value="" disabled>
                          {form.country === 'AR' ? 'Selecione a província' : 'Selecione o departamento'}
                        </option>
                        {form.country === 'UY' &&
                          URUGUAY_DEPARTMENTS.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))
                        }
                        {form.country === 'PY' &&
                          paraguayDepartments.map(dept => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))
                        }
                        {form.country === 'AR' &&
                          argentinaProvinces.map(prov => (
                            <option key={prov.id} value={prov.nombre}>{prov.nombre}</option>
                          ))
                        }
                      </select>
                    ) : (
                      <input
                        id="cif-state"
                        type="text"
                        placeholder={
                          !form.country
                            ? 'Selecione o país primeiro'
                            : isStateManual
                              ? 'Informe o estado / província'
                              : 'Preenchido pelo código postal'
                        }
                        value={form.state}
                        readOnly={!isStateManual}
                        onChange={isStateManual ? e => set('state', e.target.value) : undefined}
                        onBlur={() => handleBlur('state')}
                        className={`${errors.state ? 'error' : ''} ${!isStateManual ? 'cif-readonly' : ''}`}
                        tabIndex={isStateManual ? 0 : -1}
                      />
                    )}
                    {errors.state && <span className="cif-error-msg">{errors.state}</span>}
                    {form.country === 'UY' && (
                      <span className="cif-info-msg" style={{ fontSize: '0.75rem', color: 'rgba(11, 61, 46, 0.6)', marginTop: '4px', display: 'block', lineHeight: '1.4' }}>
                        Não sabe seu código postal? Selecione seu Departamento e o sistema preencherá automaticamente um código postal de referência.
                      </span>
                    )}
                    {form.country === 'PY' && (
                      <span className="cif-info-msg" style={{ fontSize: '0.75rem', color: 'rgba(11, 61, 46, 0.6)', marginTop: '4px', display: 'block', lineHeight: '1.4' }}>
                        Não sabe seu código postal? Selecione seu Departamento e escolha sua cidade para preencher automaticamente o código postal.
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
                <button className="cif-btn-secondary" onClick={() => navigate('/')} disabled={isValidatingPhone}>Cancelar</button>
                <button className="cif-btn-primary" onClick={handleNext} disabled={isValidatingPhone}>
                  {isValidatingPhone ? (
                    <>
                      Validando...
                      <span className="cif-spinner-sm" style={{ borderLeftColor: 'white', marginLeft: 6, display: 'inline-block', verticalAlign: 'middle' }} />
                    </>
                  ) : (
                    <>
                      Próximo
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                    </>
                  )}
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
                    <>

                      <div className="cif-area-preview" style={{ marginTop: '20px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                        Área útil total: <strong>{(parseFloat(form.width) * parseFloat(form.height)).toFixed(1)} m²</strong>
                      </div>
                    </>
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
                  onClick={form.spaceMode === 'dimensions' ? handleStep2Next : handleSubmit}
                  disabled={isSubmitting}
                >
                  {form.spaceMode === 'dimensions' ? (
                    <>
                      Próximo
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                    </>
                  ) : isSubmitting ? (
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

          {/* ── STEP 3 ── */}
          {step === 3 && (
            <div className="cif-body cif-fade-in">
              <div className="cif-step-header">
                <div className="cif-step-icon" style={{ background: '#10b981', color: 'white' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M9 3v18M15 3v18" />
                  </svg>
                </div>
                <div>
                  <h2 className="cif-step-title">Porta de Entrada</h2>
                  <p className="cif-step-desc">Defina a posição e a largura da porta de entrada principal da farmácia.</p>
                </div>
              </div>

              <div className="cif-fields">
                <div className="cif-field-row">
                  <div className="cif-field">
                    <label htmlFor="cif-door-wall">Parede da Porta <span className="cif-required">*</span></label>
                    <select
                      id="cif-door-wall"
                      value={doorOrientation}
                      onChange={e => {
                        const newOrient = e.target.value as any
                        setDoorOrientation(newOrient)
                        const wLen = (newOrient === 'N' || newOrient === 'S') ? wMeters : hMeters
                        const maxW = Math.max(0.8, wLen - 2)
                        if (parseFloat(doorWidth) > maxW) {
                          setDoorWidth(maxW.toFixed(1))
                        }
                      }}
                    >
                      <option value="S">Parede Inferior (Frente/Principal)</option>
                      <option value="N">Parede Superior (Fundos)</option>
                      <option value="W">Parede Esquerda</option>
                      <option value="E">Parede Direita</option>
                    </select>
                  </div>
                  <div className="cif-field">
                    <label htmlFor="cif-door-width">Largura da Porta (m) <span className="cif-required">*</span></label>
                    <input
                      id="cif-door-width"
                      type="number"
                      min="0.8"
                      max={maxDoorWidth.toFixed(1)}
                      step="0.1"
                      placeholder="Ex: 2.0"
                      value={doorWidth}
                      onChange={e => {
                        const val = parseFloat(e.target.value)
                        if (val > maxDoorWidth) {
                          setDoorWidth(maxDoorWidth.toFixed(1))
                        } else {
                          setDoorWidth(e.target.value)
                        }
                      }}
                    />
                  </div>
                </div>

                {/* SVG Interactive Door Preview */}
                {(() => {
                  const wMeters = parseFloat(form.width) || 10
                  const hMeters = parseFloat(form.height) || 12
                  const dWidth = parseFloat(doorWidth) || 2
                  const dOffset = parseFloat(doorOffset) || 0
                  const isHoriz = doorOrientation === 'N' || doorOrientation === 'S'
                  const wallLength = isHoriz ? wMeters : hMeters
                  const maxOffset = Math.max(0, wallLength - dWidth)

                  const maxPreviewW = 280
                  const maxPreviewH = 180
                  const aspectRatio = wMeters / hMeters

                  let previewW = maxPreviewW
                  let previewH = maxPreviewW / aspectRatio
                  if (previewH > maxPreviewH) {
                    previewH = maxPreviewH
                    previewW = maxPreviewH * aspectRatio
                  }

                  const scaleX = previewW / wMeters
                  const scaleY = previewH / hMeters
                  const doorPxWidth = dWidth * (isHoriz ? scaleX : scaleY)
                  const doorPxOffset = dOffset * (isHoriz ? scaleX : scaleY)
                  const doorThickness = 7

                  let doorX = 0, doorY = 0, doorW = 0, doorH = 0
                  let arrowX = 0, arrowY = 0, arrowPoints = '', arrowLineToX = 0, arrowLineToY = 0
                  // Transparent interactive wall strip rect coords
                  let wallStripX = 0, wallStripY = 0, wallStripW = 0, wallStripH = 0

                  if (doorOrientation === 'N') {
                    doorX = doorPxOffset; doorY = 0; doorW = doorPxWidth; doorH = doorThickness
                    arrowX = doorX + doorW / 2; arrowY = doorY + 22
                    arrowPoints = `${arrowX - 5},17 ${arrowX},22 ${arrowX + 5},17`
                    arrowLineToX = arrowX; arrowLineToY = arrowY - 12
                    wallStripX = 0; wallStripY = 0; wallStripW = previewW; wallStripH = 20
                  } else if (doorOrientation === 'S') {
                    doorX = doorPxOffset; doorY = previewH - doorThickness; doorW = doorPxWidth; doorH = doorThickness
                    arrowX = doorX + doorW / 2; arrowY = doorY - 22
                    arrowPoints = `${arrowX - 5},${previewH - 17} ${arrowX},${previewH - 22} ${arrowX + 5},${previewH - 17}`
                    arrowLineToX = arrowX; arrowLineToY = arrowY + 12
                    wallStripX = 0; wallStripY = previewH - 20; wallStripW = previewW; wallStripH = 20
                  } else if (doorOrientation === 'W') {
                    doorX = 0; doorY = doorPxOffset; doorW = doorThickness; doorH = doorPxWidth
                    arrowX = doorX + 22; arrowY = doorY + doorH / 2
                    arrowPoints = `17,${arrowY - 5} 22,${arrowY} 17,${arrowY + 5}`
                    arrowLineToX = arrowX - 12; arrowLineToY = arrowY
                    wallStripX = 0; wallStripY = 0; wallStripW = 20; wallStripH = previewH
                  } else { // E
                    doorX = previewW - doorThickness; doorY = doorPxOffset; doorW = doorThickness; doorH = doorPxWidth
                    arrowX = doorX - 22; arrowY = doorY + doorH / 2
                    arrowPoints = `${previewW - 17},${arrowY - 5} ${previewW - 22},${arrowY} ${previewW - 17},${arrowY + 5}`
                    arrowLineToX = arrowX + 12; arrowLineToY = arrowY
                    wallStripX = previewW - 20; wallStripY = 0; wallStripW = 20; wallStripH = previewH
                  }

                  const computeOffset = (clientX: number, clientY: number, svgEl: SVGSVGElement) => {
                    const rect = svgEl.getBoundingClientRect()
                    const relX = clientX - rect.left
                    const relY = clientY - rect.top
                    let newOffset: number
                    if (isHoriz) {
                      newOffset = (relX - doorPxWidth / 2) / scaleX
                    } else {
                      newOffset = (relY - doorPxWidth / 2) / scaleY
                    }
                    return Math.max(0, Math.min(maxOffset, newOffset))
                  }

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '18px 0' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'rgba(11,61,46,0.65)', marginBottom: '6px', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                        Clique ou arraste na parede para posicionar a porta
                      </span>
                      <svg
                        width={previewW}
                        height={previewH}
                        style={{
                          background: '#f0fdf4',
                          border: '2px solid #6ee7b7',
                          borderRadius: '8px',
                          cursor: isHoriz ? 'ew-resize' : 'ns-resize',
                          touchAction: 'none',
                          userSelect: 'none'
                        }}
                        onMouseDown={e => {
                          isDraggingDoorRef.current = true
                          const newOff = computeOffset(e.clientX, e.clientY, e.currentTarget)
                          setDoorOffset(newOff.toFixed(1))
                        }}
                        onMouseMove={e => {
                          if (!isDraggingDoorRef.current) return
                          const newOff = computeOffset(e.clientX, e.clientY, e.currentTarget)
                          setDoorOffset(newOff.toFixed(1))
                        }}
                        onMouseUp={() => { isDraggingDoorRef.current = false }}
                        onMouseLeave={() => { isDraggingDoorRef.current = false }}
                        onTouchStart={e => {
                          e.preventDefault()
                          isDraggingDoorRef.current = true
                          const t = e.touches[0]
                          const newOff = computeOffset(t.clientX, t.clientY, e.currentTarget)
                          setDoorOffset(newOff.toFixed(1))
                        }}
                        onTouchMove={e => {
                          e.preventDefault()
                          if (!isDraggingDoorRef.current) return
                          const t = e.touches[0]
                          const newOff = computeOffset(t.clientX, t.clientY, e.currentTarget)
                          setDoorOffset(newOff.toFixed(1))
                        }}
                        onTouchEnd={() => { isDraggingDoorRef.current = false }}
                      >
                        <defs>
                          <pattern id="preview-grid" width={12} height={12} patternUnits="userSpaceOnUse">
                            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#dcfce7" strokeWidth="1" />
                          </pattern>
                        </defs>
                        {/* Floor fill */}
                        <rect width={previewW} height={previewH} fill="url(#preview-grid)" rx={6} />

                        {/* Interactive wall highlight strip */}
                        <rect
                          x={wallStripX} y={wallStripY} width={wallStripW} height={wallStripH}
                          fill="rgba(16,185,129,0.12)"
                          stroke="rgba(16,185,129,0.35)"
                          strokeWidth={1}
                          rx={3}
                        />

                        {/* Label on wall strip */}
                        {isHoriz ? (
                          <text
                            x={previewW / 2}
                            y={doorOrientation === 'S' ? previewH - 6 : 13}
                            textAnchor="middle"
                            fontSize={8}
                            fill="rgba(4,120,87,0.7)"
                            fontWeight="700"
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            ← arraste →
                          </text>
                        ) : (
                          <text
                            x={doorOrientation === 'E' ? previewW - 10 : 10}
                            y={previewH / 2}
                            textAnchor="middle"
                            fontSize={8}
                            fill="rgba(4,120,87,0.7)"
                            fontWeight="700"
                            transform={`rotate(-90, ${doorOrientation === 'E' ? previewW - 10 : 10}, ${previewH / 2})`}
                            style={{ pointerEvents: 'none', userSelect: 'none' }}
                          >
                            ← arraste →
                          </text>
                        )}

                        {/* Door block */}
                        <rect
                          x={doorX} y={doorY} width={doorW} height={doorH}
                          fill="#10b981"
                          stroke="#047857"
                          strokeWidth={1.5}
                          rx={2}
                          style={{ pointerEvents: 'none' }}
                        />

                        {/* Arrow pointing inward */}
                        <polyline
                          points={arrowPoints}
                          fill="none" stroke="#047857" strokeWidth={2.5}
                          strokeLinecap="round" strokeLinejoin="round"
                          style={{ pointerEvents: 'none' }}
                        />
                        <line
                          x1={arrowLineToX} y1={arrowLineToY} x2={arrowX} y2={arrowY}
                          stroke="#047857" strokeWidth={2.5} strokeLinecap="round"
                          style={{ pointerEvents: 'none' }}
                        />
                      </svg>
                      {/* Position readout */}
                      <div style={{ marginTop: 8, fontSize: '0.78rem', fontWeight: 700, color: 'rgba(11,61,46,0.75)', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: '2px 10px' }}>
                          Posição: {parseFloat(doorOffset).toFixed(1)} m do canto
                        </span>
                        <span style={{ color: 'rgba(11,61,46,0.4)', fontSize: '0.7rem' }}>
                          máx. {maxOffset.toFixed(1)} m
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* ── Second Door (Corner Pharmacy) ── */}
              {!hasDoor2 ? (
                <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 16px' }}>
                  <button
                    type="button"
                    onClick={() => setHasDoor2(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      background: 'rgba(16,185,129,0.06)',
                      border: '1.5px dashed rgba(16,185,129,0.5)',
                      borderRadius: 10, padding: '8px 20px',
                      color: 'rgba(11,61,46,0.75)', fontSize: '0.82rem',
                      fontWeight: 700, cursor: 'pointer',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.14)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.06)')}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Adicionar segunda porta (farmácia de esquina)
                  </button>
                </div>
              ) : (
                <div style={{
                  background: 'rgba(16,185,129,0.05)',
                  border: '1.5px solid rgba(16,185,129,0.3)',
                  borderRadius: 12, padding: '14px 16px',
                  marginBottom: 16
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'rgba(11,61,46,0.8)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                      </svg>
                      Segunda Porta – Farmácia de Esquina
                    </span>
                    <button
                      type="button"
                      onClick={() => setHasDoor2(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(11,61,46,0.4)', fontSize: '0.75rem', padding: '2px 6px' }}
                    >
                      ✕ remover
                    </button>
                  </div>

                  <div className="cif-form-row">
                    <div className="cif-field">
                      <label>Parede da 2ª Porta</label>
                    <select
                      value={door2Orientation}
                      onChange={e => {
                        const newOrient = e.target.value as any
                        setDoor2Orientation(newOrient)
                        const wLen = (newOrient === 'N' || newOrient === 'S') ? wMeters : hMeters
                        const maxW = Math.max(0.8, wLen - 2)
                        if (parseFloat(door2Width) > maxW) {
                          setDoor2Width(maxW.toFixed(1))
                        }
                      }}
                    >
                      {doorOrientation !== 'S' && <option value="S">Parede Inferior (Frente)</option>}
                      {doorOrientation !== 'N' && <option value="N">Parede Superior (Fundos)</option>}
                      {doorOrientation !== 'W' && <option value="W">Parede Esquerda</option>}
                      {doorOrientation !== 'E' && <option value="E">Parede Direita</option>}
                    </select>
                  </div>
                  <div className="cif-field">
                    <label>Largura da 2ª Porta (m)</label>
                    <input
                      type="number"
                      min="0.8"
                      max={maxDoor2Width.toFixed(1)}
                      step="0.1"
                      placeholder="Ex: 2.0"
                      value={door2Width}
                      onChange={e => {
                        const val = parseFloat(e.target.value)
                        if (val > maxDoor2Width) {
                          setDoor2Width(maxDoor2Width.toFixed(1))
                        } else {
                          setDoor2Width(e.target.value)
                        }
                      }}
                    />
                    </div>
                  </div>

                  {/* SVG Interactive Preview for Door 2 */}
                  {(() => {
                    const wM = parseFloat(form.width) || 10
                    const hM = parseFloat(form.height) || 12
                    const dW2 = parseFloat(door2Width) || 2
                    const dOff2 = parseFloat(door2Offset) || 0
                    const isH2 = door2Orientation === 'N' || door2Orientation === 'S'
                    const wLen2 = isH2 ? wM : hM
                    const maxOff2 = Math.max(0, wLen2 - dW2)
                    const maxPW2 = 260; const maxPH2 = 160
                    const ar2 = wM / hM
                    let pW2 = maxPW2; let pH2 = maxPW2 / ar2
                    if (pH2 > maxPH2) { pH2 = maxPH2; pW2 = maxPH2 * ar2 }
                    const sX2 = pW2 / wM; const sY2 = pH2 / hM
                    const dPxW2 = dW2 * (isH2 ? sX2 : sY2)
                    const dPxOff2 = dOff2 * (isH2 ? sX2 : sY2)
                    const dt2 = 7
                    let dX2 = 0, dY2 = 0, dW2px = 0, dH2px = 0
                    let aX2 = 0, aY2 = 0, aPoints2 = '', aLX2 = 0, aLY2 = 0
                    let wsX2 = 0, wsY2 = 0, wsW2 = 0, wsH2 = 0
                    if (door2Orientation === 'N') {
                      dX2 = dPxOff2; dY2 = 0; dW2px = dPxW2; dH2px = dt2
                      aX2 = dX2 + dW2px/2; aY2 = dY2 + 22
                      aPoints2 = `${aX2-5},17 ${aX2},22 ${aX2+5},17`
                      aLX2 = aX2; aLY2 = aY2 - 12
                      wsX2 = 0; wsY2 = 0; wsW2 = pW2; wsH2 = 20
                    } else if (door2Orientation === 'S') {
                      dX2 = dPxOff2; dY2 = pH2 - dt2; dW2px = dPxW2; dH2px = dt2
                      aX2 = dX2 + dW2px/2; aY2 = dY2 - 22
                      aPoints2 = `${aX2-5},${pH2-17} ${aX2},${pH2-22} ${aX2+5},${pH2-17}`
                      aLX2 = aX2; aLY2 = aY2 + 12
                      wsX2 = 0; wsY2 = pH2 - 20; wsW2 = pW2; wsH2 = 20
                    } else if (door2Orientation === 'W') {
                      dX2 = 0; dY2 = dPxOff2; dW2px = dt2; dH2px = dPxW2
                      aX2 = dX2 + 22; aY2 = dY2 + dH2px/2
                      aPoints2 = `17,${aY2-5} 22,${aY2} 17,${aY2+5}`
                      aLX2 = aX2 - 12; aLY2 = aY2
                      wsX2 = 0; wsY2 = 0; wsW2 = 20; wsH2 = pH2
                    } else {
                      dX2 = pW2 - dt2; dY2 = dPxOff2; dW2px = dt2; dH2px = dPxW2
                      aX2 = dX2 - 22; aY2 = dY2 + dH2px/2
                      aPoints2 = `${pW2-17},${aY2-5} ${pW2-22},${aY2} ${pW2-17},${aY2+5}`
                      aLX2 = aX2 + 12; aLY2 = aY2
                      wsX2 = pW2 - 20; wsY2 = 0; wsW2 = 20; wsH2 = pH2
                    }
                    const cmpOff2 = (cx: number, cy: number, svg: SVGSVGElement) => {
                      const r = svg.getBoundingClientRect()
                      const v = isH2 ? (cx - r.left - dPxW2/2) / sX2 : (cy - r.top - dPxW2/2) / sY2
                      return Math.max(0, Math.min(maxOff2, v))
                    }
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '10px 0 4px' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'rgba(11,61,46,0.55)', marginBottom: 6, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                          Clique ou arraste para posicionar a 2ª porta
                        </span>
                        <svg
                          width={pW2} height={pH2}
                          style={{ background: '#f0fdf4', border: '2px solid #93c5fd', borderRadius: 8, cursor: isH2 ? 'ew-resize' : 'ns-resize', touchAction: 'none', userSelect: 'none' }}
                          onMouseDown={e => { isDraggingDoor2Ref.current = true; setDoor2Offset(cmpOff2(e.clientX, e.clientY, e.currentTarget).toFixed(1)) }}
                          onMouseMove={e => { if (!isDraggingDoor2Ref.current) return; setDoor2Offset(cmpOff2(e.clientX, e.clientY, e.currentTarget).toFixed(1)) }}
                          onMouseUp={() => { isDraggingDoor2Ref.current = false }}
                          onMouseLeave={() => { isDraggingDoor2Ref.current = false }}
                          onTouchStart={e => { e.preventDefault(); isDraggingDoor2Ref.current = true; const t = e.touches[0]; setDoor2Offset(cmpOff2(t.clientX, t.clientY, e.currentTarget).toFixed(1)) }}
                          onTouchMove={e => { e.preventDefault(); if (!isDraggingDoor2Ref.current) return; const t = e.touches[0]; setDoor2Offset(cmpOff2(t.clientX, t.clientY, e.currentTarget).toFixed(1)) }}
                          onTouchEnd={() => { isDraggingDoor2Ref.current = false }}
                        >
                          <defs><pattern id="pg2" width={12} height={12} patternUnits="userSpaceOnUse"><path d="M 12 0 L 0 0 0 12" fill="none" stroke="#dbeafe" strokeWidth="1" /></pattern></defs>
                          <rect width={pW2} height={pH2} fill="url(#pg2)" rx={6} />
                          <rect x={wsX2} y={wsY2} width={wsW2} height={wsH2} fill="rgba(59,130,246,0.10)" stroke="rgba(59,130,246,0.30)" strokeWidth={1} rx={3} />
                          <rect x={dX2} y={dY2} width={dW2px} height={dH2px} fill="#3b82f6" stroke="#1d4ed8" strokeWidth={1.5} rx={2} style={{ pointerEvents: 'none' }} />
                          <polyline points={aPoints2} fill="none" stroke="#1d4ed8" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
                          <line x1={aLX2} y1={aLY2} x2={aX2} y2={aY2} stroke="#1d4ed8" strokeWidth={2.5} strokeLinecap="round" style={{ pointerEvents: 'none' }} />
                        </svg>
                        <div style={{ marginTop: 6, fontSize: '0.75rem', fontWeight: 700, color: 'rgba(11,61,46,0.7)', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 6, padding: '2px 10px' }}>
                            Posição: {parseFloat(door2Offset).toFixed(1)} m do canto
                          </span>
                          <span style={{ color: 'rgba(11,61,46,0.35)', fontSize: '0.68rem' }}>máx. {maxOff2.toFixed(1)} m</span>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Corner badge */}
                  {(() => {
                    const perp =
                      ((doorOrientation === 'S' || doorOrientation === 'N') && (door2Orientation === 'E' || door2Orientation === 'W')) ||
                      ((doorOrientation === 'E' || doorOrientation === 'W') && (door2Orientation === 'S' || door2Orientation === 'N'))
                    return perp ? (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '6px 12px', fontSize: '0.75rem', fontWeight: 700, color: 'rgba(11,61,46,0.75)' }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 3h18v18H3z" /><path d="M3 12h18M12 3v18" /></svg>
                        Modo Esquina ativado — fachada em L no visualizador 3D
                      </div>
                    ) : (
                      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(250,204,21,0.1)', border: '1px solid rgba(250,204,21,0.4)', borderRadius: 8, padding: '6px 12px', fontSize: '0.73rem', color: 'rgba(120,90,0,0.8)' }}>
                        ⚠ Para fachada de esquina, escolha paredes perpendiculares (ex: Frente + Direita)
                      </div>
                    )
                  })()}
                </div>
              )}

              <div className="cif-actions">
                <button className="cif-btn-secondary" onClick={() => setStep(2)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
                  Voltar
                </button>
                <button
                  className="cif-btn-primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  style={{ background: '#10b981', borderColor: '#10b981' }}
                >
                  {isSubmitting ? (
                    <>
                      <span className="cif-spinner" />
                      Gerando projeto...
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
                        <path d="M12 6v12M6 12h12" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Gerar Projeto
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
