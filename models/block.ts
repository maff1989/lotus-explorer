import { Schema, model } from 'mongoose';
/**
 * Block tracks necessary blockchain metrics, such as difficulty and burned Lotus
 */
export type Document = {
  height: number,
  minedby: string,
  timestamp: number,
  localeTimestamp: string,
  difficulty: number,
  size: number,
  fees: number,
  burned: number,
  txcount: number,
};
const BlockSchema = new Schema<Document>({
  height: {type: Number, default: 0, unique: true, index: true},
  //hash: { type: String, index: true },
  minedby: { type: String, default: "", index: true },
  timestamp: { type: Number, default: 0, index: true },
  localeTimestamp: { type: String }, // for jqPlot charts
  difficulty: { type: Number, default: 0 },
  size: { type: Number, default: 0 },
  fees: { type: Number, default: 0 },
  burned: { type: Number, default: 0, index: true },
  txcount: { type: Number, default: 1 }, // blocks always have >=1 tx
});
BlockSchema.index({ height: -1 });

export const Model = model('Block', BlockSchema);
