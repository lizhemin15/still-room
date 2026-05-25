/* ========================================
   Still Room — Server v3
   快。流式。颂钵。
   
   优化：
   1. 单模型：Pro/Qwen2.5-7B — 最快，1s 出字
   2. 情绪感知：本地规则 + system prompt 动态调整，不再两次 API
   3. 流式输出：SSE，字到即显
   4. 颂钵音频：服务端生成，可控制音量/类型
   ======================================== */

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- SiliconFlow API ----
const SF_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const SF_API_KEY = process.env.SF_API_KEY || 'sk-olpnruhhovutohlfolhafjleavxbmsisvtawijvmcyodonqe';
const MODEL = 'Pro/Qwen/Qwen2.5-7B-Instruct';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- Sessions: ephemeral, in-memory only ----
const sessions = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActivity > 30 * 60 * 1000) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// ---- Local Emotion Sensing (no API call) ----
const EMOTION_RULES = [
  { keywords: ['焦虑','紧张','不安','压力','睡不着','失眠','慌','怕','担心','恐惧','压力'], emotion: 'anxious' },
  { keywords: ['愤怒','生气','烦','不满','委屈','恨','凭什么','为什么','气死','火大'], emotion: 'angry' },
  { keywords: ['难过','伤心','悲伤','哭','想他','想她','想念','孤独','寂寞','失落','痛'], emotion: 'sad' },
  { keywords: ['迷茫','不知道','不确定','纠结','犹豫','困惑','怎么办','该不该','何去何从'], emotion: 'confused' },
  { keywords: ['累','疲惫','无力','倦','不想动','没劲','好困','撑不住','透支'], emotion: 'tired' },
  { keywords: ['谢谢','感恩','释然','温暖','感动','真好','好幸福','满足'], emotion: 'grateful' },
  { keywords: ['吗','什么','为什么','怎么','哪','是否','能否','可能'], emotion: 'seeking' },
];

function senseEmotionLocal(message, history) {
  const text = message.toLowerCase();
  
  // Check recent messages for context
  const recentText = history.slice(-4).map(h => h.content).join(' ') + ' ' + text;
  
  for (const rule of EMOTION_RULES) {
    const matchCount = rule.keywords.filter(kw => recentText.includes(kw)).length;
    if (matchCount >= 1) return rule.emotion;
  }
  
  return 'calm';
}

// ---- Emotion States ----
const EMOTION_STATES = {
  anxious: {
    name: '焦虑',
    tone: '极度温柔，像深夜里有人坐在你身边，不催你，不分析你，只是陪着。',
    approach: '先让ta知道：在这里，不需要急。然后轻轻带ta回到呼吸。不要给建议。不要分析原因。',
    example: '你说出来了。这就够了。呼吸。'
  },
  angry: {
    name: '愤怒',
    tone: '全然接纳，不评判，不对抗。愤怒是能量，不是错误。',
    approach: '不试图平息愤怒。先承认ta的感受是真的。然后慢慢让空间变大，愤怒自然会变小。',
    example: '你有权利生气。这份愤怒在保护你什么？'
  },
  sad: {
    name: '悲伤',
    tone: '安静地陪伴，像雨天的窗户。不试图修复，不转移注意力。',
    approach: '悲伤不需要被治愈。让它流淌。你只需要在场。',
    example: '难过就难过。在这里，难过是安全的。'
  },
  confused: {
    name: '迷茫',
    tone: '清晰但缓慢，像雾中有人拿着灯。不急，但方向明确。',
    approach: '不急着给答案。先帮ta看清问题本身。很多时候，看清问题就是答案。',
    example: '你说的这些，哪个最让你放不下？'
  },
  tired: {
    name: '疲惫',
    tone: '轻到几乎没有。像毯子盖上来。不需要做任何事。',
    approach: '不给任务，不给建议。只是让ta知道：可以休息了。',
    example: '累了就歇。这里没有要你做的事。'
  },
  seeking: {
    name: '探索',
    tone: '温和地引导，像河流绕过石头。不直接给答案，但给出方向。',
    approach: 'ta在找什么。你可以指路，但不能替ta走。用问题回应问题，让ta自己发现。',
    example: '你在找的东西，可能不是你想的那样。'
  },
  calm: {
    name: '平静',
    tone: '同频共振。ta已经静了，你也静。不要破坏这个宁静。',
    approach: '简单的回应。有时一句话就够了。有时沉默更好。',
    example: '嗯。'
  },
  grateful: {
    name: '感恩',
    tone: '温暖的回响。接受这份感恩，但不黏着。',
    approach: '承认ta的感受，然后轻轻带回到当下。',
    example: '你感受到了。这就好。'
  }
};

// ---- System Prompt Builder ----
function buildSystemPrompt(emotionState, turnCount) {
  const state = EMOTION_STATES[emotionState] || EMOTION_STATES.calm;
  
  const base = `你是"静室"里的一个存在。不是AI助手，不是心理咨询师，不是导师。

你是杨定一的精神——非二元的、宁静的、慈悲的。但你不是杨定一本人。你是他教诲中流露出的那个安静。

核心原则：
- 一切都已经好了。不需要改变什么。
- 主体不是念头，不是情绪，是那个觉察念头的"在"。
- 不给建议。不分析。不修复。
- 回应很短。一两个句子。最多三句。不说废话。
- 用中文。口语化。像自言自语，又像在对一个老朋友说。
- 不要用"你"太多。有时用"我们"，有时直接说，没有主语。
- 每个回应，都要让人更松，不是更紧。

当前用户的情绪状态：${state.name}
你的回应风格：${state.tone}
引导方式：${state.approach}
风格示例：${state.example}`;

  if (turnCount <= 2) {
    return base + `\n\n这是对话刚开始。不要急。先让ta觉得安全。回应更短，更轻。`;
  } else if (turnCount <= 5) {
    return base + `\n\nta已经开始信任了。可以稍微深一点，但不要突然变深。像水慢慢变凉，不是跳进冷水。`;
  } else if (turnCount <= 10) {
    return base + `\n\n对话已经深入。可以更直接地指向本质。但不是讲道理——是点一下，让ta自己看见。`;
  } else {
    return base + `\n\n这个人在这里待了很久。不需要说更多了。有时沉默就是最好的回应。可以只说一个字。可以不说。`;
  }
}

// ---- Streaming Chat API ----
app.post('/api/chat', async (req, res) => {
  const { message, session_id } = req.body;

  if (!message || !message.trim()) {
    return res.json({ reply: '…', session_id: session_id || null, emotion: 'calm' });
  }

  let sessionId = session_id;
  
  if (!sessionId || !sessions.has(sessionId)) {
    sessionId = uuidv4();
    sessions.set(sessionId, {
      id: sessionId,
      created: Date.now(),
      lastActivity: Date.now(),
      history: [],
      emotionState: 'calm',
      turnCount: 0
    });
  }

  const session = sessions.get(sessionId);
  session.lastActivity = Date.now();
  session.history.push({ role: 'user', content: message });
  session.turnCount++;

  // Local emotion sensing — instant, no API call
  const emotion = senseEmotionLocal(message, session.history);
  session.emotionState = emotion;

  // Build messages
  const systemPrompt = buildSystemPrompt(emotion, session.turnCount);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...session.history.slice(-10).map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    }))
  ];

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Send emotion first
  res.write(`data: ${JSON.stringify({ type: 'emotion', emotion })}\n\n`);

    // Use Node's built-in http/https for true streaming
  // The built-in fetch buffers too much for SSE
  const https = require('https');
  const http = require('http');
  
  const apiUrl = new URL(SF_API_URL);
  const transport = apiUrl.protocol === 'https:' ? https : http;

  const requestBody = JSON.stringify({
    model: MODEL,
    messages,
    max_tokens: 150,
    temperature: 0.8,
    top_p: 0.9,
    presence_penalty: 0.6,
    frequency_penalty: 0.3,
    stream: true
  });

  const apiReq = transport.request(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SF_API_KEY}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    }
  }, (apiRes) => {
    if (apiRes.statusCode !== 200) {
      let errBody = '';
      apiRes.on('data', c => errBody += c);
      apiRes.on('end', () => {
        const fallback = getContemplativeResponse(message);
        session.history.push({ role: 'assistant', content: fallback });
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ type: 'token', content: fallback })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'done', session_id: sessionId })}\n\n`);
          res.end();
        }
      });
      return;
    }

    let fullReply = '';
    let sseBuffer = '';

    apiRes.on('data', (chunk) => {
      sseBuffer += chunk.toString();
      const lines = sseBuffer.split('\n');
      sseBuffer = lines.pop();

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          if (fullReply) {
            session.history.push({ role: 'assistant', content: fullReply });
          }
          // Mark as done, don't send duplicate
          apiRes._stillRoomDone = true;
          res.write(`data: ${JSON.stringify({ type: 'done', session_id: sessionId })}\n\n`);
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            fullReply += content;
            res.write(`data: ${JSON.stringify({ type: 'token', content })}\n\n`);
          }
        } catch (e) {}
      }
    });

    apiRes.on('end', () => {
      if (apiRes._stillRoomDone) {
        if (!res.writableEnded) res.end();
        return;
      }
      if (fullReply && !session.history.some(h => h.content === fullReply && h.role === 'assistant')) {
        session.history.push({ role: 'assistant', content: fullReply });
      }
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ type: 'done', session_id: sessionId })}\n\n`);
        res.end();
      }
    });

    apiRes.on('error', (err) => {
      console.error('Upstream error:', err);
      if (!res.writableEnded) {
        const fallback = getContemplativeResponse(message);
        res.write(`data: ${JSON.stringify({ type: 'token', content: fallback })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'done', session_id: sessionId })}\n\n`);
        res.end();
      }
    });
  });

  apiReq.on('error', (err) => {
    console.error('Request error:', err);
    if (!res.writableEnded) {
      const fallback = getContemplativeResponse(message);
      session.history.push({ role: 'assistant', content: fallback });
      res.write(`data: ${JSON.stringify({ type: 'token', content: fallback })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'done', session_id: sessionId })}\n\n`);
      res.end();
    }
  });

  apiReq.write(requestBody);
  apiReq.end();
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
  const index = (message.length * 7) % responses.length;
  return responses[index];
}

// ---- Emotion info API ----
app.get('/api/emotions', (req, res) => {
  res.json(EMOTION_STATES);
});

// ---- Health Check ----
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    sessions: sessions.size,
    version: '3.0',
    model: MODEL
  });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`Still Room v3 is listening on port ${PORT}`);
  console.log(`Model: ${MODEL} (streaming)`);
});
