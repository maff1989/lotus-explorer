import request from 'request-promise';
import settings from '../settings';
import * as API from './exbitron-api';

type Summary = {
  low: number,
  high: number,
  last: number,
  change: string,
  bid: number,
  ask: number,
  volume_exchange: number,
  volume_xpi: number,
};

type ParsedOrder = {
  amount: number,
  price: number,
  total: number
};

export type ParsedData = {
  stats: Summary,
  trades: API.Trade[],
  buys: ParsedOrder[],
  sells: ParsedOrder[]
  chartdata?,
};

export default class {
  private TRADEPAIR =
    settings.markets.coin.toLowerCase() +
    settings.markets.exchange.toLowerCase();
  private URI =
    `${API.BASE_URL}/${API.MARKETS_URL}`
    + `/${this.TRADEPAIR}`;
  
  async get_data(): Promise<ParsedData> {
    const { buys, sells } = await this.get_orders();
    return {
      buys, sells,
      chartdata: [],
      trades: await this.get_trades(),
      stats: await this.get_summary(),
    }
  };

  private async get_summary
  (): Promise<Summary> {
    try {
      const { ticker }: API.Tickers = await request.get({
        uri: this.URI + `/tickers`,
        json: true,
      });
      return {
        volume_exchange: Number(ticker.volume),
        volume_xpi: Number(ticker.amount),
        low: Number(ticker.low),
        high: Number(ticker.high),
        last: Number(ticker.last),
        change: ticker.price_change_percent,
        bid: 0,
        ask: 0
      };
    } catch (e: any) {
      throw new Error(`Exbitron.get_summary: ${e.message}`);
    }
  };

  private async get_orders
  (): Promise<{
    'buys': ParsedOrder[],
    'sells': ParsedOrder[]
  }> {
    const processor = (order: API.Order) => {
      return {
        amount: Number(order.remaining_volume),
        price: Number(order.price),
        total: Number(order.price) * Number(order.remaining_volume)
      };
    };
    try {
      const { bids, asks }: API.OrderBook = await request.get({
        uri: this.URI + `/order-book?asks_limit=50&bid_limit=50`,
        json: true,
      }) || { bids: [], asks: [] };
      const buys = bids.map(bid => processor(bid));
      const sells = asks.map(ask => processor(ask));
      return { buys, sells };
    } catch (e: any) {
      throw new Error(`Exbitron.get_orders: ${e.message}`);
    }
  };

  private async get_trades
  (): Promise<API.Trade[]> {
    try {
      return await request.get({
        uri: this.URI + `/trades?limit=100`,
        json: true,
      });
    } catch (e: any) {
      throw new Error(`Exbitron.get_trades: ${e.message}`);
    }
  };
};