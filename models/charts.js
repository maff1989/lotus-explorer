var mongoose = require('mongoose')
  , Schema = mongoose.Schema;
 
var ChartsSchema = new Schema({
  // Non-coinbase Transactions
  txsDay: { type: Array, default: [] },
  txsWeek: { type: Array, default: [] },
  txsMonth: { type: Array, default: [] },
  txsQuarter: { type: Array, default: [] },
  txsDay_count: { type: Number, default: 0 },
  txsWeek_count: { type: Number, default: 0 },
  txsMonth_count: { type: Number, default: 0 },
  txsQuarter_count: { type: Number, default: 0 },
  txsAll: { type: Array, default: [] },
  // Block Difficulty
  difficultyWeek: { type: Array, default: [] },
  difficultyMonth: { type: Array, default: [] },
  difficultyQuarter: { type: Array, default: [] },
  difficultyAll: { type: Array, default: [] },
  // Block Distribution
  miningDistDay: { type: Array, default: [] },
  miningDistWeek: { type: Array, default: [] },
  miningDistMonth: { type: Array, default: [] },
  totalMinersDay: { type: Number, default: 0 },
  totalMinersWeek: { type: Number, default: 0 },
  totalMinersMonth: { type: Number, default: 0 },
});

module.exports = mongoose.model('Charts', ChartsSchema);