import { Schema, model } from 'mongoose';
/**
 * AddressTx tracks movement of `amount` (in satoshis) for `a_id` in
 * `txid` at `blockindex`
 * 
 * This is used when generating a timeline of running balances for the address
 * via `/ext/getaddresstxsajax/:address` API call
 * 
 * Example:
 *  ```
 *  {
 *    "a_id" : "lotus_16PSJMqwYm2Qf949pVrwJok7LfUuXE4YmQFBcVJGa",
 *    "txid" : "4226289a00e67faae02000999ffbb1e5a935bd0dad6d8cd957c18adbd2744ed3",
 *    "amount" : -1150000000000,
 *    "blockindex" : 251163 
 *  }
 *  ```
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
