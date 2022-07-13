import { Schema, model } from 'mongoose';
/**
 * AddressTx tracks movement of `amount` (in satoshis) for `a_id` in
 * `txid` at `blockindex`
 * 
 * This is used when generating a timeline of running balances for the address
 * via `/ext/getaddresstxsajax/:address` API call
 */
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
