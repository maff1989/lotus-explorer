import { Schema, model } from 'mongoose';
export default model('Markets',
  new Schema({
    market: { type: String, index: true },
    summary: { type: Object, default: {} },
    chartdata: { type: Array, default: [] },
    buys: { type: Array, default: [] },
    sells: { type: Array, default: [] },
    history: { type: Array, default: [] },
  })
);