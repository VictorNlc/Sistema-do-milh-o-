// =====================================================
// excelExport.ts — Exportação de orçamento para CSV e XLSX
// Não altera posições nem dados de layout
// =====================================================

import type { CanvasItem } from '../types'

interface BudgetRow {
  codigo: string
  nome: string
  categoria: string
  largura: string
  profundidade: string
  altura3d: string
  quantidade: number
  precoUnitario: string
  subtotal: string
}

const CATEGORY_LABELS: Record<string, string> = {
  GONDOLAS: 'Gôndolas e Prateleiras',
  BALCOES: 'Balcões e Caixas',
  REFRIGERACAO: 'Refrigeração',
  PERFUMARIA: 'Perfumaria e Cosméticos',
  SERVICOS: 'Serviços e Consultórios',
  OPERACIONAL: 'Operacional',
  ESTRUTURA: 'Estrutura e Obstáculos',
  ACESSIBILIDADE: 'Acessibilidade',
}

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatNum(value: number): string {
  return value.toFixed(2).replace('.', ',')
}

/** Agrupa itens por código/nome e calcula quantidade e subtotal */
function buildBudgetRows(items: CanvasItem[]): BudgetRow[] {
  const priced = items.filter(i => (i.price ?? 0) > 0 && !i.isPillar && !i.isDoor)

  // group by itemId or name
  const grouped = new Map<string, { item: CanvasItem; count: number }>()
  for (const item of priced) {
    const key = item.itemId || item.name || item.id
    if (grouped.has(key)) {
      grouped.get(key)!.count++
    } else {
      grouped.set(key, { item, count: 1 })
    }
  }

  return Array.from(grouped.values()).map(({ item, count }) => {
    const unitPrice = item.price ?? 0
    return {
      codigo: (item as any).code || item.itemId?.replace('catalog-', '') || '-',
      nome: item.name?.replace(/\[Premium\]\s*/i, '').replace(/\[Especial\]\s*/i, '').trim() || '-',
      categoria: CATEGORY_LABELS[item.category as string] || item.category || '-',
      largura: formatNum(item.width),
      profundidade: formatNum(item.height),
      altura3d: formatNum((item as any).height3d ?? 0),
      quantidade: count,
      precoUnitario: formatBRL(unitPrice),
      subtotal: formatBRL(unitPrice * count),
    }
  })
}

// ─── CSV Export ────────────────────────────────────────────────────────────────

export function exportToCSV(
  items: CanvasItem[],
  layoutName = 'Layout',
): void {
  const rows = buildBudgetRows(items)
  const headers = [
    'Código', 'Nome', 'Categoria', 'Largura (m)', 'Profundidade (m)', 'Altura (m)',
    'Quantidade', 'Preço Unitário', 'Subtotal',
  ]

  const totalGeral = items.reduce((s, i) => s + (i.price ?? 0), 0)

  const lines = [
    headers.join(';'),
    ...rows.map(r =>
      [
        r.codigo, r.nome, r.categoria, r.largura, r.profundidade, r.altura3d,
        r.quantidade, r.precoUnitario, r.subtotal,
      ].join(';')
    ),
    '',
    `Total Geral;;;;;;;; ${formatBRL(totalGeral)}`,
  ]

  const csv = '\uFEFF' + lines.join('\n') // BOM para Excel PT-BR
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `projefarma-orcamento-${layoutName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── XLSX Export ───────────────────────────────────────────────────────────────

export async function exportToXLSX(
  items: CanvasItem[],
  layoutName = 'Layout',
  storeWidth = 0,
  storeHeight = 0,
): Promise<void> {
  const XLSX = await import('xlsx')
  const rows = buildBudgetRows(items)
  const totalGeral = items.reduce((s, i) => s + (i.price ?? 0), 0)

  // ─ Capa de resumo ─
  const summaryData = [
    ['PROJEFARMA — ORÇAMENTO DE LAYOUT'],
    [],
    ['Projeto:', layoutName],
    ['Dimensões:', `${storeWidth}m × ${storeHeight}m`],
    ['Data:', new Date().toLocaleDateString('pt-BR')],
    ['Total de Itens:', items.filter(i => !i.isPillar && !i.isDoor).length],
    ['Total Geral:', formatBRL(totalGeral)],
  ]

  // ─ Tabela de orçamento ─
  const headerRow = [
    'Código', 'Nome', 'Categoria', 'Largura (m)', 'Profundidade (m)', 'Altura (m)',
    'Qtd', 'Preço Unit.', 'Subtotal',
  ]
  const dataRows = rows.map(r => [
    r.codigo, r.nome, r.categoria, r.largura, r.profundidade, r.altura3d,
    r.quantidade, r.precoUnitario, r.subtotal,
  ])
  const totalRow = ['', '', '', '', '', '', '', 'TOTAL GERAL:', formatBRL(totalGeral)]

  const sheetData = [headerRow, ...dataRows, [], totalRow]

  const wb = XLSX.utils.book_new()

  // Aba Resumo
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary['!cols'] = [{ wch: 20 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo')

  // Aba Orçamento
  const wsOrcamento = XLSX.utils.aoa_to_sheet(sheetData)
  wsOrcamento['!cols'] = [
    { wch: 8 }, { wch: 30 }, { wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
    { wch: 6 }, { wch: 16 }, { wch: 16 },
  ]
  XLSX.utils.book_append_sheet(wb, wsOrcamento, 'Orçamento Detalhado')

  XLSX.writeFile(wb, `projefarma-orcamento-${layoutName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.xlsx`)
}
