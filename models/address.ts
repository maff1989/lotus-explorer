import { Schema, model } from 'mongoose';
import { AddressDocument } from '../lib/explorer';
export default model('Address',
  new Schema<AddressDocument>({
    a_id: { type: String, unique: true, index: true},
    received: { type: Number, default: 0, index: true },
    sent: { type: Number, default: 0, index: true },
    balance: {type: Number, default: 0, index: true},
  }, { id: false })
);