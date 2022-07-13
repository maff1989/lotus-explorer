import { Schema, model } from 'mongoose';
/**
 * Peers stores the IP address, geo IP, and other network peer data
 * 
 * This is used to render the `/network` page content
 */
export type Document = {
  createdAt?: Date,
  address: string,
  port: string,
  protocol: string,
  version: string,
  country: string,
  country_code: string,
};
export const Model = model('Peers',
  new Schema<Document>({
    createdAt: { type: Date, expires: 86400, default: Date.now()},
    address: { type: String, default: "", index: true },
    port: { type: String, default: "" },
    protocol: { type: String, default: "" },
    version: { type: String, default: "" },
    country: { type: String, default: "" },
    country_code: { type: String, default: "" }
  })
);