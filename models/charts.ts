import { Schema, model } from 'mongoose';
export type PlotData = Array<(string | number)[]>;
/**
 * Charts stores calculated plot data for various metrics
 * 
 * This is used to render the graphs on the `/charts` page
 */
export type Document = {
  inflationDay: PlotData,
  inflationWeek: PlotData,
  inflationMonth: PlotData,
  inflationDay_total: number,
  inflationWeek_total: number,
  inflationMonth_total: number,
  burnedDay: PlotData,
  burnedWeek: PlotData,
  burnedMonth: PlotData,
  burnedDay_total: number,
  burnedWeek_total: number,
  burnedMonth_total: number,
  txsDay: PlotData,
  txsWeek: PlotData,
  txsMonth: PlotData,
  txsQuarter: PlotData,
  txsAll: PlotData,
  difficultyWeek: PlotData,
  difficultyMonth: PlotData,
  difficultyQuarter: PlotData,
  difficultyYear: PlotData,
  miningDistDay: PlotData,
  miningDistWeek: PlotData,
  miningDistMonth: PlotData,
  txsDay_count: number,
  txsWeek_count: number,
  txsMonth_count: number,
  txsQuarter_count: number,
  totalMinersDay: number,
  totalMinersWeek: number,
  totalMinersMonth: number,
};
export const Model = model('Charts',
  new Schema<Document>({
    // Inflation XPI
    inflationDay: { type: <PlotData>[], default: [] },
    inflationWeek: { type: <PlotData>[], default: [] },
    inflationMonth: { type: <PlotData>[], default: [] },
    inflationDay_total: { type: Number, default: 0 },
    inflationWeek_total: { type: Number, default: 0 },
    inflationMonth_total: { type: Number, default: 0 },
    // Burned XPI (OP_RETURN)
    burnedDay: { type: <PlotData>[], default: [] },
    burnedWeek: { type: <PlotData>[], default: [] },
    burnedMonth: { type: <PlotData>[], default: [] },
    burnedDay_total: { type: Number, default: 0 },
    burnedWeek_total: { type: Number, default: 0 },
    burnedMonth_total: { type: Number, default: 0 },
    // Non-coinbase Transactions
    txsDay: { type: <PlotData>[], default: [] },
    txsWeek: { type: <PlotData>[], default: [] },
    txsMonth: { type: <PlotData>[], default: [] },
    txsQuarter: { type: <PlotData>[], default: [] },
    txsAll: { type: <PlotData>[], default: [] },
    txsDay_count: { type: Number, default: 0 },
    txsWeek_count: { type: Number, default: 0 },
    txsMonth_count: { type: Number, default: 0 },
    txsQuarter_count: { type: Number, default: 0 },
    // Block Difficulty
    difficultyWeek: { type: <PlotData>[], default: [] },
    difficultyMonth: { type: <PlotData>[], default: [] },
    difficultyQuarter: { type: <PlotData>[], default: [] },
    difficultyYear: { type: <PlotData>[], default: [] },
    // Block Distribution
    miningDistDay: { type: <PlotData>[], default: [] },
    miningDistWeek: { type: <PlotData>[], default: [] },
    miningDistMonth: { type: <PlotData>[], default: [] },
    totalMinersDay: { type: Number, default: 0 },
    totalMinersWeek: { type: Number, default: 0 },
    totalMinersMonth: { type: Number, default: 0 },
  })
);
