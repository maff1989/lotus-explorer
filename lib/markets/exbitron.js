var request = require('request');

var base_url = 'https://www.exbitron.com/api/v2/peatio/public/markets';
// valid pairs: xpiusdt, xpibch, xpidoge (but who wants doge LOL)
function get_summary(coin, exchange, cb) {
  var summary = {};
  request({uri: base_url + '/'+ 'xpiusdt' + '/tickers', json: true}, function (error, response, body) {
    console.log(body);
    if (error) {
      return cb(error, null);
    } else {
      summary['bid'] = "0.00000000";
      summary['ask'] = "0.00000000";
      summary['volume'] = parseFloat(body['ticker']['vol']).toFixed(8);
      summary['volume_btc'] = parseFloat(body['ticker']['volume']).toFixed(8);
      summary['high'] = parseFloat(body['ticker']['high']).toFixed(8);
      summary['low'] = parseFloat(body['ticker']['low']).toFixed(8);
      summary['last'] = parseFloat(body['ticker']['last']).toFixed(8);
      summary['change'] = 0;
      return cb(null, summary);
    }
  });
}

function get_trades(coin, exchange,  cb) {
  var req_url = base_url + '/' + coin.toLowerCase() + exchange.toLowerCase()+ '/trades?limit=100';
  request({uri: req_url, json: true}, function (error, response, body) {
    if (body.error) {
      return cb(body.error, null);
    } else {
      return cb (null, body);
    }
  });
}

function get_orders(coin, exchange, cb) {
  var req_url = base_url + '/' + coin.toLowerCase() + exchange.toLowerCase()+  '/order-book?asks_limit=50&bid_limit=50';
  request({uri: req_url, json: true}, function (error, response, body) {
    if (body.error) {
      return cb(body.error, [], [])
    } else {
      var orders = body;
      var buys = [];
      var sells = [];
      if (orders['bids'].length > 0){
        for (var i = 0; i < orders['bids'].length; i++) {
          var order = {
            amount: parseFloat(orders.bids[i]["remaining_volume"]).toFixed(8),
            price: parseFloat(orders.bids[i]["price"]).toFixed(8),
            //  total: parseFloat(orders.bids[i].Total).toFixed(8)
            // Necessary because API will return 0.00 for small volume transactions
            total: (parseFloat(orders.bids[i]["price"]).toFixed(8) * parseFloat(orders.bids[i]["remaining_volume"])).toFixed(8)
          }
          buys.push(order);
        }
      } else {}
      if (orders['asks'].length > 0) {
        for (var x = 0; x < orders['asks'].length; x++) {
          var order = {
            amount: parseFloat(orders.asks[x]["remaining_volume"]).toFixed(8),
            price: parseFloat(orders.asks[x]["price"]).toFixed(8),
            //    total: parseFloat(orders.asks[x].Total).toFixed(8)
            // Necessary because API will return 0.00 for small volume transactions
            total: (parseFloat(orders.asks[x]["price"]).toFixed(8) * parseFloat(orders.asks[x]["remaining_volume"])).toFixed(8)
          }
          sells.push(order);
        }
      } else {}
      // don't need this because we want lowest sell orders at the top of the table
      //var sells = sells.reverse();
      return cb(null, buys, sells);
    }
  });
}

module.exports = {
  get_data: function(settings, cb) {
    var error = null;
    get_orders(settings.coin, settings.exchange, function(err, buys, sells) {
      if (err) { error = err; }
      get_trades(settings.coin, settings.exchange, function(err, trades) {
        if (err) { error = err; }
        get_summary(settings.coin, settings.exchange, function(err, stats) {
          if (err) { error = err; }
          return cb(error, {buys: buys, sells: sells, chartdata: [], trades: trades, stats: stats});
        });
      });
    });
  }
};