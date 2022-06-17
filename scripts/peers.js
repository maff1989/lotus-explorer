var mongoose = require('mongoose')
  , lib = require('../lib/explorer')
  , db = require('../lib/database')
  , settings = require('../lib/settings')
  , request = require('request')
  , async = require('async');

var COUNT = 5000; //number of blocks to index

function exit() {
  mongoose.disconnect();
  process.exit(0);
}

var dbString = 'mongodb://' + settings.dbsettings.user;
dbString = dbString + ':' + settings.dbsettings.password;
dbString = dbString + '@' + settings.dbsettings.address;
dbString = dbString + ':' + settings.dbsettings.port;
dbString = dbString + '/' + settings.dbsettings.database;

mongoose.connect(dbString, function(err) {
  if (err) {
    console.log('Unable to connect to database: %s', dbString);
    console.log('Aborting');
    exit();
  } else {
    // get all peers from db
    db.get_peers(function(db_peers) {
      // put all peer IP addresses into array
      var db_peer_ips = db_peers.map(function(obj, i, array) {
        return obj.address;
      });
      // get current connected peers from node
      request({uri: 'http://127.0.0.1:' + settings.port + '/api/getpeerinfo', json: true}, function (error, response, body) {
        // get all of the IP addresses of the node peers
        var node_peer_ips = [];
        async.each(body, function(peer, cb){
          var portSplit = peer.addr.lastIndexOf(":");
          if (portSplit < 0) {
            portSplit = peer.addr.length;
          } else {
            port = peer.addr.substring(portSplit+1);
          }
          // keep IP address
          node_peer_ips.push(peer.addr.substring(0,portSplit));
          // onto the next
          cb();
        }, function(err){
	        // db peers that are not in node's peer list are considered dead
	        var dead_peer_ips = db_peer_ips.filter((ip) => !node_peer_ips.includes(ip));
	        // process all of the node peers accordingly
	        lib.syncLoop(body.length, function (loop) {
	          var i = loop.iteration();
	          var portSplit = body[i].addr.lastIndexOf(":");
	          var port = "";
	          if (portSplit < 0) {
	            portSplit = body[i].addr.length;
	          } else {
	            port = body[i].addr.substring(portSplit+1);
	          }
	          var address = body[i].addr.substring(0,portSplit);
						// convert IPv6 into proper format for GeoIP lookup
						// also set ipv6_address var for GeoIP lookup; save address var to db
						var ipv6_address = address.includes(':') ? address.replace(/^\[(([0-9a-f]{0,4}:?){1,8})\]$/, '$1'): null;
						console.log(address);
	          db.find_peer(address, function(peer) {
	            if (peer) {
	              if (isNaN(peer['port']) || peer['port'].length < 2 || peer['country'].length < 1 || peer['country_code'].length < 1) {
	                db.drop_peers(function() {
	                  console.log('Saved peers missing ports or country, dropping peers. Re-reun this script afterwards.');
	                  console.log('Peer:', peer)
	                  exit();
	                });
	              }
	              // peer already exists
	              loop.next();
	            } else {
	              request({uri: 'https://json.geoiplookup.io/' + (ipv6_address ? ipv6_address: address), json: true}, function (error, response, geo) {
	                db.create_peer({
	                  address: address,
	                  port: port,
	                  protocol: body[i].version,
	                  version: body[i].subver.replace('/', '').replace('/', ''),
	                  country: geo.country_name,
	                  country_code: geo.country_code
	                }, function(){
	                  loop.next();
	                });
	              });
	            }
	          });
	        }, function() {
	          // drop all dead peers from db after processing node peer IPs
	          lib.syncLoop(dead_peer_ips.length, function(loop) {
	            var i = loop.iteration();
	            var address = dead_peer_ips[i];
	            db.drop_peer(address, function() {
	              console.log("Dropped peer: " + address);
	              loop.next();
	            });
	          }, function() {
	            exit();
	          });
	        });
        	
        });
      });
    });
    
  }
});
