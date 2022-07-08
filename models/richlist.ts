import { Schema, model } from 'mongoose';
import { RichlistDocument } from '../lib/database';
import { AddressDocument } from '../lib/explorer';
export default model('Richlist',
  new Schema<RichlistDocument>({
    coin: { type: String },	
    received: { type: <AddressDocument[]>[], default: [] },
    balance: { type: <AddressDocument[]>[], default: [] },
  })
);
