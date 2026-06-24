import { jsPDF } from 'jspdf'
import { getLayoutStats } from './storage'
import type { SavedLayout, CanvasItem } from '../types'

type RgbTuple = [number, number, number]

export function exportLayoutToPDF(
  layout: { 
    storeWidth: number; 
    storeHeight: number; 
    storeType: string; 
    items: CanvasItem[]; 
    layoutName?: string;
    freightData?: { distanceKm: number; freightCost: number } | null 
  },
  layoutImageDataUrl?: string
): boolean {
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
    const previewH = 155
    doc.setFillColor(232, 242, 236)
    doc.roundedRect(margin, y, contentW, previewH, 3, 3, 'F')
    doc.setDrawColor(...borderGray)
    doc.roundedRect(margin, y, contentW, previewH, 3, 3, 'D')

    if (layoutImageDataUrl) {
      try {
        // Preserve the layout's real proportions (contain-fit, centered) so the
        // image is never stretched/distorted inside the preview frame.
        const boxX = margin + 5
        const boxY = y + 5
        const boxW = contentW - 10
        const boxH = previewH - 10

        let drawW = boxW
        let drawH = boxH
        try {
          const props = doc.getImageProperties(layoutImageDataUrl)
          if (props && props.width > 0 && props.height > 0) {
            const scale = Math.min(boxW / props.width, boxH / props.height)
            drawW = props.width * scale
            drawH = props.height * scale
          }
        } catch { /* fall back to box dimensions if properties can't be read */ }

        const drawX = boxX + (boxW - drawW) / 2
        const drawY = boxY + (boxH - drawH) / 2
        doc.addImage(layoutImageDataUrl, 'PNG', drawX, drawY, drawW, drawH)
      } catch (err) {
        console.error('Error adding layout image to PDF:', err)
        doc.setFont('Helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(...grayText)
        doc.text('[Imagem não disponível]', margin + contentW / 2 - 15, y + previewH / 2)
      }
    } else {
      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(...grayText)
      doc.text('[Sem imagem]', margin + contentW / 2 - 10, y + previewH / 2)
    }

    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...grayText)
    doc.text('Gerado pelo ProjeLayout — Projefarma. Todos os direitos reservados.', margin, pdfH - margin)
    doc.text('Página 1', pdfW - margin - 15, pdfH - margin)

    // ─── PAGE 2: INVENTORY & NEXT STEPS ───
    doc.addPage()

    doc.setFillColor(...primaryColor)
    doc.rect(0, 0, pdfW, 15, 'F')
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text('ProjeLayout by Projefarma', margin, 10)

    let pageCount = 2
    const checkPageBreak = (requiredSpace: number): boolean => {
      if (y + requiredSpace > pdfH - margin - 10) {
        doc.setFont('Helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...grayText)
        doc.text('Gerado pelo ProjeLayout — Projefarma. Todos os direitos reservados.', margin, pdfH - margin)
        doc.text(`Página ${pageCount}`, pdfW - margin - 15, pdfH - margin)

        doc.addPage()
        pageCount++
        
        doc.setFillColor(...primaryColor)
        doc.rect(0, 0, pdfW, 15, 'F')
        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(255, 255, 255)
        doc.text('ProjeLayout by Projefarma', margin, 10)
        
        y = 25
        return true
      }
      return false
    }

    y = 28

    // Read client details from sessionStorage
    let clientDetails: any = null
    try {
      const raw = sessionStorage.getItem('projefarma_client_details')
      if (raw) clientDetails = JSON.parse(raw)
    } catch (e) {
      console.warn('Erro ao ler projefarma_client_details:', e)
    }

    if (clientDetails) {
      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...secondaryColor)
      doc.text('Informações do Cliente & Farmácia', margin, y)

      // Dynamic layout helper functions
      const getFieldHeight = (value: string, width: number, lineHeight: number = 4, spacing: number = 5.5): number => {
        const lines = doc.splitTextToSize(value || 'Não informado', width)
        return 4.5 + (lines.length * lineHeight) - lineHeight + spacing
      }

      const drawDynamicField = (
        label: string,
        value: string,
        x: number,
        startY: number,
        width: number,
        lineHeight: number = 4,
        spacing: number = 5.5
      ): number => {
        let currentY = startY

        // Draw label (bold, smaller)
        doc.setFont('Helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(...secondaryColor)
        doc.text(label, x, currentY)
        currentY += 4

        // Draw value (normal, darker gray, wraps automatically)
        doc.setFont('Helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(50, 50, 50)

        const lines = doc.splitTextToSize(value || 'Não informado', width)
        lines.forEach((line: string) => {
          doc.text(line, x, currentY)
          currentY += lineHeight
        })

        return currentY - lineHeight + spacing
      }

      const colW = contentW / 2 - 8

      // Calculate left column height
      let leftH = 6 // top padding
      leftH += getFieldHeight(clientDetails.clientName, colW)
      
      const street = clientDetails.address || 'Não informado'
      const num = clientDetails.number ? `, ${clientDetails.number}` : ''
      leftH += getFieldHeight(`${street}${num}`, colW)
      
      if (clientDetails.complement) {
        leftH += getFieldHeight(clientDetails.complement, colW)
      }
      
      const city = clientDetails.city || ''
      const state = clientDetails.state || ''
      const pc = clientDetails.postalCode || ''
      const localidade = `${city} - ${state}${pc ? ` (CEP: ${pc})` : ''}`
      leftH += getFieldHeight(localidade, colW)

      leftH += getFieldHeight(clientDetails.phone || 'Não informado', colW)

      // Calculate right column height
      let rightH = 6 // top padding
      rightH += getFieldHeight(clientDetails.pharmacyName, colW)
      rightH += getFieldHeight(clientDetails.countryName || 'Não informado', colW)

      const cardHeight = Math.max(leftH, rightH) + 2.5

      y += 7
      doc.setFillColor(...lightBg)
      doc.roundedRect(margin, y, contentW, cardHeight, 2, 2, 'F')
      doc.setDrawColor(...borderGray)
      doc.roundedRect(margin, y, contentW, cardHeight, 2, 2, 'D')

      // Draw Left Column fields
      let leftY = y + 6
      leftY = drawDynamicField('Nome do Cliente:', clientDetails.clientName, margin + 6, leftY, colW)
      leftY = drawDynamicField('Endereço:', `${street}${num}`, margin + 6, leftY, colW)
      if (clientDetails.complement) {
        leftY = drawDynamicField('Complemento:', clientDetails.complement, margin + 6, leftY, colW)
      }
      leftY = drawDynamicField('Localidade:', localidade, margin + 6, leftY, colW)
      leftY = drawDynamicField('Telefone:', clientDetails.phone || 'Não informado', margin + 6, leftY, colW)

      // Draw Right Column fields
      let rightY = y + 6
      rightY = drawDynamicField('Farmácia:', clientDetails.pharmacyName, margin + contentW / 2 + 4, rightY, colW)
      rightY = drawDynamicField('País:', clientDetails.countryName || 'Não informado', margin + contentW / 2 + 4, rightY, colW)

      y += cardHeight + 10
    }

    // Aproveitamento de Espaço
    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...secondaryColor)
    doc.text('Aproveitamento de Espaço', margin, y)

    y += 5
    doc.setFillColor(...lightBg)
    doc.roundedRect(margin, y, contentW, 20, 2, 2, 'F')
    doc.setDrawColor(...borderGray)
    doc.roundedRect(margin, y, contentW, 20, 2, 2, 'D')

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...secondaryColor)
    doc.text('Taxa de Ocupação:', margin + 6, y + 12.5)
    doc.text('Espaço de Corredores:', margin + contentW / 2 + 6, y + 12.5)

    doc.setFont('Helvetica', 'bold')
    doc.setFontSize(11)
    doc.setTextColor(...primaryColor)
    doc.text(`${stats.occupancyRate}%`, margin + 36, y + 12.5)
    doc.text(`${stats.corridorArea} m² (${100 - Number(stats.occupancyRate)}%)`, margin + contentW / 2 + 45, y + 12.5)

    y += 30

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
    doc.text('Dimensões', margin + 74, y + 5.5)
    doc.text('Preço Unit.', margin + 106, y + 5.5)
    doc.text('Qtd.', margin + 138, y + 5.5)
    doc.text('Preço Total', margin + 152, y + 5.5)

    const furniture = items.filter(i => !i.isPillar && !i.isObstacle)

    interface ItemGroup {
      name: string
      icon: string
      width: number
      height: number
      price: number
      qty: number
    }
    const itemGroups: Record<string, ItemGroup> = {}
    furniture.forEach(item => {
      const key = `${item.name}-${item.width}x${item.height}-${item.price || 0}`
      if (!itemGroups[key]) {
        itemGroups[key] = {
          name: item.name,
          icon: item.icon,
          width: item.width,
          height: item.height,
          price: item.price || 0,
          qty: 0,
        }
      }
      itemGroups[key].qty++
    })

    const groupList = Object.values(itemGroups)

    y += 8
    doc.setFont('Helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...secondaryColor)

    if (groupList.length === 0) {
      doc.text('Nenhum item adicionado ao layout.', margin + 4, y + 8)
      y += 12
    } else {
      groupList.forEach(group => {
        checkPageBreak(12)

        doc.setDrawColor(...borderGray)
        doc.line(margin, y, margin + contentW, y)
        
        // Print icon + name (clip if too long)
        doc.setFont('Helvetica', 'bold')
        const displayName = `${group.icon || ''} ${group.name}`
        const clippedName = displayName.length > 34 ? displayName.substring(0, 32) + '..' : displayName
        doc.text(clippedName, margin + 4, y + 6)
        
        doc.setFont('Helvetica', 'normal')
        doc.text(`${group.width.toFixed(2)}m x ${group.height.toFixed(2)}m`, margin + 74, y + 6)
        
        const unitPriceStr = group.price > 0 
          ? `R$ ${group.price.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
          : 'R$ 0,00'
        doc.text(unitPriceStr, margin + 106, y + 6)
        
        doc.text(`x${group.qty}`, margin + 138, y + 6)
        
        const totalPriceStr = group.price > 0 
          ? `R$ ${(group.price * group.qty).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
          : 'R$ 0,00'
        doc.text(totalPriceStr, margin + 152, y + 6)
        
        y += 9
      })
      doc.setDrawColor(...borderGray)
      doc.line(margin, y, margin + contentW, y)
      
      const totalMoveis = furniture.reduce((sum, item) => sum + (item.price || 0), 0)
      const freightCost = layout.freightData?.freightCost || 0
      const totalOrcamento = totalMoveis + freightCost

      console.log('[PDF] Total dos móveis:', totalMoveis)
      console.log('[PDF] Total do frete:', freightCost)
      console.log('[PDF] Total do orçamento:', totalOrcamento)

      const didBreak = checkPageBreak(22)
      if (!didBreak) {
        y += 6
      }

      doc.setFont('Helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(...secondaryColor)
      doc.text('Resumo Financeiro', margin, y)

      y += 6
      doc.setFont('Helvetica', 'normal')
      doc.setFontSize(10.5)
      doc.setTextColor(...secondaryColor)
      doc.text('Total dos Móveis:', margin + 4, y)
      doc.setFont('Helvetica', 'bold')
      doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalMoveis), margin + 45, y)

      y += 5
      doc.setFont('Helvetica', 'normal')
      doc.text('Total do Frete:', margin + 4, y)
      doc.setFont('Helvetica', 'bold')
      doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(freightCost), margin + 45, y)

      y += 5
      doc.setFont('Helvetica', 'bold')
      doc.setTextColor(...primaryColor)
      doc.text('Total do Orçamento:', margin + 4, y)
      doc.text(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalOrcamento), margin + 45, y)
    }

    const didBreakPassos = checkPageBreak(45)
    if (!didBreakPassos) {
      y += 10
    }
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
    doc.text(`Página ${pageCount}`, pdfW - margin - 15, pdfH - margin)

    doc.save(`projelayout-${(layoutName ?? 'layout').toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.pdf`)
    return true
  } catch (err) {
    console.error('Error generating PDF:', err)
    return false
  }
}
