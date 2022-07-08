import { Schema, model } from 'mongoose';
import { ChartsDocument } from '../lib/database';
const ChartsSchema = new Schema<ChartsDocument>({
  // Non-coinbase Transactions
  txsDay: { default: [] },
  txsWeek: { default: [] },
  txsMonth: { default: [] },
  txsQuarter: { default: [] },
  txsAll: { default: [] },
  txsDay_count: { type: Number, default: 0 },
  txsWeek_count: { type: Number, default: 0 },
  txsMonth_count: { type: Number, default: 0 },
  txsQuarter_count: { type: Number, default: 0 },
  // Block Difficulty
  difficultyWeek: { default: [] },
  difficultyMonth: { default: [] },
  difficultyQuarter: { default: [] },
  difficultyYear: { default: [] },
  // Block Distribution
  miningDistDay: { default: [] },
  miningDistWeek: { default: [] },
  miningDistMonth: { default: [] },
  totalMinersDay: { type: Number, default: 0 },
  totalMinersWeek: { type: Number, default: 0 },
  totalMinersMonth: { type: Number, default: 0 },
});

export default model('Charts', ChartsSchema);
