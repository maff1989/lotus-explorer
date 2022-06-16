var express = require('express')
    , router = express.Router()
    , settings = require('../lib/settings')
    , locale = require('../lib/locale')
    , db = require('../lib/database')
    , lib = require('../lib/explorer')
    , qr = require('qr-image');

/* GET functions */
function route_get_block(res, blockhash) {
  lib.get_block(blockhash, function (block) {
  	// check if block was orphaned
  	if(block.confirmations === -1) {
  	  // if orphaned, get hash of accepted block and redirect with error
  	  lib.get_blockhash(block.height, function(replacement_block) {
  	  	route_get_index(res, 'This block at height ' + block.height + ' was orphaned by: ' + replacement_block);
  	  });
  	} else if (block != 'There was an error. Check your console.') {
      if (blockhash == settings.genesis_block) {
        res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: 'GENESIS'});
      } else {
        db.get_block(block.height, function(db_block) {
          block = {...db_block._doc, ...block };
          db.get_txs(block, function(txs) {
            if (txs.length > 0) {
              res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: txs});
            } else {
              db.create_txs(block, function(){
                db.get_txs(block, function(ntxs) {
                  if (ntxs.length > 0) {
                    res.render('block', { active: 'block', block: block, confirmations: settings.confirmations, txs: ntxs});
                  } else {
                    route_get_index(res, 'Block not found: ' + blockhash);
                  }
                });
              });
            }
          });
        });
      }
    } else {
      if (!isNaN(blockhash)) {
        var height = blockhash;
        lib.get_blockhash(height, function(hash) {
          if (hash != 'There was an error. Check your console.') {
            res.redirect('/block/' + hash);
          } else {
            route_get_index(res, 'Block not found: ' + blockhash);
          }
        });
      } else {
        route_get_index(res, 'Block not found: ' + blockhash);
      }
    }
  });
}

function route_get_tx(res, txid) {
  if (txid == settings.genesis_tx) {
    route_get_block(res, settings.genesis_block);
  } else {
    db.get_tx(txid, function(tx) {
      if (tx) {
      	lib.get_block(tx.blockhash, function(block) {
          // if block has been orphaned then redirect with error
          if(block.confirmations === -1) {
      	    lib.get_blockhash(block.height, function(replacement_block) {
      	    	route_get_index(res, "Transaction was orphaned by block: " + replacement_block);
      	    });
      	    
      	  } else {
            lib.get_blockcount(function(blockcount) {
              res.render('tx', { active: 'tx', tx: tx, confirmations: settings.confirmations, blockcount: blockcount});
            });
      	  }
      	});
      }
      else {
        lib.get_rawtransaction(txid, function(rtx) {
          if (rtx.txid) {
            // get details of block containing the tx
            lib.get_block(rtx.blockhash, function(block) {
              // if block has been orphaned then redirect with error
              if(block.confirmations === -1) {	
                lib.get_blockhash(block.height, function(replacement_block) {
      	    	  route_get_index(res, "Transaction was orphaned by block: " + replacement_block);
      	        });
	            // if block is valid, continue normally
              } else {
                lib.prepare_vin(rtx, function(vin) {
                  lib.prepare_vout(rtx.vout, rtx.txid, vin, function(rvout, rvin) {
                    // if the transaction is not confirmed then get missing details using getrawmempool
                    if (!rtx.confirmations > 0) {
                      lib.get_rawmempool(function(rawmempool) {
                        // redirect with error if mempool transaction doesn't exist
                        if(rawmempool[rtx.txid] === undefined) {
                          route_get_index(res, "Not a mempool transaction: " + rtx.txid);
                        }
                        var utx = {
                          txid: rtx.txid,
                          size: rtx.size,
                          // convert fee to satoshis
                          fee: rawmempool[rtx.txid].fee * 1000000,
                          vin: rvin,
                          vout: rvout,
                          //total: total.toFixed(8),
                          timestamp: rawmempool[rtx.txid].time,
                          blockhash: '-',
                          // there is no blockindex if the tx is in mempool
                          // blockindex: -1,
                        };
                        res.render('tx', { active: 'tx', tx: utx, confirmations: settings.confirmations, blockcount:-1});
                      });
                    } else {
                      lib.calculate_fee(rvout, rvin, function(fee) {
                        var utx = {
                          txid: rtx.txid,
                          size: rtx.size,
                          fee: fee,
                          vin: rvin,
                          vout: rvout,
                          //total: total.toFixed(8),
                          timestamp: rtx.time,
                          blockhash: rtx.blockhash,
                          blockindex: rtx.blockheight,
                        };
                        lib.get_blockcount(function(blockcount) {
                          res.render('tx', { active: 'tx', tx: utx, confirmations: settings.confirmations, blockcount: blockcount});
                        });
                      });
                    }
                  });
	              });
              }
            });
          } else {
            route_get_index(res, null);
          }
        });
      }
    });
  }
}

function route_get_index(res, error) {
  db.is_locked(function(locked) {
    if (locked) {
      res.render('index', { active: 'home', error: error, warning: locale.initial_index_alert});
    } else {
      res.render('index', { active: 'home', error: error, warning: null});
    }
  });
}

function route_get_address(res, hash, count) {
  db.get_address(hash, function(address) {
    if (address) {
      var txs = [];
      res.render('address', { active: 'address', address: address, txs: txs});
    } else {
      route_get_index(res, hash + ' not found');
    }
  });
}

function route_get_claim_form(res, hash){
  db.get_address(hash, function(address) {
    if (address) {
      res.render("claim_address", { active: "address", address: address});
    } else {
      route_get_index(res, hash + ' not found');
    }
  });
}

/* GET home page. */
router.get('/', function(req, res) {
  route_get_index(res, null);
});

router.get('/info', function(req, res) {
  res.render('info', { active: 'info', address: settings.address, hashes: settings.api });
});

router.get('/markets/:market', function(req, res) {
  var market = req.params['market'];
  if (settings.markets.enabled.indexOf(market) != -1) {
    db.get_market(market, function(data) {
      /*if (market === 'bittrex') {
        data = JSON.parse(data);
      }*/
      // console.log(data);
      res.render('./markets/' + market, {
        active: 'markets',
        marketdata: {
          coin: settings.markets.coin,
          exchange: settings.markets.exchange,
          data: data,
        },
        market: market
      });
    });
  } else {
    route_get_index(res, null);
  }
});

router.get('/richlist', function(req, res) {
  if (settings.display.richlist == true ) {
    db.get_stats(settings.coin, function (stats) {
      db.get_richlist(settings.coin, function(richlist){
        //console.log(richlist);
        if (richlist) {
          db.get_distribution(richlist, stats, function(distribution) {
            //console.log(distribution);
            res.render('richlist', {
              active: 'richlist',
              balance: richlist.balance,
              received: richlist.received,
              stats: stats,
              dista: distribution.t_1_25,
              distb: distribution.t_26_50,
              distc: distribution.t_51_75,
              distd: distribution.t_76_100,
              diste: distribution.t_101plus,
              show_dist: settings.richlist.distribution,
              show_received: settings.richlist.received,
              show_balance: settings.richlist.balance,
            });
          });
        } else {
          route_get_index(res, null);
        }
      });
    });
  } else {
    route_get_index(res, null);
  }
});

router.get('/charts', function(req, res) {
  if (settings.display.charts === true ) {
    
    db.get_charts(function(charts) {
      res.render('charts', {
        active: 'charts',
        ...charts
      });
    });
    
  } else {
    route_get_index(res, null);
  }
});

router.get('/movement', function(req, res) {
  res.render('movement', {active: 'movement', flaga: settings.movement.low_flag, flagb: settings.movement.high_flag, min_amount:settings.movement.min_amount});
});

router.get('/network', function(req, res) {
  res.render('network', {active: 'network'});
});

router.get('/reward', function(req, res){
  db.get_heavy(settings.coin, function (heavy) {
    //heavy = heavy;
    var votes = heavy.votes;
    votes.sort(function (a,b) {
      if (a.count < b.count) {
        return -1;
      } else if (a.count > b.count) {
        return 1;
      } else {
        return 0;
      }
    });

    res.render('reward', { active: 'reward', stats: stats, heavy: heavy, votes: heavy.votes });
  });
});

router.get('/tx/:txid', function(req, res) {
  route_get_tx(res, req.params.txid);
});

router.get('/block/:hash', function(req, res) {
  route_get_block(res, req.params.hash);
});

router.get('/address/:hash/claim', function(req,res){
  route_get_claim_form(res, req.params.hash);
});

router.get('/address/:hash', function(req, res) {
  route_get_address(res, req.params.hash, settings.txcount);
});

router.get('/address/:hash/:count', function(req, res) {
  route_get_address(res, req.params.hash, req.params.count);
});

router.post('/search', function(req, res) {
  var query = req.body.search;
  if (query.length == 64) {
    if (query == settings.genesis_tx) {
      res.redirect('/block/' + settings.genesis_block);
    } else {
      db.get_tx(query, function(tx) {
        if (tx) {
          res.redirect('/tx/' +tx.txid);
        } else {
          // if tx not in database, check mempool
          lib.get_rawmempool(function(rawmempool) {
            if(rawmempool[query]) {
              res.redirect('/tx/' + query);
            } else {
              // otherwise get the block from db  
              lib.get_block(query, function(block) {
                if (block != 'There was an error. Check your console.') {
                  res.redirect('/block/' + query);
                } else {
                  route_get_index(res, locale.ex_search_error + query );
                }
              });
            }
          });
        }
      });
    }
  } else {
    db.get_address(query, function(address) {
      if (address) {
        res.redirect('/address/' + address.a_id);
      } else {
        lib.get_blockhash(query, function(hash) {
          if (hash != 'There was an error. Check your console.') {
            res.redirect('/block/' + hash);
          } else {
            route_get_index(res, locale.ex_search_error + query );
          }
        });
      }
    });
  }
});

router.get('/qr/:string', function(req, res) {
  if (req.params.string) {
    var address = qr.image(req.params.string, {
      type: 'png',
      size: 4,
      margin: 1,
      ec_level: 'M'
    });
    res.type('png');
    address.pipe(res);
  }
});

router.get('/ext/summary', function(req, res) {
  lib.get_difficulty(function(difficulty) {
    difficultyHybrid = ''
    if (difficulty['proof-of-work']) {
      if (settings.index.difficulty == 'Hybrid') {
        difficultyHybrid = 'POS: ' + difficulty['proof-of-stake'];
        difficulty = 'POW: ' + difficulty['proof-of-work'];
      } else if (settings.index.difficulty == 'POW') {
        difficulty = difficulty['proof-of-work'];
      } else {
        difficulty = difficulty['proof-of-stake'];
      }
    }
    lib.get_hashrate(function(hashrate) {
      lib.get_connectioncount(function(connections){
        lib.get_blockcount(function(blockcount) {
          lib.get_mempoolinfo(function(mempoolinfo) {
          	db.get_stats(settings.coin, function (stats) {
              if (hashrate == 'There was an error. Check your console.') {
                hashrate = 0;
              }
              res.send({ data: [{
                difficulty: difficulty,
                difficultyHybrid: difficultyHybrid,
                supply: stats.supply,
                burned: stats.burned,
                hashrate: hashrate,
                lastPrice: stats.last_price,
                connections: connections,
                blockcount: blockcount,
                mempoolinfo: mempoolinfo
              }]});
            });
          });
        });
      });
    });
  });
});
module.exports = router;
