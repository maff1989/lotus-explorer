import { Schema, model } from 'mongoose';
export type Document = {
  a_id: string,
  balance: number,
  received: number,
  sent: number,
};
export const Model = model('Address',
  new Schema<Document>({
    a_id: { type: String, unique: true, index: true},
    received: { type: Number, default: 0, index: true },
    sent: { type: Number, default: 0, index: true },
    balance: {type: Number, default: 0, index: true},
  }, { id: false })
);