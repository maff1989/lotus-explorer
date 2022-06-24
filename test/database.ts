const settings = require('../lib/settings');
import { Database } from '../lib/database';


const dbString = 'mongodb://' + settings.dbsettings.user
  + ':' + settings.dbsettings.password
  + '@' + settings.dbsettings.address
  + ':' + settings.dbsettings.port
  + '/' + settings.dbsettings.database;
const db = new Database();

const main = async () => {
  await db.connect(dbString);
  const isLocked = await db.is_locked();
  const stats = await db.get_stats('Lotus');

  console.log('isLocked', isLocked);
  console.log('stats', stats);
  await db.disconnect();
};
main();