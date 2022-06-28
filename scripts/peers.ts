const settings = require('../lib/settings');
import * as request from 'request-promise';
import { Database } from '../lib/database';
import { Explorer } from '../lib/explorer';

const main = async () => {
	const lib = new Explorer();
	const db = new Database();
	await db.connect('mongodb://' + settings.dbsettings.user
		+ ':' + settings.dbsettings.password
		+ '@' + settings.dbsettings.address
		+ ':' + settings.dbsettings.port
		+ '/' + settings.dbsettings.database);
	
	const getPeerInfo = await lib.get_peerinfo();
	for (const peer of getPeerInfo) {
		console.log('found peer:', peer.addr);
		const index = peer.addr.lastIndexOf(':');
		const peerAddr = peer.addr.substring(0, index);
		const dbPeer = await db.get_peer(peerAddr);
		// do not save this peer if already in db
		// but check it to make sure it's valid
		if (!dbPeer) {
			console.log(`peer ${peerAddr} not found in db; creating...`);
			// convert IPv6 into proper format for GeoIP lookup
			// also set ipv6_address const for GeoIP lookup; save address const to db
			const ipv6_address = peerAddr.includes(':')
				? peerAddr.replace(/^\[(([0-9a-f]{0,4}:?){1,8})\]$/, '$1')
				: null;
			const geo = await request.get('https://json.geoiplookup.io/' + (ipv6_address
				? ipv6_address
				: peerAddr
			));
			try {
				await db.create_peer({
					address: peerAddr,
					port: String(10605),
					protocol: String(peer.version),
					version: peer.subver.replace('/', '').replace('/', ''),
					country: geo.country_name,
					country_code: geo.country_code
				});
			} catch (e: any) {
				throw new Error(`create_peer: ${peerAddr}: ${e.message}`);
			}
		}
	}
	// db peers that are not in node's peer list are considered dead
	const dbPeers = await db.get_peers();
	const deadPeers = dbPeers.filter(dbPeer => {
		return getPeerInfo.findIndex(peer => peer.addr.includes(dbPeer.address)) < 0
	});
	console.log('deadPeers:', deadPeers);
	deadPeers.forEach(async dbPeer => {
		await db.drop_peer(dbPeer.address)
	});
	await db.disconnect();
	process.exit();
};
main();
