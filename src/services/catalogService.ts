import { supabase, isSupabaseConfigured } from './supabase'
import { PHARMACY_ITEMS } from '../data/items'
import type { PharmacyItemTemplate } from '../types'

let cachedCatalog: PharmacyItemTemplate[] | null = null

export async function getPharmacyCatalog(): Promise<PharmacyItemTemplate[]> {
  if (cachedCatalog) {
    return cachedCatalog
  }

  if (!supabase || !isSupabaseConfigured) {
    cachedCatalog = PHARMACY_ITEMS
    return PHARMACY_ITEMS
  }

  try {
    const { data, error } = await supabase
      .from('catalog_items')
      .select('*')
      .order('id', { ascending: true })

    if (error) {
      throw error
    }

    if (data && data.length > 0) {
      const dbCatalog = data.map((item: any) => ({
        id: item.id,
        category: item.category,
        name: item.name,
        icon: item.icon || '',
        description: item.description || '',
        width: Number(item.width),
        height: Number(item.height),
        color: item.color || '',
        fillColor: item.fillColor || '',
        strokeColor: item.strokeColor || '',
        minWidth: item.minWidth !== null ? Number(item.minWidth) : Number(item.width),
        maxWidth: item.maxWidth !== null ? Number(item.maxWidth) : Number(item.width),
        minHeight: item.minHeight !== null ? Number(item.minHeight) : Number(item.height),
        maxHeight: item.maxHeight !== null ? Number(item.maxHeight) : Number(item.height),
        rotatable: item.rotatable ?? true,
        isObstacle: item.isObstacle ?? false,
        isPillar: item.isPillar ?? false,
        isDoor: item.isDoor ?? false,
        isRoom: item.isRoom ?? false,
        isRound: item.isRound ?? false,
        isEmergency: item.isEmergency ?? false,
        isWallItem: item.isWallItem ?? false,
        price: item.price !== null ? Number(item.price) : 0,
        finish: item.finish || '',
        code: item.code || '',
        height3d: item.height3d !== null ? Number(item.height3d) : 1.9,
      }))
      cachedCatalog = dbCatalog
      return dbCatalog
    }

    // Se o banco estiver vazio, fazemos o seed em segundo plano e retornamos os locais
    console.log('🌱 Catálogo do banco vazio. Iniciando seed automático com itens locais...')
    seedCatalog(PHARMACY_ITEMS)
    
    cachedCatalog = PHARMACY_ITEMS
    return PHARMACY_ITEMS
  } catch (err) {
    console.warn('⚠️ Falha ao carregar catálogo do banco, usando catálogo estático local:', err)
    cachedCatalog = PHARMACY_ITEMS
    return PHARMACY_ITEMS
  }
}

async function seedCatalog(items: PharmacyItemTemplate[]): Promise<void> {
  if (!supabase || !isSupabaseConfigured) return

  const formattedItems = items.map(item => ({
    id: item.id,
    category: item.category,
    name: item.name,
    icon: item.icon,
    description: item.description,
    width: item.width,
    height: item.height,
    color: item.color,
    fillColor: item.fillColor,
    strokeColor: item.strokeColor,
    minWidth: item.minWidth,
    maxWidth: item.maxWidth,
    minHeight: item.minHeight,
    maxHeight: item.maxHeight,
    rotatable: item.rotatable,
    isObstacle: item.isObstacle || false,
    isPillar: item.isPillar || false,
    isDoor: item.isDoor || false,
    isRoom: item.isRoom || false,
    isRound: item.isRound || false,
    isEmergency: item.isEmergency || false,
    isWallItem: item.isWallItem || false,
    price: item.price || 0,
    finish: item.finish || '',
    code: item.code || '',
    height3d: item.height3d || 1.9,
  }))

  // Upsert em lotes pequenos para evitar payload excedido (ex: lotes de 50)
  const batchSize = 50
  for (let i = 0; i < formattedItems.length; i += batchSize) {
    const batch = formattedItems.slice(i, i + batchSize)
    const { error } = await supabase.from('catalog_items').upsert(batch)
    if (error) {
      console.warn('❌ Erro no seed do lote de catálogo:', error.message)
      break
    }
  }
  console.log('✅ Seed do catálogo concluído no banco de dados.')
}
