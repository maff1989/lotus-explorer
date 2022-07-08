import { Schema, model } from 'mongoose';
import { ChartsPlot, ChartsDocument } from '../lib/database';
const ChartsSchema = new Schema<ChartsDocument>({
  // Non-coinbase Transactions
  txsDay: { type: <ChartsPlot>[], default: [] },
  txsWeek: { type: <ChartsPlot>[], default: [] },
  txsMonth: { type: <ChartsPlot>[], default: [] },
  txsQuarter: { type: <ChartsPlot>[], default: [] },
  txsAll: { type: <ChartsPlot>[], default: [] },
  txsDay_count: { type: Number, default: 0 },
  txsWeek_count: { type: Number, default: 0 },
  txsMonth_count: { type: Number, default: 0 },
  txsQuarter_count: { type: Number, default: 0 },
  // Block Difficulty
  difficultyWeek: { type: <ChartsPlot>[], default: [] },
  difficultyMonth: { type: <ChartsPlot>[], default: [] },
  difficultyQuarter: { type: <ChartsPlot>[], default: [] },
  difficultyYear: { type: <ChartsPlot>[], default: [] },
  // Block Distribution
  miningDistDay: { type: <ChartsPlot>[], default: [] },
  miningDistWeek: { type: <ChartsPlot>[], default: [] },
  miningDistMonth: { type: <ChartsPlot>[], default: [] },
  totalMinersDay: { type: Number, default: 0 },
  totalMinersWeek: { type: Number, default: 0 },
  totalMinersMonth: { type: Number, default: 0 },
});

export default model('Charts', ChartsSchema);
