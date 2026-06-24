// ============================================
// SketchUp Vision — Analisa prints de cima de layouts do SketchUp
// Suporta: análise via chat (JSON estático) + upload pelo Admin (localStorage)
// ============================================

import { v4 as uuidv4 } from 'uuid'
import type { DetectedItem, VisionAnalysisResult, StoreType, CanvasItem, ReferenceLayout } from '../types'
import staticReferenceLayouts from '../data/referenceLayouts.json'

import { supabase, isSupabaseConfigured } from './supabase'

const REFERENCE_LAYOUTS_KEY = 'projefarma_reference_layouts'

export function isApiKeyConfigured(): boolean {
  return true
}

// ─── Catálogo de itens para contexto da IA ─────────────────────────────────

const CATALOG_CONTEXT = `
CATÁLOGO DE MÓVEIS DE FARMÁCIA (mapeie os objetos detectados para um destes IDs):

GÔNDOLAS CENTRAIS (profundidade 0.43m):
- catalog-31-premium / catalog-31-especial: Gôndola 1.70m
- catalog-32-premium / catalog-32-especial: Gôndola 2.20m
- catalog-33-premium / catalog-33-especial: Gôndola 3.00m

PRATELEIRAS DE MEDICAMENTOS - parede (profundidade 0.21m):
- catalog-21-premium / catalog-21-especial: Prateleira Medicamentos 0.807m
- catalog-22-premium / catalog-22-especial: Prateleira Medicamentos 0.50m
- catalog-23-premium / catalog-23-especial: Prateleira Medicamentos 1.00m

PERFUMARIA / COSMÉTICOS - parede (profundidade 0.26m):
- catalog-11-premium / catalog-11-especial: Expositor Perfumaria 0.807m
- catalog-91-premium / catalog-91-especial: Dermocosméticos 0.50m
- catalog-92-premium / catalog-92-especial: Dermocosméticos 0.807m

MEDICAMENTOS MIP - parede (profundidade 0.26m):
- catalog-41-premium / catalog-41-especial: MIP 0.807m
- catalog-42-premium / catalog-42-especial: MIP 0.50m

BALCÕES DE ATENDIMENTO (profundidade 0.40m):
- catalog-51-premium / catalog-51-especial: Balcão Atendimento 1.00m
- catalog-52-premium / catalog-52-especial: Balcão Atendimento 0.80m
- catalog-55-premium / catalog-55-especial: Balcão MDF 1.00m

CAIXAS / PDV (profundidade 0.40m):
- catalog-61-premium / catalog-61-especial: Caixa 0.60m
- catalog-63-premium / catalog-63-especial: Caixa 1.00m

LATERAL CAIXA (profundidade 0.26m):
- catalog-81-premium / catalog-81-especial: Lateral Caixa 0.40m
- catalog-82-premium / catalog-82-especial: Lateral Caixa 0.55m

CHECKOUT EM L:
- catalog-131-premium / catalog-131-especial: Checkout em L 1.20m x 1.20m

CESTÃO PROMOCIONAL:
- catalog-71-premium / catalog-71-especial: Cestão 0.40m x 0.40m

PORTAS:
- porta-entrada: Porta de Entrada
- porta-saida-emergencia: Saída de Emergência

PILARES:
- pilar: Pilar estrutural (isObstacle: true, isPillar: true)
`.trim()

// ─── Prompt de análise de imagem ───────────────────────────────────────────

function buildVisionPrompt(storeWidth: number, storeHeight: number, storeType: StoreType): string {
  const lineSuffix = storeType === 'premium' ? '-premium' : '-especial'
  return `Você é um especialista em análise de plantas baixas de farmácias.
  
Analise esta imagem de cima (planta baixa) de um layout de farmácia e identifique todos os móveis presentes.

DIMENSÕES REAIS DA LOJA: ${storeWidth}m × ${storeHeight}m
TIPO DE FARMÁCIA: ${storeType}
SUFIXO A USAR NOS IDs: ${lineSuffix}

${CATALOG_CONTEXT}

INSTRUÇÕES:
1. Identifique cada móvel visível na imagem
2. Estime sua posição X,Y em metros (0,0 = canto superior esquerdo)
3. Estime dimensões reais em metros baseando-se nas proporções da imagem vs dimensões da loja
4. Determine a rotação (0=horizontal, 90=vertical rotacionado)
5. Mapeie para o catalogId mais adequado usando o sufixo ${lineSuffix}
6. Para cada item, atribua uma confiança de 0 a 1

REGRAS IMPORTANTES:
- Gondolas centrais tipicamente têm profundidade de 0.43m
- Prateleiras de parede têm profundidade de 0.21m-0.26m  
- Balcões têm profundidade de 0.40m
- Não invente itens que não existem na imagem
- Se não tiver certeza do tipo, use o mais próximo e reduza a confiança

Responda APENAS com um JSON array válido. Sem markdown, sem explicações.
Formato: [{"detectedName":"nome visto","catalogId":"catalog-XX${lineSuffix}","x":0.0,"y":0.0,"width":0.0,"height":0.0,"rotation":0,"confidence":0.9}]

Se a imagem não contiver um layout de farmácia, retorne: []`
}

// ─── Análise da imagem via GPT-4o Vision ───────────────────────────────────

export async function analyzeSketchupImage(
  imageBase64: string,
  storeWidth: number,
  storeHeight: number,
  storeType: StoreType,
): Promise<VisionAnalysisResult> {

  // Garantir que está no formato correto para a API
  const imageUrl = imageBase64.startsWith('data:image')
    ? imageBase64
    : `data:image/png;base64,${imageBase64}`

  const prompt = buildVisionPrompt(storeWidth, storeHeight, storeType)

  try {
    if (!supabase) throw new Error("Supabase não está configurado.")
    const { data: responseData, error: edgeError } = await supabase.functions.invoke('openai-proxy', {
      body: {
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      },
    })

    if (edgeError) {
      throw edgeError
    }

    const data = responseData as {
      choices?: { message?: { content?: string } }[]
    }
    const content = data?.choices?.[0]?.message?.content?.trim()

    if (!content) {
      return { success: false, items: [], storeWidth, storeHeight, error: 'Resposta vazia da API.' }
    }

    // Extrair JSON da resposta
    let jsonStr = content
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonStr = jsonMatch[0]
    }

    const parsed = JSON.parse(jsonStr) as DetectedItem[]

    if (!Array.isArray(parsed)) {
      return { success: false, items: [], storeWidth, storeHeight, error: 'Resposta da IA não é um array válido.' }
    }

    // Validar e limpar itens detectados
    const validItems = parsed.filter(item =>
      item.catalogId &&
      typeof item.x === 'number' &&
      typeof item.y === 'number' &&
      typeof item.width === 'number' &&
      typeof item.height === 'number' &&
      item.x >= -0.5 && item.x <= storeWidth + 0.5 &&
      item.y >= -0.5 && item.y <= storeHeight + 0.5 &&
      item.width > 0 &&
      item.height > 0
    ).map(item => ({
      ...item,
      x: Math.round(item.x * 100) / 100,
      y: Math.round(item.y * 100) / 100,
      width: Math.round(item.width * 100) / 100,
      height: Math.round(item.height * 100) / 100,
      rotation: item.rotation ?? 0,
      confidence: item.confidence ?? 0.8,
    }))

    return {
      success: true,
      items: validItems,
      storeWidth,
      storeHeight,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido'

    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return { success: false, items: [], storeWidth, storeHeight, error: '🌐 Erro de conexão. Verifique sua internet.' }
    }
    if (errorMessage.includes('JSON')) {
      return { success: false, items: [], storeWidth, storeHeight, error: '⚠️ A IA retornou um formato inválido. Tente novamente.' }
    }

    return { success: false, items: [], storeWidth, storeHeight, error: `Erro: ${errorMessage}` }
  }
}

// ─── Converter DetectedItem[] → CanvasItem[] ───────────────────────────────

export function detectedItemsToCanvasItems(
  items: DetectedItem[],
  storeType: StoreType,
): CanvasItem[] {
  return items.map(item => ({
    id: uuidv4(),
    itemId: item.catalogId,
    name: item.detectedName,
    icon: getIconForCatalogId(item.catalogId),
    category: getCategoryForCatalogId(item.catalogId),
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    fillColor: getFillColorForCatalogId(item.catalogId),
    strokeColor: getStrokeColorForCatalogId(item.catalogId),
    rotation: item.rotation,
    label: item.detectedName,
    isObstacle: item.catalogId.includes('pilar'),
    isPillar: item.catalogId.includes('pilar'),
    isDoor: item.catalogId.includes('porta'),
    isEmergency: item.catalogId.includes('emergencia'),
    isWallItem: isWallItem(item.catalogId),
    createdAt: Date.now(),
  }))
}

// ─── Helpers visuais ───────────────────────────────────────────────────────

function getIconForCatalogId(catalogId: string): string {
  if (catalogId.includes('catalog-3')) return '📦'
  if (catalogId.includes('catalog-2')) return '💊'
  if (catalogId.includes('catalog-1') && !catalogId.includes('catalog-13')) return '🌸'
  if (catalogId.includes('catalog-4')) return '💊'
  if (catalogId.includes('catalog-5')) return '🏪'
  if (catalogId.includes('catalog-6')) return '💳'
  if (catalogId.includes('catalog-7')) return '🧺'
  if (catalogId.includes('catalog-8')) return '📥'
  if (catalogId.includes('catalog-13')) return '💳'
  if (catalogId.includes('catalog-9')) return '💄'
  if (catalogId.includes('porta')) return '🚪'
  if (catalogId.includes('pilar')) return '⬛'
  return '📦'
}

function getCategoryForCatalogId(catalogId: string): CanvasItem['category'] {
  if (catalogId.includes('catalog-3')) return 'GONDOLAS'
  if (catalogId.includes('catalog-2')) return 'GONDOLAS'
  if (catalogId.includes('catalog-1') && !catalogId.includes('catalog-13')) return 'PERFUMARIA'
  if (catalogId.includes('catalog-4')) return 'GONDOLAS'
  if (catalogId.includes('catalog-5')) return 'BALCOES'
  if (catalogId.includes('catalog-6')) return 'OPERACIONAL'
  if (catalogId.includes('catalog-7')) return 'OPERACIONAL'
  if (catalogId.includes('catalog-8')) return 'OPERACIONAL'
  if (catalogId.includes('catalog-13')) return 'OPERACIONAL'
  if (catalogId.includes('catalog-9')) return 'PERFUMARIA'
  if (catalogId.includes('porta')) return 'ESTRUTURA'
  if (catalogId.includes('pilar')) return 'ESTRUTURA'
  return 'GONDOLAS'
}

function getFillColorForCatalogId(catalogId: string): string {
  if (catalogId.includes('catalog-3') || catalogId.includes('catalog-2') || catalogId.includes('catalog-4')) return '#FDF8F0'
  if (catalogId.includes('catalog-1') || catalogId.includes('catalog-9')) return '#FFF1F7'
  if (catalogId.includes('catalog-5')) return '#DBEAFE'
  if (catalogId.includes('catalog-6')) return '#D1FAE5'
  if (catalogId.includes('catalog-7')) return '#FDF8F0'
  if (catalogId.includes('catalog-8')) return '#EFF6FF'
  if (catalogId.includes('catalog-13')) return '#DBEAFE'
  if (catalogId.includes('porta')) return '#FCD34D'
  if (catalogId.includes('pilar')) return '#9CA3AF'
  return '#FDF8F0'
}

function getStrokeColorForCatalogId(catalogId: string): string {
  if (catalogId.includes('catalog-3') || catalogId.includes('catalog-2') || catalogId.includes('catalog-4') || catalogId.includes('catalog-7')) return '#8B7355'
  if (catalogId.includes('catalog-1') || catalogId.includes('catalog-9')) return '#DB2777'
  if (catalogId.includes('catalog-5') || catalogId.includes('catalog-8') || catalogId.includes('catalog-13')) return '#1D4ED8'
  if (catalogId.includes('catalog-6')) return '#047857'
  if (catalogId.includes('porta')) return '#78350F'
  if (catalogId.includes('pilar')) return '#374151'
  return '#8B7355'
}

function isWallItem(catalogId: string): boolean {
  // Itens que ficam na parede
  if (catalogId.includes('catalog-2')) return true  // prateleiras medicamentos
  if (catalogId.includes('catalog-1') && !catalogId.includes('catalog-13')) return true  // perfumaria
  if (catalogId.includes('catalog-4')) return true  // MIP
  if (catalogId.includes('catalog-8')) return true  // lateral caixa
  return false
}

// ─── CRUD de Layouts de Referência (localStorage + arquivo estático) ────────

/**
 * Retorna todos os layouts de referência:
 * - Primeiro os do arquivo estático (src/data/referenceLayouts.json) — analisados via chat
 * - Depois os do localStorage — importados via Admin
 */
export function getReferenceLayouts(): ReferenceLayout[] {
  // Layouts estáticos (analisados pelo assistente no chat)
  const staticLayouts = (staticReferenceLayouts as ReferenceLayout[])

  // Layouts salvos via Admin (localStorage)
  let localLayouts: ReferenceLayout[] = []
  try {
    const raw = localStorage.getItem(REFERENCE_LAYOUTS_KEY)
    localLayouts = raw ? (JSON.parse(raw) as ReferenceLayout[]) : []
  } catch {
    localLayouts = []
  }

  // Merge: estáticos primeiro, locais depois (sem duplicatas por id)
  const ids = new Set(staticLayouts.map(l => l.id))
  const merged = [...staticLayouts, ...localLayouts.filter(l => !ids.has(l.id))]
  return merged
}

export function syncReferenceLayoutToSupabase(layout: ReferenceLayout): void {
  if (!supabase || !isSupabaseConfigured) return

  const dbData = {
    id: layout.id,
    name: layout.name,
    storeType: layout.storeType,
    storeWidth: layout.storeWidth,
    storeHeight: layout.storeHeight,
    items: layout.items,
    sourceImageBase64: layout.sourceImageBase64 || null,
    notes: layout.notes || null,
    approved: layout.approved,
    createdAt: layout.createdAt,
    updatedAt: layout.updatedAt,
  }

  Promise.resolve(
    supabase.from('reference_layouts')
      .upsert(dbData)
  )
    .then(({ error }) => {
      if (error) {
        console.warn('⚠️ Erro ao sincronizar layout de referência com o Supabase:', error.message)
      } else {
        console.log('✅ Layout de referência sincronizado com o Supabase:', layout.id)
      }
    })
    .catch(err => {
      console.warn('⚠️ Falha de rede ao sincronizar layout de referência:', err)
    })
}

export function deleteReferenceLayoutFromSupabase(id: string): void {
  if (!supabase || !isSupabaseConfigured) return

  Promise.resolve(
    supabase.from('reference_layouts')
      .delete()
      .eq('id', id)
  )
    .then(({ error }) => {
      if (error) {
        console.warn('⚠️ Erro ao deletar layout de referência no Supabase:', error.message)
      } else {
        console.log('✅ Layout de referência deletado no Supabase:', id)
      }
    })
    .catch(err => {
      console.warn('⚠️ Falha de rede ao deletar layout de referência no Supabase:', err)
    })
}

export function saveReferenceLayout(layout: Omit<ReferenceLayout, 'id' | 'createdAt' | 'updatedAt'>): ReferenceLayout {
  const layouts = getReferenceLayouts()
  const now = new Date().toISOString()
  const newLayout: ReferenceLayout = {
    ...layout,
    id: uuidv4(),
    createdAt: now,
    updatedAt: now,
  }
  layouts.push(newLayout)
  localStorage.setItem(REFERENCE_LAYOUTS_KEY, JSON.stringify(layouts))
  syncReferenceLayoutToSupabase(newLayout)
  return newLayout
}

export function updateReferenceLayout(id: string, updates: Partial<ReferenceLayout>): ReferenceLayout | null {
  const layouts = getReferenceLayouts()
  const index = layouts.findIndex(l => l.id === id)
  if (index === -1) return null
  const updated = { ...layouts[index], ...updates, updatedAt: new Date().toISOString() }
  layouts[index] = updated
  localStorage.setItem(REFERENCE_LAYOUTS_KEY, JSON.stringify(layouts))
  syncReferenceLayoutToSupabase(updated)
  return updated
}

export function deleteReferenceLayout(id: string): void {
  const layouts = getReferenceLayouts().filter(l => l.id !== id)
  localStorage.setItem(REFERENCE_LAYOUTS_KEY, JSON.stringify(layouts))
  deleteReferenceLayoutFromSupabase(id)
}

/** Busca layouts de referência compatíveis para uso como template de IA */
export function findCompatibleReferenceLayouts(
  storeType: StoreType,
  storeWidth: number,
  storeHeight: number,
  tolerancePercent = 0.40,
): ReferenceLayout[] {
  const targetArea = storeWidth * storeHeight
  return getReferenceLayouts()
    .filter(layout => {
      if (!layout.approved) return false
      if (layout.storeType !== storeType) return false
      const layoutArea = layout.storeWidth * layout.storeHeight
      const areaDiff = Math.abs(layoutArea - targetArea) / targetArea
      return areaDiff <= tolerancePercent
    })
    .sort((a, b) => {
      // Ordenar pelo mais próximo em área
      const aArea = a.storeWidth * a.storeHeight
      const bArea = b.storeWidth * b.storeHeight
      return Math.abs(aArea - targetArea) - Math.abs(bArea - targetArea)
    })
    .slice(0, 3)
}
