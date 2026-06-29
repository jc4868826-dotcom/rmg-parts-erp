const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']
  if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
    return res.status(200).send(challenge)
  }
  res.sendStatus(403)
}

const handleEvent = (req, res) => {
  // Procesar eventos Meta Ads (pixel, leads, etc.)
  res.sendStatus(200)
}

module.exports = { verifyWebhook, handleEvent }
