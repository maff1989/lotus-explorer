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

  console.log('isLocked', isLocked);
  await db.disconnect();
};
main();