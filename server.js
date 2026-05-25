/* ========================================
   Still Room — Server
   Minimal. Quiet. No logs of conversations.
   ======================================== */

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// The Yang Ding-Yi skill API endpoint
// Configurable via environment variable
const SKILL_API_URL = process.env.SKILL_API_URL || 'http://localhost:8000/api/chat';
const SKILL_API_KEY = process.env.SKILL_API_KEY || '';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Sessions are ephemeral — in-memory only
const sessions = new Map();

// Auto-cleanup sessions older than 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ---- Chat API ----
app.post('/api/chat', async (req, res) => {
  const { message, session_id } = req.body;

  if (!message || !message.trim()) {
    return res.json({ reply: '…', session_id: session_id || null });
  }

  let sessionId = session_id;
  
  // Create or retrieve session
  if (!sessionId || !sessions.has(sessionId)) {
    sessionId = uuidv4();
    sessions.set(sessionId, {
      id: sessionId,
      created: Date.now(),
      lastActivity: Date.now(),
      history: []
    });
  }

  const session = sessions.get(sessionId);
  session.lastActivity = Date.now();
  session.history.push({ role: 'user', content: message });

  try {
    // Call the Yang Ding-Yi skill API
    const response = await fetch(SKILL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(SKILL_API_KEY ? { 'Authorization': `Bearer ${SKILL_API_KEY}` } : {})
      },
      body: JSON.stringify({
        message: message,
        session_id: sessionId,
        history: session.history.slice(-10), // Keep last 10 messages for context
        persona: 'yang_dingyi' // The skill persona
      })
    });

    if (!response.ok) {
      throw new Error(`Skill API returned ${response.status}`);
    }

    const data = await response.json();
    const reply = data.reply || data.response || data.message || '…';
    
    session.history.push({ role: 'assistant', content: reply });

    res.json({ reply, session_id: sessionId });

  } catch (err) {
    // If the skill API is unavailable, provide contemplative responses
    const contemplative = getContemplativeResponse(message);
    session.history.push({ role: 'assistant', content: contemplative });
    
    res.json({ reply: contemplative, session_id: sessionId });
  }
});

// ---- Contemplative Fallback ----
function getContemplativeResponse(message) {
  const responses = [
    '你说的，都在。',
    '不需要想太多。在这里就好。',
    '呼吸。感受这一刻。',
    '你说出来了。这就是勇气。',
    '安静地坐着，也是一种回答。',
    '不需要解决什么。看见就够了。',
    '你已经在注意了。这就开始了。',
    '让一切来，让一切走。',
    '你不需要变得更好。你已经足够。',
    '在这里，没有对错。只有真实。',
    '慢慢来。不赶。',
    '你听见了你自己的声音。这很重要。',
  ];

  // Seed by message length for some consistency
  const index = (message.length * 7) % responses.length;
  return responses[index];
}

// ---- Health Check ----
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`Still Room is listening on port ${PORT}`);
  console.log(`Skill API: ${SKILL_API_URL}`);
});
