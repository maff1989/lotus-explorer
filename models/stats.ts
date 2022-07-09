import { Schema, model } from 'mongoose';
export type Document = {
  coin: string,
  count: number,
  last: number,
  supply: number,
  burned: number,
  connections: number,
};
export const Model = model('coinstats',
  new Schema<Document>({
    coin: { type: String },
    count: { type: Number, default: 1 },
    last: { type: Number, default: 1 },
    //difficulty: { type: Object, default: {} },
    //hashrate: { type: String, default: 'N/A' },
    supply: { type: Number, default: 0 },
    burned: { type: Number, default: 0 },
    //last_txs: { type: Array, default: [] },
    connections: { type: Number, default: 0 },
    //last_price: { type: Number, default: 0 },
  })
);
