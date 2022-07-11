import request from 'request-promise';
import { Database } from '../lib/database';
import { Explorer } from '../lib/explorer';

const main = async () => {
	const lib = new Explorer();
	const db = new Database();
	try {
		await db.connect();
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
				const ipv6_address = peerAddr.includes(':')
					? peerAddr.replace(/^\[(([0-9a-f]{0,4}:?){1,8})\]$/, '$1')
					: null;
				const geo = await request.get('https://json.geoiplookup.io/' + (ipv6_address
					? ipv6_address
					: peerAddr
				), { json: true });
				await db.create_peer({
					address: peerAddr,
					port: String(10605),
					protocol: String(peer.version),
					version: peer.subver.replace(/\//g, ''),
					country: geo.country_name,
					country_code: geo.country_code
				});
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
		process.exit(0);
	} catch (e: any) {
		console.log(e.message);
		await db.disconnect();
		process.exit(1);
	}
};
main();
