import { Schema, model } from 'mongoose';
/**
 * Markets stores data retrieved from various market APIs
 * 
 * This is used to render the `/markets/:market` page content
 */
export type Document = {
  market: string,
  summary: object,
  //chartData: Array,
  //buys: Array,
  //sells: Array,
  //history: Array
};
export const Model = model('Markets',
  new Schema<Document>({
    market: { type: String, index: true },
    summary: { type: Object, default: {} },
    //chartdata: { type: Array, default: [] },
    //buys: { type: Array, default: [] },
    //sells: { type: Array, default: [] },
    //history: { type: Array, default: [] },
  })
);