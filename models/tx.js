var mongoose = require('mongoose')
  , Schema = mongoose.Schema;
 
var TxSchema = new Schema({
  txid: { type: String, lowercase: true, unique: true, index: true},
  size: { type: Number, default: 0 },
  fee: { type: Number, default: 0 },
  vin: { type: Array, default: [] },
  vout: { type: Array, default: [] },
  total: { type: Number, default: 0, index: true },
  timestamp: { type: Number, default: 0, index: true },
  localeTimestamp: { type: String }, // for jqPlot charts
  blockhash: { type: String, index: true },
  blockindex: {type: Number, default: 0, index: true},
}, {id: false});

TxSchema.index({total: 1, total: -1, blockindex: 1, blockindex: -1});

module.exports = mongoose.model('Tx', TxSchema);
