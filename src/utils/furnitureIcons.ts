import balcaoMdf070 from '../assets/icons/Balcão_mdf_0,70.png'
import balcaoMdf080 from '../assets/icons/Balcão_mdf_0,80.png'
import balcaoMdf100 from '../assets/icons/Balcão_mdf_1,00.png'
import bomboniere060 from '../assets/icons/Bomboniere_0,60.png'
import bomboniere100 from '../assets/icons/Bomboniere_1,00.png'
import caixa100 from '../assets/icons/Caixa_1,00.png'
import cestao040x040 from '../assets/icons/Cestão_0,40x0,40.png'
import controlado050 from '../assets/icons/Controlado_0,50.png'
import controlado100 from '../assets/icons/Controlado_1,00.png'
import dermo050 from '../assets/icons/Dermo_0,50.png'
import esmaltes050 from '../assets/icons/Esmaltes_0,50.png'
import gondola170 from '../assets/icons/Gôndola_1,70.png'
import gondola170Cimed from '../assets/icons/Gôndola_1,70_com_ponta_cimed.png'
import gondola300 from '../assets/icons/Gôndola_3,00.png'
import gondola300Cimed from '../assets/icons/Gôndola_3,00_com_ponta_cimed.png'
import lateralCaixa040 from '../assets/icons/Lateral_caixa_0,40.png'
import lateralCaixa065 from '../assets/icons/Lateral_caixa_0,65.png'
import maquiagens050 from '../assets/icons/Maquiagens_0,50.png'
import medicamento050 from '../assets/icons/Medicamento_0,50.png'
import medicamento080 from '../assets/icons/Medicamento_0,80.png'
import pdv060 from '../assets/icons/PDV_0,60.png'
import perfumaria055 from '../assets/icons/Perfumaria_0,55.png'
import perfumaria080 from '../assets/icons/Perfumaria_0,80.png'
import perfumariaCanaletado080 from '../assets/icons/Perfumaria_canaletado_0,80.png'
import perfumariaFraldas from '../assets/icons/Perfumaria_fraldas.png'
import vitrine080 from '../assets/icons/Vitrine_0,80.png'
import mipPrimeirosSocorros from '../assets/icons/mip_Primeiros_Socorros.png'
import mipVitaminaseMinerais from '../assets/icons/mip_Vitaminas_e_Minerais.png'
import mipDorEFebre from '../assets/icons/mip_dor_e_febre.png'
import mipGripeEAlergia from '../assets/icons/mip_gripe_e_alergia.png'
import mipSistemaDigestivo from '../assets/icons/mip_sistema_digestivo.png'

export const ICON_MAP: Record<string, string> = {
  'Balcão_mdf_0,70.png': balcaoMdf070,
  'Balcão_mdf_0,80.png': balcaoMdf080,
  'Balcão_mdf_1,00.png': balcaoMdf100,
  'Bomboniere_0,60.png': bomboniere060,
  'Bomboniere_1,00.png': bomboniere100,
  'Caixa_1,00.png': caixa100,
  'Cestão_0,40x0,40.png': cestao040x040,
  'Controlado_0,50.png': controlado050,
  'Controlado_1,00.png': controlado100,
  'Dermo_0,50.png': dermo050,
  'Esmaltes_0,50.png': esmaltes050,
  'Gôndola_1,70.png': gondola170,
  'Gôndola_1,70_com_ponta_cimed.png': gondola170Cimed,
  'Gôndola_3,00.png': gondola300,
  'Gôndola_3,00_com_ponta_cimed.png': gondola300Cimed,
  'Lateral_caixa_0,40.png': lateralCaixa040,
  'Lateral_caixa_0,65.png': lateralCaixa065,
  'Maquiagens_0,50.png': maquiagens050,
  'Medicamento_0,50.png': medicamento050,
  'Medicamento_0,80.png': medicamento080,
  'PDV_0,60.png': pdv060,
  'Perfumaria_0,55.png': perfumaria055,
  'Perfumaria_0,80.png': perfumaria080,
  'Perfumaria_canaletado_0,80.png': perfumariaCanaletado080,
  'Perfumaria_fraldas.png': perfumariaFraldas,
  'Vitrine_0,80.png': vitrine080,
  'mip_Primeiros_Socorros.png': mipPrimeirosSocorros,
  'mip_Vitaminas_e_Minerais.png': mipVitaminaseMinerais,
  'mip_dor_e_febre.png': mipDorEFebre,
  'mip_gripe_e_alergia.png': mipGripeEAlergia,
  'mip_sistema_digestivo.png': mipSistemaDigestivo
}

export function getFurnitureIcon(item: { id?: string; name?: string; category?: string; code?: string; icon?: string }): string | null {
  if (!item) return null;

  // 1. Check if the icon field itself contains the name of a file in the map
  const iconVal = item.icon || '';
  if (iconVal && ICON_MAP[iconVal]) {
    return ICON_MAP[iconVal];
  }

  // 2. Resolve by code/category/name (fallback/database migration safety)
  const code = item.code || '';
  const name = (item.name || '').toLowerCase();
  
  if (code === '11' || code === '12') return ICON_MAP['Perfumaria_0,80.png'];
  if (code === '13') return ICON_MAP['Perfumaria_0,55.png'];
  if (code === '14') return ICON_MAP['Perfumaria_canaletado_0,80.png'];
  if (code === '15') return ICON_MAP['Vitrine_0,80.png'];
  
  if (code === '21') return ICON_MAP['Medicamento_0,80.png'];
  if (code === '22') return ICON_MAP['Medicamento_0,50.png'];
  
  if (code === '31') return ICON_MAP['Gôndola_1,70.png'];
  if (code === '32' || code === '33') return ICON_MAP['Gôndola_3,00.png'];
  if (code === '34') return ICON_MAP['Gôndola_1,70_com_ponta_cimed.png'];
  if (code === '35' || code === '36') return ICON_MAP['Gôndola_3,00_com_ponta_cimed.png'];
  
  if (code === '43') return ICON_MAP['mip_dor_e_febre.png'];
  if (code === '44') return ICON_MAP['mip_gripe_e_alergia.png'];
  if (code === '45') return ICON_MAP['mip_sistema_digestivo.png'];
  if (code === '46') return ICON_MAP['mip_Vitaminas_e_Minerais.png'];
  if (code === '47') return ICON_MAP['mip_Primeiros_Socorros.png'];
  if (code === '48') return ICON_MAP['mip_sistema_digestivo.png'];
  
  if (code === '51') return ICON_MAP['Balcão_mdf_1,00.png'];
  if (code === '52') return ICON_MAP['Balcão_mdf_0,80.png'];
  if (code === '53') return ICON_MAP['Balcão_mdf_0,70.png'];
  
  if (code === '61') return ICON_MAP['PDV_0,60.png'];
  if (code === '71') return ICON_MAP['Cestão_0,40x0,40.png'];
  
  if (code === '81') return ICON_MAP['Lateral_caixa_0,40.png'];
  if (code === '82') return ICON_MAP['Lateral_caixa_0,65.png'];
  
  if (code === '91') return ICON_MAP['Dermo_0,50.png'];
  
  if (code === '101') return ICON_MAP['Controlado_0,50.png'];
  if (code === '102') return ICON_MAP['Controlado_1,00.png'];
  
  if (code === '111') return ICON_MAP['Esmaltes_0,50.png'];
  if (code === '121') return ICON_MAP['Maquiagens_0,50.png'];
  
  if (code === '231') return ICON_MAP['Bomboniere_0,60.png'];
  if (code === '232') return ICON_MAP['Bomboniere_1,00.png'];

  // Match by name or ID fallback
  if (name.includes('cestão')) return ICON_MAP['Cestão_0,40x0,40.png'];
  if (name.includes('pdv')) return ICON_MAP['PDV_0,60.png'];
  if (name.includes('caixa')) return ICON_MAP['Caixa_1,00.png'];
  if (name.includes('balcão mdf 0,70') || name.includes('ba 70')) return ICON_MAP['Balcão_mdf_0,70.png'];
  if (name.includes('balcão mdf 0,80') || name.includes('ba 80')) return ICON_MAP['Balcão_mdf_0,80.png'];
  if (name.includes('balcão mdf 1,00') || name.includes('ba 100')) return ICON_MAP['Balcão_mdf_1,00.png'];
  if (name.includes('bomboniere 0,60') || name.includes('bomb 57')) return ICON_MAP['Bomboniere_0,60.png'];
  if (name.includes('bomboniere 1,00') || name.includes('bomb 97')) return ICON_MAP['Bomboniere_1,00.png'];
  if (name.includes('esmalte') || name.includes('esm ')) return ICON_MAP['Esmaltes_0,50.png'];
  if (name.includes('maquiagem') || name.includes('maq ')) return ICON_MAP['Maquiagens_0,50.png'];

  return null;
}
