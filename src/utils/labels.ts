export const cleanItemName = (name: string): string =>
  name.replace(/^\[(Premium|Especial)\]\s*/i, '')
