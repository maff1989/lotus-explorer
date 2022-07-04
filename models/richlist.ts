import { Schema, model } from 'mongoose';
export default model('Richlist',
  new Schema({
    coin: { type: String },	
    received: { type: Array, default: []},
    balance: { type: Array, default: [] },
  })
);
