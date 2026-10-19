// Universo padrão de ativos com perfil "Buy and Hold": empresas perenes,
// de setores regulados ou consolidados e com histórico de pagamento de dividendos.
export interface Asset {
  ticker: string
  sector: string
}

export const BUY_AND_HOLD_UNIVERSE: Asset[] = [
  { ticker: "ITUB4", sector: "Bancos" },
  { ticker: "BBDC4", sector: "Bancos" },
  { ticker: "BBAS3", sector: "Bancos" },
  { ticker: "ITSA4", sector: "Holding" },
  { ticker: "BBSE3", sector: "Seguros" },
  { ticker: "PSSA3", sector: "Seguros" },
  { ticker: "TAEE11", sector: "Energia Elétrica" },
  { ticker: "EGIE3", sector: "Energia Elétrica" },
  { ticker: "CMIG4", sector: "Energia Elétrica" },
  { ticker: "CPLE3", sector: "Energia Elétrica" },
  { ticker: "ISAE4", sector: "Energia Elétrica" },
  { ticker: "ALUP11", sector: "Energia Elétrica" },
  { ticker: "SAPR11", sector: "Saneamento" },
  { ticker: "SBSP3", sector: "Saneamento" },
  { ticker: "CSMG3", sector: "Saneamento" },
  { ticker: "VIVT3", sector: "Telecomunicações" },
  { ticker: "TIMS3", sector: "Telecomunicações" },
  { ticker: "WEGE3", sector: "Bens Industriais" },
  { ticker: "VALE3", sector: "Mineração" },
  { ticker: "PETR4", sector: "Petróleo e Gás" },
  { ticker: "KLBN11", sector: "Papel e Celulose" },
  { ticker: "ABEV3", sector: "Consumo" },
  { ticker: "B3SA3", sector: "Serviços Financeiros" },
  { ticker: "RADL3", sector: "Saúde/Varejo" },
]

export const sectorOf = (ticker: string): string =>
  BUY_AND_HOLD_UNIVERSE.find((a) => a.ticker === ticker)?.sector ?? "Outros"
