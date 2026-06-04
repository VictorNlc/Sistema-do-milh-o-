import { jsPDF } from 'jspdf'
import { getLayoutStats } from './storage'
import type { SavedLayout } from '../types'

type RgbTuple = [number, number, number]

export function exportLayoutToPDF(layout: SavedLayout, stageRef: React.RefObject<{ toDataURL: (opts: Record<string, unknown>) => string } | null>): boolean {
  try {
    const { storeWidth, storeHeight, storeType, items, layoutName } = layout
    const stats = getLayoutStats(layout)
    if (!stats) return false

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    // Dimensions
    const pdfW = 210
    const pdfH = 297
    const margin = 15
    const contentW = pdfW - margin * 2

    // Colors
    const primaryColor: RgbTuple = [0, 132, 61]
    const secondaryColor: RgbTuple = [26, 46, 30]
    const grayText: RgbTuple = [84, 114, 96]
    const lightBg: RgbTuple = [240, 251, 244]
    const borderGray: RgbTuple = [217, 230, 221]

    // ─── PAGE 1: COVER & OVERVIEW ───

    // Header Banner
    doc.setFillColor(...primaryColor)
    doc.rect(0, 0, pdfW, 42, 'F')

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(22)
    doc.setTextColor(255, 255, 255)
    doc.text('ProjeLayout', margin, 20)

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(217, 245, 229)
    doc.text('RELATÓRIO DE PLANEJAMENTO · PROJEFARMA', margin, 27)

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(new Date().toLocaleDateString('pt-BR'), pdfW - margin - 25, 25)

    let y = 55
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(16)
    doc.setTextColor(...secondaryColor)
    doc.text(layoutName || 'Layout de Farmácia', margin, y)

    y += 8
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...grayText)
    doc.text('Confira abaixo os detalhes e estatísticas do planejamento da sua loja.', margin, y)

    // Meta Grid Table
    y += 10
    doc.setFillColor(...lightBg)
    doc.roundedRect(margin, y, contentW, 25, 2, 2, 'F')
    doc.setDrawColor(...borderGray)
    doc.roundedRect(margin, y, contentW, 25, 2, 2, 'D')

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...secondaryColor)
    doc.text('Dimensões reais:', margin + 6, y + 8)
    doc.text('Área total:', margin + 6, y + 17)
    doc.text('Modelo de negócio:', margin + contentW / 2 + 6, y + 8)
    doc.text('Quantidade de móveis:', margin + contentW / 2 + 6, y + 17)

    doc.setFont('Helvetica', 'normal')
    doc.setTextColor(...primaryColor)
    doc.text(`${storeWidth}m x ${storeHeight}m`, margin + 35, y + 8)
    doc.text(`${stats.totalArea} m²`, margin + 35, y + 17)

    const typeLabels: Record<string, string> = {
      popular: 'Popular',
      premium: 'Premium',
      manipulacao: 'Manipulação',
      completa: 'Completa',
    }
    doc.text(typeLabels[storeType] ?? storeType, margin + contentW / 2 + 45, y + 8)
    doc.text(`${stats.itemCount} unidades`, margin + contentW / 2 + 45, y + 17)

    // Layout Preview
    y += 35
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...secondaryColor)
    doc.text('Planta Baixa (Layout Visual)', margin, y)

    y += 6
    const previewH = 95
    doc.setFillColor(232, 242, 236)
    doc.roundedRect(margin, y, contentW, previewH, 3, 3, 'F')
    doc.setDrawColor(...borderGray)
    doc.roundedRect(margin, y, contentW, previewH, 3, 3, 'D')

    if (stageRef?.current) {
      try {
        const uri = stageRef.current.toDataURL({ pixelRatio: 2 })
        doc.addImage(uri, 'PNG', margin + 5, y + 5, contentW - 10, previewH - 10)
      } catch (err) {
        console.error('Error adding layout image to PDF:', err)
        doc.setFont('Helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(...grayText)
        doc.text('[Imagem do Layout]', margin + contentW / 2 - 15, y + previewH / 2)
      }
    }

    // Stats Bar
    y += previewH + 12
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...secondaryColor)
    doc.text('Aproveitamento de Espaço', margin, y)

    y += 6
    doc.setFillColor(...lightBg)
    doc.roundedRect(margin, y, contentW, 20, 2, 2, 'F')
    doc.setDrawColor(...borderGray)
    doc.roundedRect(margin, y, contentW, 20, 2, 2, 'D')

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...secondaryColor)
    doc.text('Taxa de Ocupação:', margin + 6, y + 12)
    doc.text('Espaço de Corredores:', margin + contentW / 2 + 6, y + 12)

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...primaryColor)
    doc.text(`${stats.occupancyRate}%`, margin + 38, y + 12)
    doc.text(`${stats.corridorArea} m² (${100 - Number(stats.occupancyRate)}%)`, margin + contentW / 2 + 45, y + 12)

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...grayText)
    doc.text('Gerado pelo ProjeLayout — Projefarma. Todos os direitos reservados.', margin, pdfH - margin)
    doc.text('Página 1 de 2', pdfW - margin - 15, pdfH - margin)

    // ─── PAGE 2: INVENTORY & NEXT STEPS ───
    doc.addPage()

    doc.setFillColor(...primaryColor)
    doc.rect(0, 0, pdfW, 15, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('ProjeLayout by Projefarma', margin, 10)

    y = 28
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...secondaryColor)
    doc.text('Lista Detalhada de Itens', margin, y)

    y += 8
    doc.setFillColor(...lightBg)
    doc.rect(margin, y, contentW, 8, 'F')
    doc.setDrawColor(...borderGray)
    doc.rect(margin, y, contentW, 8, 'D')

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...secondaryColor)
    doc.text('Item', margin + 4, y + 5.5)
    doc.text('Dimensões', margin + 80, y + 5.5)
    doc.text('Área Unit.', margin + 115, y + 5.5)
    doc.text('Área Total', margin + 145, y + 5.5)

    const furniture = items.filter(i => !i.isPillar && !i.isObstacle)

    interface ItemGroup {
      name: string
      icon: string
      width: number
      height: number
      qty: number
    }
    const itemGroups: Record<string, ItemGroup> = {}
    furniture.forEach(item => {
      const key = `${item.name}-${item.width}x${item.height}`
      if (!itemGroups[key]) {
        itemGroups[key] = {
          name: item.name,
          icon: item.icon,
          width: item.width,
          height: item.height,
          qty: 0,
        }
      }
      itemGroups[key].qty++
    })

    const groupList = Object.values(itemGroups)

    y += 8
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...secondaryColor)

    if (groupList.length === 0) {
      doc.text('Nenhum item adicionado ao layout.', margin + 4, y + 8)
      y += 12
    } else {
      groupList.forEach(group => {
        doc.setDrawColor(...borderGray)
        doc.line(margin, y, margin + contentW, y)
        doc.setFont('Helvetica', 'bold')
        doc.text(`${group.icon || ''} ${group.name}`, margin + 4, y + 6)
        doc.setFont('Helvetica', 'normal')
        doc.text(`x${group.qty}`, margin + 65, y + 6)
        doc.text(`${group.width.toFixed(2)}m x ${group.height.toFixed(2)}m`, margin + 80, y + 6)
        doc.text(`${(group.width * group.height).toFixed(2)} m²`, margin + 115, y + 6)
        doc.text(`${(group.width * group.height * group.qty).toFixed(2)} m²`, margin + 145, y + 6)
        y += 9
      })
      doc.line(margin, y, margin + contentW, y)
    }

    y += 15
    doc.setFillColor(...lightBg)
    doc.roundedRect(margin, y, contentW, 40, 2, 2, 'F')
    doc.setDrawColor(...primaryColor)
    doc.roundedRect(margin, y, contentW, 40, 2, 2, 'D')

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...primaryColor)
    doc.text('Próximos Passos: Agende sua Consultoria Gratuita!', margin + 6, y + 10)

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(...secondaryColor)
    doc.text('Este relatório é um excelente ponto de partida. Apresente este layout para um de', margin + 6, y + 18)
    doc.text('nossos consultores técnicos da Projefarma para refinar as distâncias de acessibilidade,', margin + 6, y + 23)
    doc.text('garantir aprovação da ANVISA e criar um orçamento sob medida para o seu negócio.', margin + 6, y + 28)

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...grayText)
    doc.text('Gerado pelo ProjeLayout — Projefarma. Todos os direitos reservados.', margin, pdfH - margin)
    doc.text('Página 2 de 2', pdfW - margin - 15, pdfH - margin)

    doc.save(`projelayout-${(layoutName ?? 'layout').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`)
    return true
  } catch (err) {
    console.error('Error generating PDF:', err)
    return false
  }
}
