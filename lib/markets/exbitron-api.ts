export const BASE_URL = 'https://www.exbitron.com/api/v2/peatio/public'
export const MARKETS_URL = 'markets';
export const OPTIONS = {
  json: true,
  timeout: 5000,
};
export type Tickers = {
  at: string, // unix timestamp
  ticker: {
    low: string,
    high: string,
    last: string,
    avg_price: string,
    price_change_percent: string
    volume: string, // EXCHANGE volume
    amount: string, // COIN volume
  }
};
export type Trade = {
  id: number,
  price: number,
  amount: number,
  total: number,
  market: string,
  created_at: number,
  taker_type: 'buy' | 'sell'
};
export type Order = {
  id: number,
  uuid: string,
  side: 'buy' | 'sell',
  ord_type: 'limit',
  price: string,
  avg_price: string,
  state: string,
  market_type: 'spot',
  created_at: string, // ISO date string
  updated_at: string, //ISO date string
  origin_volume: string,
  remaining_volume: string,
  executed_volume: string,
  maker_fee: string,
  taker_fee: string,
  trades_count: number
};
export type OrderBook = {
  asks: Order[],
  bids: Order[]
};