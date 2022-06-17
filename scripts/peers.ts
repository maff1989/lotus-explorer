const db = require('../lib/database')
  , settings = require('../lib/settings');
import * as mongoose from 'mongoose';
import * as request from 'async-request';

function exit() {
  mongoose.disconnect();
  process.exit(0);
}

type NodePeer = {
	addr: string,
	version: string,
	subver: string,
};

type DbPeer = {
	address: string,
	port: number,
	protocol: string,
	country: string,
	country_code: string
};

const dbString = 'mongodb://' + settings.dbsettings.user
	+ ':' + settings.dbsettings.password
	+ '@' + settings.dbsettings.address
	+ ':' + settings.dbsettings.port
	+ '/' + settings.dbsettings.database;

mongoose.connect(dbString, function(err) {
  if (err) {
    console.log('Unable to connect to database: %s', dbString);
    console.log('Aborting');
    exit();
	}
	// get all peers from db
	db.get_peers(async db_peers => {
		// put all peer IP addresses into array
		const db_peer_ips: string[] = db_peers.map(function(obj, i, array) {
			return obj.address;
		});
		// get current connected peers from node
		const body = await request('http://127.0.0.1:' + settings.port + '/api/getpeerinfo', {json: true});
		// get all of the IP addresses of the node peers
		const nodePeers: NodePeer[] = [];
		body.forEach((peer: NodePeer) => {
			const { addr, version, subver } = peer;
			const index = peer.addr.lastIndexOf(":");
			const portSplit = (index < 0)
				? peer.addr.length
				: parseInt(peer.addr.substring(index + 1));
			// keep IP address
			nodePeers.push({ addr: addr.substring(0, portSplit), version, subver });
		});
		// process all of the node peers accordingly
		nodePeers.forEach(nodePeer => {
			db.find_peer(nodePeer.addr, async (dbPeer: DbPeer) => {
				if (!dbPeer) {
					// convert IPv6 into proper format for GeoIP lookup
					// also set ipv6_address const for GeoIP lookup; save address const to db
					const ipv6_address = nodePeer.addr.includes(':')
						? nodePeer.addr.replace(/^\[(([0-9a-f]{0,4}:?){1,8})\]$/, '$1')
						: null;
					const geo = await request('https://json.geoiplookup.io/' + (ipv6_address
						? ipv6_address
						: nodePeer.addr
					));
					db.create_peer({
						address: nodePeer.addr,
						port: 10605,
						protocol: nodePeer.version,
						version: nodePeer.subver.replace('/', '').replace('/', ''),
						country: geo.country_name,
						country_code: geo.country_code
					} as DbPeer);
				// peer already exists
				} else {
					// 
					if (isNaN(dbPeer['port']) || dbPeer['country'].length < 1 || dbPeer['country_code'].length < 1) {
						db.drop_peers(function() {
							console.log('Saved peers missing ports or country, dropping peers. Re-reun this script afterwards.');
							console.log('Peer:', dbPeer)
							exit();
						});
					}
				}
			});
		});
		// db peers that are not in node's peer list are considered dead
		const dead_peer_ips: string[] = db_peer_ips.filter(ip => {
			return nodePeers.findIndex(peer => ip == peer.addr) < 0
		});
		dead_peer_ips.forEach(ip => {
			db.drop_peer(ip, () => console.log("Dropped dead peer: " + ip))
		});
	});
});
