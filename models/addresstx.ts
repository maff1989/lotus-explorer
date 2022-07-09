import { Schema, model } from 'mongoose';
export type Document = {
  a_id: string,
  blockindex: number,
  txid: string,
  amount: number,
};
const AddressTXSchema = new Schema<Document>({
  a_id: { type: String, index: true},
  blockindex: {type: Number, default: 0, index: true},
  txid: { type: String, lowercase: true, index: true},
  amount: { type: Number, default: 0, index: true}
}, { id: false });
AddressTXSchema.index({ a_id: 1, blockindex: -1 });

export const Model = model('AddressTx', AddressTXSchema);
