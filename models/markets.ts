import { Schema, model } from 'mongoose';
import { MarketDocument } from '../lib/database';
export default model('Markets',
  new Schema<MarketDocument>({
    market: { type: String, index: true },
    summary: { type: Object, default: {} },
    //chartdata: { type: Array, default: [] },
    //buys: { type: Array, default: [] },
    //sells: { type: Array, default: [] },
    //history: { type: Array, default: [] },
  })
);