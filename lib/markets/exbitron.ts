import request from 'request-promise';
const settings = require('./settings');

type Exchange = {
  Orders: {},
  Summary: {
    bid: number,
    ask: number,
    volume: string,
    volume_btc: string,
    high: string,
    low: string,
    last: string,
    change: number,
  },
  Trades: {},
  Settings: {
    coin: string,
    exchange: string,
    enabled: string[],
    default: string,
  },
};
type ExchangeOrders = {

};
type ExchangeTrades = {

};

const BASE_URL = 'https://www.exbitron.com/api/v2/peatio/public/markets/';
const COIN = settings.coin;
const EXCHANGE = settings.exchange;

export const get_data = async (settings: Exchange['Settings']) => {
    
};

const get_summary = async () => {
  const { ticker: { vol, volume, high, low, last }} = await request.get({
    uri: BASE_URL + 'xpiusdt/tickers',
    json: true,
  });
  return {
    bid: 0,
    ask: 0,
    change: 0,
    volume: vol,
    volume_btc: volume,
    high,
    low,
    last,
  } as Exchange['Summary'];
};

const get_trades = async () => {

};

const get_orders = async () => {

};