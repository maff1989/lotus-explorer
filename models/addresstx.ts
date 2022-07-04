import { Schema, model } from 'mongoose';
const AddressTXSchema = new Schema({
  a_id: { type: String, index: true},
  blockindex: {type: Number, default: 0, index: true},
  txid: { type: String, lowercase: true, index: true},
  amount: { type: Number, default: 0, index: true}
}, {id: false});

AddressTXSchema.index({a_id: 1, blockindex: -1});

export default model('AddressTx', AddressTXSchema);
