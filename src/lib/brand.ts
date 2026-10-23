// Nome do sistema que aparece no rodapé, nos títulos e nos e-mails. Para vender para salões e
// manicures com um nome neutro, defina NEXT_PUBLIC_BRAND_NAME (ex.: "Agenda Fácil").
export const brandName = () => process.env.NEXT_PUBLIC_BRAND_NAME || 'Agenda Barber';
