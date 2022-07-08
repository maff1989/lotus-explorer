import { Schema, model } from 'mongoose';
import { RichlistDocument } from '../lib/database';
export default model('Richlist',
  new Schema<RichlistDocument>({
    coin: { type: String },	
    received: { default: [] },
    balance: { default: [] },
  })
);
