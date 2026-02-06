require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3000;

// ─── Helper: Generate OAuth Token ────────────────────────────────
async function getAccessToken() {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString('base64');

  try {
    const res = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}` } }
    );
    return res.data.access_token;
  } catch (err) {
    console.error('Token error:', err.response?.data);
    throw err;
  }
}

// ─── Helper: Generate STK Password ───────────────────────────────
function generatePassword(shortcode, passkey) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14); // YYYYMMDDHHmmss

  const raw = shortcode + passkey + timestamp;
  return Buffer.from(raw).toString('base64');
}

// ─── Endpoint: Trigger STK Push ──────────────────────────────────
app.post('/api/stk-push', async (req, res) => {
  const { phone, amount } = req.body; // phone format: 2547XXXXXXXX

  if (!phone || !amount) {
    return res.status(400).json({ error: 'Phone and amount required' });
  }

  try {
    const token = await getAccessToken();

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14);

    const password = generatePassword(
      process.env.MPESA_SHORTCODE,
      process.env.MPESA_PASSKEY
    );

    const payload = {
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline', // or CustomerBuyGoodsOnline
      Amount: amount,
      PartyA: phone,
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: 'TestPayment-' + Date.now(),
      TransactionDesc: 'Payment for goods/services',
    };

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      payload,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json({
      success: true,
      data: response.data,
      message: 'STK Push sent! Check your phone.'
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.errorMessage || 'Failed to initiate payment'
    });
  }
});

// ─── Callback (Safaricom will POST here) ─────────────────────────
app.post('/callback', (req, res) => {
  console.log('MPESA CALLBACK:', JSON.stringify(req.body, null, 2));

  // TODO: Save to database, update order status, etc.
  // Body looks like:
  // { Body: { stkCallback: { ResultCode: 0 or 1032, CallbackMetadata, ... } } }

  res.send({ success: true });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
