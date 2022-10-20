import express from 'express';
import { Chronik } from '../lib/chronik';
import settings from '../lib/settings';

const chronik = new Chronik(
  `http://${settings.chronik.host}:` +
  `${settings.chronik.port}` +
  `${settings.chronik.uri}`
);

const chronikRouter = express.Router();
chronikRouter.get('/utxos/:address', async (req, res) => {
  const address = String(req.params.address);
  try {
    const utxos = await chronik.addressGetUtxos(address);
    return res.json(utxos);
  } catch (e: any) {
    console.log(`${req.originalUrl}: ${e.message}`);
    return res.json({ error: `failed to fetch UTXOs for ${address}` });
  }
});
chronikRouter.get('/history/:address/:page?/:pageSize?', async (req, res) => {
  const { address, page, pageSize } = req.params;
  const p = page ? Number(page): 0;
  const s = pageSize ? Number(pageSize): settings.txcount_per_page;
  try {
    const history = await chronik.addressGetHistory(address, p, s);
    return res.json(history);
  } catch (e: any) {
    console.log(`${req.originalUrl}: ${e.message}`);
    return res.json({ error: `failed to fetch history for ${address}` });
  }
});
chronikRouter.get('/block/:hashOrHeight', async (req, res) => {
  const { hashOrHeight } = req.params;
  const height = Number(hashOrHeight);
  try {
    const block = await chronik.client.block(
      isNaN(height)
        ? hashOrHeight
        : height);
    return res.json(block);
  } catch (e: any) {
    console.log(`${req.originalUrl}: ${e.message}`);
    return res.json({ error: `failed to fetch block for ${hashOrHeight}` });
  }
});
chronikRouter.get('/sendtx/:rawTx', async (req, res) => {
  const rawTx = String(req.params.rawTx);
  const skipSlpCheck = true;
  try {
    const { txid } = await chronik.client.broadcastTx(rawTx, skipSlpCheck);
    return res.json(txid);
  } catch (e: any) {
    console.log(`${req.originalUrl}: ${e.message}`);
    return res.json({ error: `failed to send rawTx ${rawTx}` });
  }
});
chronikRouter.get('/tx/:txid', async (req, res) => {
  const txid = String(req.params.txid);
  try {
    const tx = await chronik.client.tx(txid);
    return res.json(tx);
  } catch (e: any) {
    console.log(`${req.originalUrl}: ${e.message}`);
    return res.json({ error: `failed to fetch transaction for ${txid}` });
  }
});

export default chronikRouter;
