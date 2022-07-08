import { Schema, model } from 'mongoose';
import { AddressTransactionDocument } from '../lib/database';
const AddressTXSchema = new Schema<AddressTransactionDocument>({
  a_id: { type: String, index: true},
  blockindex: {type: Number, default: 0, index: true},
  txid: { type: String, lowercase: true, index: true},
  amount: { type: Number, default: 0, index: true}
}, {id: false});

AddressTXSchema.index({a_id: 1, blockindex: -1});

export default model('AddressTx', AddressTXSchema);
