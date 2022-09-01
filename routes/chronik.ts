import express from 'express';
import { ChronikClient } from 'chronik-client';
import { Script, Address } from '@abcpros/bitcore-lib-xpi';
import settings from '../lib/settings';

const chronikClient = new ChronikClient(
    `http://${settings.chronik.host}:
    ${settings.chronik.port}/
    ${settings.chronik.uri}`
  );
const chronikRouter = express.Router();

chronikRouter.get('/utxos/:address', async (req, res) => {
  const { address } = req.params;
  try {
    if (!Address.isValid(address)) {
      throw new Error('address is invalid');
    }
    const decoded = Script.fromAddress(String(address));
    const pkh = decoded.getPublicKeyHash().toString('hex');
    const script = chronikClient.script('p2pkh', pkh);
    return res.send(await script.utxos());
  } catch (e: any) {
    console.log(`${req.url}: ${e.message}`);
    return res.send({ error: `failed to fetch UTXOs for ${address}` })
  }
});

export default chronikRouter;
