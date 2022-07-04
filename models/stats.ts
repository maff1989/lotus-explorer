import { Schema, model } from 'mongoose';
export default model('coinstats',
  new Schema({
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
