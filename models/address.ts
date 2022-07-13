import { Schema, model } from 'mongoose';
/**
 * Address tracks overall `sent`, `received`, and `balance` for `a_id`
 */
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