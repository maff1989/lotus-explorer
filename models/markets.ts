import { Schema, model } from 'mongoose';
/**
 * Markets stores data retrieved from various market APIs
 * 
 * This is used to render the `/markets/:market` page content
 */
export type Document = {
  market: string,
  summary: object,
  // chartData?,
  buys: Array<{
    amount: string,
    price: string,
    total: string
  }>,
  sells: Array<{
    amount: string,
    price: string,
    total: string
  }>,
  history: Array<{
    id: number,
    price: number,
    amount: number,
    total: number,
    market: string,
    created_at: number,
    taker_type: 'buy' | 'sell'
  }>
};
export const Model = model('Markets',
  new Schema<Document>({
    market: { type: String, index: true },
    summary: { type: Object, default: {} },
    // chartdata: { type: Array, default: [] },
    buys: { type: <Document['buys']>[], default: [] },
    sells: { type: <Document['sells']>[], default: [] },
    history: { type: <Document['history']>[], default: [] },
  })
);