import { Schema, model } from 'mongoose';
import * as Address from './address';
/**
 * Richlist tracks the top Lotus addresses with the most Lotus balance
 */
export type Document = {
  coin: string,
  received: Address.Document[],
  balance: Address.Document[],
};
export const Model = model('Richlist',
  new Schema<Document>({
    coin: { type: String },	
    received: { type: <Address.Document[]>[], default: [] },
    balance: { type: <Address.Document[]>[], default: [] },
  })
);
