import { Schema, model } from 'mongoose';
import { TransactionDocument } from '../lib/explorer';
const TxSchema = new Schema<TransactionDocument>({
  txid: { type: String, lowercase: true, unique: true, index: true},
  size: { type: Number, default: 0 },
  fee: { type: Number, default: 0 },
  vin: { default: [] },
  vout: { default: [] },
  total: { type: Number, default: 0, index: true },
  timestamp: { type: Number, default: 0, index: true },
  localeTimestamp: { type: String }, // for jqPlot charts
  blockhash: { type: String, index: true },
  blockindex: {type: Number, default: 0, index: true},
}, {id: false});
TxSchema.index({ total: 1, blockindex: 1 });
export default model('Tx', TxSchema);
