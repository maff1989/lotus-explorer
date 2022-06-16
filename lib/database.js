var mongoose = require('mongoose')
  , Stats = require('../models/stats')
  , Markets = require('../models/markets')
  , Address = require('../models/address')
  , AddressTx = require('../models/addresstx')
  , Block = require('../models/block')
  , Charts = require('../models/charts')
  , Tx = require('../models/tx')
  , Richlist = require('../models/richlist')
  , Peers = require('../models/peers')
  , Heavy = require('../models/heavy')
  , lib = require('./explorer')
  , settings = require('./settings')
  , fs = require('fs')
  , async = require('async');

mongoose.set('useCreateIndex', true);
mongoose.set('useUnifiedTopology', true);
mongoose.set('useNewUrlParser', true);
mongoose.set('useFindAndModify', false);

function find_address(hash, cb) {
  Address.findOne({a_id: hash}, function(err, address) {
    if(address) {
      return cb(address);
    } else {
      return cb();
    }
  });
}

function find_address_tx(address, hash, cb) {
  AddressTx.findOne({a_id: address, txid: hash}, function(err, address_tx) {
    if(address_tx) {
      return cb(address_tx);
    } else {
      return cb();
    }
  });
}

function find_richlist(coin, cb) {
  Richlist.findOne({coin: coin}, function(err, richlist) {
    if(richlist) {
      return cb(richlist);
    } else {
      return cb();
    }
  });
}

function update_address(hash, blockheight, txid, amount, type, cb) {
  var to_sent = false;
  var to_received = false;
  var addr_inc = {}
  if ( hash == 'coinbase' ) {
    addr_inc.sent = amount;
  } else {
    if (type == "toSelf") {
      addr_inc.sent = -amount;
      addr_inc.balance = amount;
    } else if (type == 'vin') {
      addr_inc.sent = amount;
      addr_inc.balance = -amount;
    // only increment balance if address spent to itself
    } else {
      addr_inc.received = amount;
      addr_inc.balance = amount;
    }
  }
  Address.findOneAndUpdate({a_id: hash}, {
    $inc: addr_inc
  }, {
    new: true,
    upsert: true
  }, function (err, address) {
    if (err) {
      return cb(err);
    } else {
      if ( hash != 'coinbase' ) {
        AddressTx.findOneAndUpdate({a_id: hash, txid: txid}, {
          $inc: {
            amount: addr_inc.balance
          },
          $set: {
            a_id: hash,
            blockindex: blockheight,
            txid: txid
          }
        }, {
          new: true,
          upsert: true
        }, function (err,addresstx) {
          if (err) {
            return cb(err);
          } else {
            return cb();
          }
        });
      } else {
        return cb();
      }
    }
  });
}


function find_tx(txid, cb) {
  Tx.findOne({txid: txid}, function(err, tx) {
    if(tx) {
      return cb(tx);
    } else {
      return cb(null);
    }
  });
}

function find_block(height, cb) {
  Block.findOne({height: height}, function(err, block) {
    if(block) {
      return cb(block);
    } else {
      return cb(null);
    }
  });
}

function find_latest_block(cb) {
  Block.find().sort({'timestamp': -1}).limit(1).exec(function(err, block) {
    return cb(block);
  });
}

function save_block(block, txburned, cb) {
  lib.get_block_fees(block.height, function(fees, fees_burned) {
    var total_burned = (parseFloat(fees_burned) + parseFloat(txburned));
    // get the raw tx of coinbase to gather miner address
    lib.get_rawtransaction(block.tx[0], function(rtx) {
      var miner_address = rtx.vout[1].scriptPubKey.addresses[0];
      var newBlock = new Block({
        height: block.height,
        minedby: miner_address,
        //hash: block.hash,
        difficulty: block.difficulty,
        timestamp: block.time,
        localeTimestamp: new Date(block.time * 1000).toLocaleString('en-us', {timeZone:"UTC"}),
        size: block.size,
        fees: fees,
        burned: total_burned,
        txcount: block.nTx
      });
      newBlock.save(function(err) {
        if (err) {
          return cb(err);
        } else {
          return cb();
        }
      });
    });
    
  });
}

function save_tx(txid, blockheight, cb) {
  //var s_timer = new Date().getTime();
  lib.get_rawtransaction(txid, function(tx){
    if (tx != 'There was an error. Check your console.') {
      lib.prepare_vin(tx, function(vin) {
        lib.prepare_vout(tx.vout, txid, vin, function(vout, nvin, txburned) {
          lib.syncLoop(vin.length, function (loop) {
            var i = loop.iteration();
            update_address(nvin[i].addresses, blockheight, txid, nvin[i].amount, 'vin', function(){
              loop.next();
            });
          }, function(){
            lib.syncLoop(vout.length, function (subloop) {
              var t = subloop.iteration();
              // only update if address is not an OP_RETURN with a value > 0
              if (vout[t].addresses && !vout[t].addresses.includes("OP_RETURN")) {
                var output_type = 'vout';
                // don't add output to "Total Received" for this address
                if(nvin.find((vin_obj) => vout[t].addresses == vin_obj.addresses)) {
                  output_type = 'toSelf';
                }
                // if UTXO outputs to same address (i.e. as change), then do not add the amount to "Received"
                update_address(vout[t].addresses, blockheight, txid, vout[t].amount, output_type, function(){
                  subloop.next();
                });
              } else {
                subloop.next();
              }
            }, function(){
              lib.calculate_total(vout, function(total){
                lib.calculate_fee(vout, nvin, function(fee) {
                  var newTx = new Tx({
                    txid: tx.txid,
                    size: tx.size,
                    fee: fee,
                    vin: nvin,
                    vout: vout,
                    total: total.toFixed(8),
                    timestamp: tx.time,
                    localeTimestamp: new Date(tx.time * 1000).toLocaleString('en-us', {timeZone:"UTC"}),
                    blockhash: tx.blockhash,
                    blockindex: blockheight,
                  });
                  newTx.save(function(err) {
                    if (err) {
                      return cb(err);
                    } else {
                      //console.log('txid: ');
                      // return the txburned value to calling function
                      // will be added into the block "burned" value later
                      return cb(txburned);
                    }
                  });
                });
              });
            });
          });
        });
      });
    } else {
      return cb('tx not found: ' + txid);
    }
  });
}

function get_market_data(market, cb) {
  if(fs.existsSync('./lib/markets/' + market + '.js')){
    exMarket = require('./markets/' + market);
    exMarket.get_data(settings.markets, function(err, obj){
      return cb(err, obj);
    });
  }else{
    return cb(null);
  }
}

function create_lock(lockfile, cb) {
  if (settings.lock_during_index == true) {
    var fname = './tmp/' + lockfile + '.pid';
    fs.appendFile(fname, process.pid.toString(), function (err) {
      if (err) {
        console.log("Error: unable to create %s", fname);
        process.exit(1);
      } else {
        return cb();
      }
    });
  } else {
    return cb();
  }
}

function remove_lock(lockfile, cb) {
  if (settings.lock_during_index == true) {
    var fname = './tmp/' + lockfile + '.pid';
    fs.unlink(fname, function (err){
      if(err) {
        console.log("unable to remove lock: %s", fname);
        process.exit(1);
      } else {
        return cb();
      }
    });
  } else {
    return cb();
  }
}

function is_locked(lockfile, cb) {
  if (settings.lock_during_index == true) {
    var fname = './tmp/' + lockfile + '.pid';
    fs.exists(fname, function (exists){
      if(exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  } else {
    return cb(false);
  }
}

module.exports = {
  // initialize DB
  connect: function(database, cb) {
    mongoose.connect(database, function(err) {
      if (err) {
        console.log('Unable to connect to database: %s', database);
        console.log('Aborting');
        process.exit(1);

      }
      //console.log('Successfully connected to MongoDB');
      return cb();
    });
  },

  is_locked: function(cb) {
    is_locked("db_index", function (exists) {
      if (exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  update_label: function(hash, message, cb){
    find_address(hash, function(address){
      if(address){
        Address.updateOne({a_id:hash}, {
          name: message,
        }, function(){
          return cb();
        })
      }
    })
  },

  check_stats: function(coin, cb) {
    Stats.findOne({coin: coin}, function(err, stats) {
      if(stats) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  get_stats: function(coin, cb) {
    Stats.findOne({coin: coin}, function(err, stats) {
      if(stats) {
        return cb(stats);
      } else {
        return cb(null);
      }
    });
  },

  create_stats: function(coin, cb) {
    var newStats = new Stats({
      coin: coin,
      last: 0,
    });

    newStats.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial stats entry created for %s", coin);
        //console.log(newStats);
        return cb();
      }
    });
  },

  get_address: function(hash, cb) {
    find_address(hash, function(address){
      return cb(address);
    });
  },

  get_richlist: function(coin, cb) {
    find_richlist(coin, function(richlist){
      return cb(richlist);
    });
  },
  
  //property: 'received' or 'balance'
  update_richlist: function(list, cb){
    if(list == 'received') {
      Address.find({}, 'a_id balance received name').sort({received: 'desc'}).limit(100).exec(function(err, addresses){
        Richlist.updateOne({coin: settings.coin}, {
          received: addresses,
        }, function() {
          return cb();
        });
      });
    } else { //balance
      Address.find({}, 'a_id balance received name').sort({balance: 'desc'}).limit(100).exec(function(err, addresses){
        Richlist.updateOne({coin: settings.coin}, {
          balance: addresses,
        }, function() {
          return cb();
        });
      });
    }
  },
  
  // gather and prepare chart data for transaction count based on timespan
  get_charts_txs: function(timespan, cb) {
    // get most recent block from db as reference point
    find_latest_block(function(b) {
      //var blockspan;
      var timespan_s;
      if(timespan == "day") { // 3 days
        //blockspan = 2160;
        timespan_s = 86400;
      } else if(timespan == "week") {
        //blockspan = 5040;
        timespan_s = 604800;
      } else if(timespan == "month") {
        //blockspan = 21600;
        timespan_s = 2592000;
      } else if(timespan == "quarter") {
        //blockspan = 64800;
        timespan_s = 7776000;
      }
      // Gather all non-coinbase txs for defined timespan
      var agg = [
        { '$match': {
          'timestamp': { '$gte': (b[0].timestamp - timespan_s) },
          'txcount': { $gt: 1 } 
        }},
        { "$sort": { "timestamp": 1 } },
        //{ "$limit": blockspan },
        { "$group":
          {
            _id: null,
            "blocks": {
              $push: {
                localeTimestamp: "$localeTimestamp",
                txcount: {
                  $subtract: ["$txcount", 1] 
                }
              }
            },
            // add together all txcount minus 1; we don't include coinbase tx in count
            'txtotal': {
              $sum: {
                $subtract: ["$txcount", 1] 
              }
            }
          }
        },
        /*
        { '$project': {
          // filter blocks 
          'blocks': {
            '$filter': {
              'input': '$blocks',
              'as': 'block',
              'cond': {
                '$and': [
                  {'$gte': [{ '$hour': {'$dateFromString': {'dateString': "$$block.localeTimestamp"}}}, 0]},
                  {'$lte': [{ '$hour': {'$dateFromString': {'dateString': "$$block.localeTimestamp"}}}, 23]},
                ]
              }
            }
          },
          // keep previous txtotal
          'txtotal': '$txtotal'
        }},
        */
      ];
      
      Block.aggregate(agg, function(err, result) {
        var arranged_data = {};
        async.each(result[0].blocks, function(block, cb2) {
          arranged_data[block.localeTimestamp] = block.txcount;
          cb2();
        }, function(err) {
          // return plot data and total tx count
          return cb(Object.entries(arranged_data), result[0].txtotal);
        });
      });
    });
  },
  
  get_charts_reward_distribution: function(timespan, cb) {
    // get most recent block from db as reference point
    find_latest_block(function(b) {
      var blockspan;
      var timespan_s;
      if(timespan == "day") {
        blockspan = 720;
        timespan_s = 86400;
      } else if(timespan == "week") {
        blockspan = 5040;
        timespan_s = 604800;
      } else if(timespan == "month") {
        blockspan = 21600;
        timespan_s = 2592000;
      }
      // last 720 blocks (1 day)
      Block.aggregate([
        { '$match': {
          'timestamp': { '$gte': (b[0].timestamp - timespan_s) }
        }},
        //{ "$sort": {"timestamp": 1} },
        //{ "$limit": blockspan },
        { "$group": {
          _id: null,
          "blocks": { $push: { m: "$minedby" } }
        }},
      ], function(err, result) {
        var arranged_data = {};
        // count number of blocks per miner
        async.each(result[0].blocks, function(block, cb2) {
          arranged_data[block.m] === undefined ? arranged_data[block.m] = 1: arranged_data[block.m]++;
          cb2();
        }, function(err) {
          var total_miners = Object.keys(arranged_data).length;
          var misc_miner_blocks = 0;
          var new_arranged_data = {};
          // we want to combine all small-time miners into single group
          async.eachOf(arranged_data, function(block_count, miner, cb3) {
            block_count > Math.floor(0.03 * blockspan) ? new_arranged_data[miner] = block_count: misc_miner_blocks += block_count;
            cb3();
          }, function(err) {
            var plot_data = Object.entries(new_arranged_data).sort((a, b) => b[1] - a[1]);
            // put misc miners at the end of plot_data
            plot_data.push(["Miscellaneous Miners (<= 3% hashrate each)", misc_miner_blocks]);
            // return sorted plot data and total miner count
            return cb(plot_data, total_miners);
          });
          
        });  
      });
    });
    
  },
  
  get_charts_difficulty: function(timespan, cb) {
    // get most recent block from db as reference point
    find_latest_block(function(b) {
      //var blockspan;
      var timespan_s;
      if(timespan == "default") { // 3 days
        //blockspan = 2160;
        timespan_s = 259200;
      } else if(timespan == "week") {
        //blockspan = 5040;
        timespan_s = 604800;
      } else if(timespan == "month") {
        //blockspan = 21600;
        timespan_s = 2592000;
      } else if(timespan == "quarter") {
        //blockspan = 64800;
        timespan_s = 7776000;
      }
      
      // new aggregation
      var agg = [
        { '$match': {
          'timestamp': { '$gte': (b[0].timestamp - timespan_s) }
        }},
        { "$sort": {"timestamp": 1} },
        //{ "$limit": blockspan },
        { "$group": {
          _id: null,
          "blocks": { $push: { t: "$localeTimestamp", d: "$difficulty" } }
        }},
      ];
      
      // filter agg results depending on blockspan to reduce data load
      if(timespan == 'week') {
        agg.push({
          '$project': {
            // filter blocks 
            'blocks': {
              '$filter': {
                'input': '$blocks',
                'as': 'block',
                'cond': {
                  // get difficulty from 6 blocks from each hour of the day
                  '$and': [
                    { '$gte': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                    { '$lte': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 23]},
                    { '$or': [
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 10]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 20]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 30]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 40]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 50]},
                    ]}
                  ]
                }
              }
            }
          }
        });
      } else if(timespan == 'month') {
        agg.push({
          '$project': {
            // filter blocks 
            'blocks': {
              '$filter': {
                'input': '$blocks',
                'as': 'block',
                'cond': {
                  // get difficulty from 2 blocks per every 4th hour of the day
                  '$and': [
                    { '$or': [
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 4]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 8]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 12]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 16]},
                      { '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 20]},
                    ]},
                    { '$or': [
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]},
                      { '$eq': [{ '$minute': {'$dateFromString': {'dateString': "$$block.t"}}}, 30]},
                    ]}
                  ]
                }
              }
            }
          }
        });
      } else if(timespan == 'quarter') {
        agg.push({
          '$project': {
            // filter blocks 
            'blocks': {
              '$filter': {
                'input': '$blocks',
                'as': 'block',
                'cond': {
                  // get difficulty from 1 block per day
                  '$eq': [{ '$hour': {'$dateFromString': {'dateString': "$$block.t"}}}, 0]
                }
              }
            }
          }
        });
      }
      
      Block.aggregate(agg, function(err, result) {
        var plot_data = [];
        async.each(result[0].blocks, function(block, cb2) {
          plot_data.push(Object.values(block));
          cb2();
        }, function(err) {
          return cb(plot_data);
        });
      });
    });
    
    /*
    // old query
    Block.find({}, {_id: 0, localeTimestamp: 1, difficulty: 1}).sort({timestamp: -1}).limit(2160).exec(function(err, blocks2) {
      var plot_data = [];
      async.each(blocks2, function(block, cb2) {
        //var localeTimestamp = new Date(block.timestamp * 1000).toLocaleString('en-us', {timeZone:"UTC"});
        plot_data.push([block.localeTimestamp, block.difficulty]);
        cb2();
      }, function(err) {
        return cb(plot_data);
      });
    });
    */
  },
  
  // Polls the Charts db for latest aggregate data
  get_charts: function(cb) {
    Charts.findOne().exec(function(err, data) {
      return cb(data._doc);
    });
  },
  
  get_block: function(height, cb) {
    find_block(height, function(block) {
      return cb(block);
    })
  },

  get_tx: function(txid, cb) {
    find_tx(txid, function(tx){
      return cb(tx);
    });
  },

  get_txs: function(block, cb) {
    var txs = [];
    lib.syncLoop(block.tx.length, function (loop) {
      var i = loop.iteration();
      find_tx(block.tx[i], function(tx){
        if (tx) {
          txs.push(tx);
          loop.next();
        } else {
          loop.next();
        }
      })
    }, function(){
      return cb(txs);
    });
  },

  create_txs: function(block, cb) {
    is_locked("db_index", function (exists) {
      if (exists) {
        console.log("db_index lock file exists...");
        return cb();
      } else {
        lib.syncLoop(block.tx.length, function (loop) {
          var i = loop.iteration();
          save_tx(block.tx[i], block.height, function(err){
            if (err) {
              loop.next();
            } else {
              //console.log('tx stored: %s', block.tx[i]);
              loop.next();
            }
          });
        }, function(){
          return cb();
        });
      }
    });
  },
  
  get_last_blocks_ajax: function(start, length, cb) {
    Block.find({}).count(function(err, count) {
      Block.find({}).sort({'height': -1}).skip(Number(start)).limit(Number(length)).exec(function(err, blocks) {
        if (err) {
          return cb(err);
        } else {
          return cb(blocks, count);
        }
      });
    });
  },

  get_last_txs_ajax: function(start, length, min, cb) {
    Tx.find({'total': {$gte: min}}).count(function(err, count){
      Tx.find({'total': {$gte: min}}).sort({blockindex: -1}).skip(Number(start)).limit(Number(length)).exec(function(err, txs){
        if (err) {
          return cb(err);
        } else {
          return cb(txs, count);
        }
      });
    });
  },

  get_address_txs_ajax: function(hash, start, length, cb) {
    var totalCount = 0;
    AddressTx.find({a_id: hash}).count(function(err, count){
      if(err) {
        return cb(err);
      } else {
        totalCount = count;
        AddressTx.aggregate([
          { $match: { a_id: hash } },
          { $sort: {blockindex: -1} },
          { $skip: Number(start) },
          {
            $group: {
              _id: '',
              balance: { $sum: '$amount' }
            }
          },
          {
            $project: {
              _id: 0,
              balance: '$balance'
            }
          },
          { $sort: {blockindex: -1} }
        ], function (err,balance_sum) {
          if (err) {
            return cb(err);
          } else {
            // BUG: Order parent->child transactions properly in address history (prevent negative Balance)
            // add sort for ascending amount
            AddressTx.find({a_id: hash}).sort({blockindex: -1}).sort({amount: 1}).skip(Number(start)).limit(Number(length)).exec(function (err, address_tx) {
              if (err) {
                return cb(err);
              } else {
                var txs = [];
                var count = address_tx.length;
                var running_balance = balance_sum.length > 0 ? balance_sum[0].balance : 0;

                var txs = [];

                lib.syncLoop(count, function (loop) {
                  var i = loop.iteration();
                  find_tx(address_tx[i].txid, function (tx) {
                    if (tx && !txs.includes(tx)) {
                      tx.balance = running_balance;
                      txs.push(tx);
                      loop.next();
                    } else if (!txs.includes(tx)) {
                      txs.push("1. Not found");
                      loop.next();
                    } else {
                      loop.next();
                    }
                    running_balance = running_balance - address_tx[i].amount;
                  })
                }, function () {
                  return cb(txs, totalCount);
                });
              }
            });
          }
        });
      }
    });
  },

  create_market: function(coin, exchange, market, cb) {
    var newMarkets = new Markets({
      market: market,
      coin: coin,
      exchange: exchange,
    });

    newMarkets.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial markets entry created for %s", market);
        //console.log(newMarkets);
        return cb();
      }
    });
  },

  // checks market data exists for given market
  check_market: function(market, cb) {
    Markets.findOne({market: market}, function(err, exists) {
      if(exists) {
        return cb(market, true);
      } else {
        return cb(market, false);
      }
    });
  },

  // gets market data for given market
  get_market: function(market, cb) {
    Markets.findOne({market: market}, function(err, data) {
      if(data) {
        return cb(data);
      } else {
        return cb(null);
      }
    });
  },

  // creates initial richlist entry in database; called on first launch of explorer
  create_richlist: function(coin, cb) {
    var newRichlist = new Richlist({
      coin: coin,
    });
    newRichlist.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial richlist entry created for %s", coin);
        //console.log(newRichlist);
        return cb();
      }
    });
  },

  // drops richlist data for given coin
  delete_richlist: function(coin, cb) {
    Richlist.findOneAndRemove({coin: coin}, function(err, exists) {
      if(exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },
  // checks richlist data exists for given coin
  check_richlist: function(coin, cb) {
    Richlist.findOne({coin: coin}, function(err, exists) {
      if(exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  create_heavy: function(coin, cb) {
    var newHeavy = new Heavy({
      coin: coin,
    });
    newHeavy.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        console.log("initial heavy entry created for %s", coin);
        console.log(newHeavy);
        return cb();
      }
    });
  },

  check_heavy: function(coin, cb) {
    Heavy.findOne({coin: coin}, function(err, exists) {
      if(exists) {
        return cb(true);
      } else {
        return cb(false);
      }
    });
  },

  get_heavy: function(coin, cb) {
    Heavy.findOne({coin: coin}, function(err, heavy) {
      if(heavy) {
        return cb(heavy);
      } else {
        return cb(null);
      }
    });
  },
  get_distribution: function(richlist, stats, cb){
    var distribution = {
      supply: stats.supply,
      t_1_25: {percent: 0, total: 0 },
      t_26_50: {percent: 0, total: 0 },
      t_51_75: {percent: 0, total: 0 },
      t_76_100: {percent: 0, total: 0 },
      t_101plus: {percent: 0, total: 0 }
    };
    lib.syncLoop(richlist.balance.length, function (loop) {
      var i = loop.iteration();
      var count = i + 1;
      var percentage = ((richlist.balance[i].balance / 1000000) / stats.supply) * 100;
      if (count <= 25 ) {
        distribution.t_1_25.percent = distribution.t_1_25.percent + percentage;
        distribution.t_1_25.total = distribution.t_1_25.total + (richlist.balance[i].balance / 1000000);
      }
      if (count <= 50 && count > 25) {
        distribution.t_26_50.percent = distribution.t_26_50.percent + percentage;
        distribution.t_26_50.total = distribution.t_26_50.total + (richlist.balance[i].balance / 1000000);
      }
      if (count <= 75 && count > 50) {
        distribution.t_51_75.percent = distribution.t_51_75.percent + percentage;
        distribution.t_51_75.total = distribution.t_51_75.total + (richlist.balance[i].balance / 1000000);
      }
      if (count <= 100 && count > 75) {
        distribution.t_76_100.percent = distribution.t_76_100.percent + percentage;
        distribution.t_76_100.total = distribution.t_76_100.total + (richlist.balance[i].balance / 1000000);
      }
      loop.next();
    }, function(){
      distribution.t_101plus.percent = parseFloat(100 - distribution.t_76_100.percent - distribution.t_51_75.percent - distribution.t_26_50.percent - distribution.t_1_25.percent).toFixed(2);
      distribution.t_101plus.total = parseFloat(distribution.supply - distribution.t_76_100.total - distribution.t_51_75.total - distribution.t_26_50.total - distribution.t_1_25.total).toFixed(8);
      distribution.t_1_25.percent = parseFloat(distribution.t_1_25.percent).toFixed(2);
      distribution.t_1_25.total = parseFloat(distribution.t_1_25.total).toFixed(6);
      distribution.t_26_50.percent = parseFloat(distribution.t_26_50.percent).toFixed(2);
      distribution.t_26_50.total = parseFloat(distribution.t_26_50.total).toFixed(6);
      distribution.t_51_75.percent = parseFloat(distribution.t_51_75.percent).toFixed(2);
      distribution.t_51_75.total = parseFloat(distribution.t_51_75.total).toFixed(6);
      distribution.t_76_100.percent = parseFloat(distribution.t_76_100.percent).toFixed(2);
      distribution.t_76_100.total = parseFloat(distribution.t_76_100.total).toFixed(6);
      return cb(distribution);
    });
  },
  // updates heavy stats for coin
  // height: current block height, count: amount of votes to store
  update_heavy: function(coin, height, count, cb) {
    var newVotes = [];
    lib.get_maxmoney( function (maxmoney) {
      lib.get_maxvote( function (maxvote) {
        lib.get_vote( function (vote) {
          lib.get_phase( function (phase) {
            lib.get_reward( function (reward) {
              lib.get_supply( function (supply) {
                lib.get_estnext( function (estnext) {
                  lib.get_nextin( function (nextin) {
                    lib.syncLoop(count, function (loop) {
                      var i = loop.iteration();
                      lib.get_blockhash(height-i, function (hash) {
                        lib.get_block(hash, function (block) {
                          newVotes.push({count:height-i,reward:block.reward,vote:block.vote});
                          loop.next();
                        });
                      });
                    }, function(){
                      console.log(newVotes);
                      Heavy.updateOne({coin: coin}, {
                        lvote: vote,
                        reward: reward,
                        supply: supply,
                        cap: maxmoney,
                        estnext: estnext,
                        phase: phase,
                        maxvote: maxvote,
                        nextin: nextin,
                        votes: newVotes,
                      }, function() {
                        //console.log('address updated: %s', hash);
                        return cb();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },
  
  update_charts_db: function(cb) {
    module.exports.get_charts_txs('day', function(txsDay, txsDay_count) {
      module.exports.get_charts_txs('week', function(txsWeek, txsWeek_count) {
        module.exports.get_charts_txs('month', function(txsMonth, txsMonth_count) {
          module.exports.get_charts_reward_distribution('day', function(miningDistDay, totalMinersDay) {
            module.exports.get_charts_reward_distribution('week', function(miningDistWeek, totalMinersWeek) {
              module.exports.get_charts_difficulty('week', function(difficultyWeek) {
                module.exports.get_charts_difficulty('month', function(difficultyMonth) {
                  module.exports.get_charts_difficulty('quarter', function(difficultyQuarter) {
                    Charts.findOneAndUpdate({}, {
                      txsDay: txsDay,
                      txsDay_count: txsDay_count,
                      txsWeek: txsWeek,
                      txsWeek_count: txsWeek_count,
                      txsMonth: txsMonth,
                      txsMonth_count: txsMonth_count,
                      miningDistDay: miningDistDay,
                      totalMinersDay: totalMinersDay,
                      miningDistWeek: miningDistWeek,
                      totalMinersWeek: totalMinersWeek,
                      difficultyWeek: difficultyWeek,
                      difficultyMonth: difficultyMonth,
                      difficultyQuarter: difficultyQuarter
                    }, {
                      upsert: true,
                    }, function() {
                      return cb();
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  },

  // updates market data for given market; called by sync.js
  update_markets_db: function(market, cb) {
    get_market_data(market, function (err, obj) {
      if (err == null) {
        Markets.updateOne({market:market}, {
          chartdata: JSON.stringify(obj.chartdata),
          buys: obj.buys,
          sells: obj.sells,
          history: obj.trades,
          summary: obj.stats,
        }, function() {
          if ( market == settings.markets.default ) {
            Stats.updateOne({coin:settings.coin}, {
              last_price: obj.stats.last,
            }, function(){
              return cb(null);
            });
          } else {
            return cb(null);
          }
        });
      } else {
        return cb(err);
      }
    });
  },

  // updates stats data for given coin; called by sync.js
  update_db: function(coin, cb) {
    lib.get_blockcount( function (count) {
      if (!count){
        console.log('Unable to connect to explorer API');
        return cb(false);
      }
      lib.get_supply( function (supply){
        lib.get_burned_supply(function(burned) {
          lib.get_connectioncount(function (connections) {
            Stats.findOneAndUpdate({coin: coin}, {
              $set: {
                coin: coin,
                count : count,
                supply: supply,
                burned: burned,
                connections: connections
              }
            }, {
              new: true
            }, function(err, new_stats) {
              if(err) {
                console.log("Error during Stats Update:", err);
              }
              return cb({coin: coin,
                count : count,
                supply: supply,
                burned: burned,
                connections: connections,
                last: (new_stats.last ? new_stats.last : 0)});
            });
          });
        });
      });
    });
  },

  // updates tx, address & richlist db's; called by sync.js
  update_tx_db: function(coin, start, end, timeout, cb) {
    is_locked("db_index", function (exists) {
      if (exists) {
        console.log("db_index lock file exists...");
        return cb();
      } else {
        create_lock("db_index", function (){
          if (start < 1) { start = 1; }
          var complete = false;
          var blocks_to_scan = [];
          var task_limit_blocks = settings.block_parallel_tasks;
          if (task_limit_blocks < 1) { task_limit_blocks = 1; }
          var task_limit_txs = 1;
          for (i=start; i<(end+1); i++) {
            blocks_to_scan.push(i);
          }
          async.eachLimit(blocks_to_scan, task_limit_blocks, function(block_height, next_block) {
            if (block_height % 5000 === 0) {
              Stats.updateOne({coin: coin}, {
                last: block_height - 1,
                last_txs: '' //not used anymore left to clear out existing objects
              }, function() {});
            }
            lib.get_blockhash(block_height, function(blockhash){
              if (blockhash) {
                lib.get_block(blockhash, function(block) {
                  if (block) {
                    var block_burned_xpi = 0;
                    async.eachLimit(block.tx, task_limit_txs, function(txid, next_tx) {
                      save_tx(txid, block_height, function(err){
                        // "err" could be "txburned", so we do isNaN(err) to make sure
                        if (isNaN(err)) {
                          console.log(err);
                        } else {
                          // if err is a number, assumed txburned value
                          block_burned_xpi += err;
                          console.log('%s: %s', block_height, txid);
                        }
                        setTimeout( function(){
                          tx = null;
                          next_tx();
                        }, timeout);
                      });
                      /*
                      Tx.findOne({txid: txid}, function(err, tx) {
                        if(tx) {
                          setTimeout( function(){
                            tx = null;
                            next_tx();
                          }, timeout);
                        } else {
                          
                        }
                      });
                      */
                    // save the block stats after all the tx from the block have been saved
                    }, function() {
                      save_block(block, block_burned_xpi, function(err){
                        if(err) {
                          console.log(err);
                        } else {
                          console.log('-- Block %s saved', block_height);
                        }
                        setTimeout( function(){
                          blockhash = null;
                          block = null;
                          next_block();
                        }, timeout);
                      });
                    });
                  } else {
                    console.log('block not found: %s', blockhash);
                    setTimeout( function(){
                      next_block();
                    }, timeout);
                  }
                });
              } else {
                setTimeout( function(){
                  next_block();
                }, timeout);
              }
            });
          }, function(){
            Tx.find({}).sort({timestamp: 'desc'}).limit(settings.index.last_txs).exec(function(err, txs){
              Stats.updateOne({coin: coin}, {
                last: end,
                last_txs: '' //not used anymore left to clear out existing objects
              }, function() {
                remove_lock("db_index", function(){
                  return cb();
                });
              });
            });
          });
        });
      }
    });
  },

  create_peer: function(params, cb) {
    var newPeer = new Peers(params);
    newPeer.save(function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        return cb();
      }
    });
  },

  find_peer: function(address, cb) {
    Peers.findOne({address: address}, function(err, peer) {
      if (err) {
        return cb(null);
      } else {
        if (peer) {
         return cb(peer);
       } else {
         return cb (null)
       }
      }
    })
  },

  drop_peer: function(address, cb) {
    Peers.deleteOne({address: address}, function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        return cb();
      }
    })
  },

  drop_peers: function(cb) {
    Peers.deleteMany({}, function(err) {
      if (err) {
        console.log(err);
        return cb();
      } else {
        return cb();
      }
    })
  },

  get_peers: function(cb) {
    Peers.find({}, function(err, peers) {
      if (err) {
        return cb([]);
      } else {
        return cb(peers);
      }
    });
  }
};

