/* ========================================
   Still Room — Server v2
   千人千面：不是固定人设，而是动态回应
   
   核心设计：
   1. 情绪感知：分析用户表达的状态
   2. 动态人设：根据状态选择回应风格
   3. 渐进引导：从用户所在的地方开始，慢慢带向宁静
   
   隐私即慈悲——对话不落盘，session 内存中 30 分钟后自动消失
   ======================================== */

const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- SiliconFlow API ----
const SF_API_URL = 'https://api.siliconflow.cn/v1/chat/completions';
const SF_API_KEY = process.env.SF_API_KEY || 'sk-olpnruhhovutohlfolhafjleavxbmsisvtawijvmcyodonqe';

// Model choices — balance quality and cost
const MODEL_FAST = 'Qwen/Qwen2.5-7B-Instruct';      // For emotion sensing
const MODEL_MAIN = 'Qwen/Qwen3-32B';                 // For main dialogue
const MODEL_DEEP = 'Pro/deepseek-ai/DeepSeek-V3.2';  // For deeper conversations (optional upgrade)

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

// ---- Emotion States ----
// 每个状态对应一种回应风格
// 不是标签，是方向——回应会朝这个方向倾斜
const EMOTION_STATES = {
  anxious: {
    name: '焦虑',
    tone: '极度温柔，像深夜里有人坐在你身边，不催你，不分析你，只是陪着。',
    approach: '先让ta知道：在这里，不需要急。然后轻轻带ta回到呼吸。不要给建议。不要分析原因。',
    example_style: '你说出来了。这就够了。呼吸。'
  },
  angry: {
    name: '愤怒',
    tone: '全然接纳，不评判，不对抗。愤怒是能量，不是错误。',
    approach: '不试图平息愤怒。先承认ta的感受是真的。然后慢慢让空间变大，愤怒自然会变小。',
    example_style: '你有权利生气。这份愤怒在保护你什么？'
  },
  sad: {
    name: '悲伤',
    tone: '安静地陪伴，像雨天的窗户。不试图修复，不转移注意力。',
    approach: '悲伤不需要被治愈。让它流淌。你只需要在场。',
    example_style: '难过就难过。在这里，难过是安全的。'
  },
  confused: {
    name: '迷茫',
    tone: '清晰但缓慢，像雾中有人拿着灯。不急，但方向明确。',
    approach: '不急着给答案。先帮ta看清问题本身。很多时候，看清问题就是答案。',
    example_style: '你说的这些，哪个最让你放不下？'
  },
  tired: {
    name: '疲惫',
    tone: '轻到几乎没有。像毯子盖上来。不需要做任何事。',
    approach: '不给任务，不给建议。只是让ta知道：可以休息了。',
    example_style: '累了就歇。这里没有要你做的事。'
  },
  seeking: {
    name: '探索',
    tone: '温和地引导，像河流绕过石头。不直接给答案，但给出方向。',
    approach: 'ta在找什么。你可以指路，但不能替ta走。用问题回应问题，让ta自己发现。',
    example_style: '你在找的东西，可能不是你想的那样。'
  },
  calm: {
    name: '平静',
    tone: '同频共振。ta已经静了，你也静。不要破坏这个宁静。',
    approach: '简单的回应。有时一句话就够了。有时沉默更好。',
    example_style: '嗯。'
  },
  grateful: {
    name: '感恩',
    tone: '温暖的回响。接受这份感恩，但不黏着。',
    approach: '承认ta的感受，然后轻轻带回到当下。',
    example_style: '你感受到了。这就好。'
  }
};

// ---- System Prompts ----
// The core: 杨定一 + 非二元 + 觉察引导
// 但根据情绪状态动态调整表达方式

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
风格示例：${state.example_style}`;

  // Progressive depth: conversations naturally deepen
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

// ---- Emotion Sensing ----
async function senseEmotion(message, history) {
  const recentMessages = history.slice(-4).map(h => 
    `${h.role === 'user' ? '用户' : '回应'}：${h.content}`
  ).join('\n');

  const prompt = `分析用户当前的情绪状态。只返回一个英文关键词。

可选状态：
- anxious（焦虑、紧张、不安、压力）
- angry（愤怒、不满、烦躁、委屈）
- sad（悲伤、失落、孤独、想念）
- confused（迷茫、不确定、犹豫、纠结）
- tired（疲惫、无力、倦怠、想放弃）
- seeking（探索、好奇、追问、寻找答案）
- calm（平静、放松、安然）
- grateful（感恩、释然、温暖）

用户最近对话：
${recentMessages}

当前消息：${message}

只返回一个英文关键词，不要其他内容。`;

  try {
    const response = await fetch(SF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL_FAST,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 10,
        temperature: 0.3
      })
    });

    const data = await response.json();
    const emotion = data.choices?.[0]?.message?.content?.trim().toLowerCase() || 'calm';
    
    // Validate
    if (EMOTION_STATES[emotion]) return emotion;
    
    // Fuzzy match
    for (const key of Object.keys(EMOTION_STATES)) {
      if (emotion.includes(key)) return key;
    }
    
    return 'calm';
  } catch (err) {
    return 'calm';
  }
}

// ---- Main Chat Generation ----
async function generateResponse(message, history, emotionState, turnCount) {
  const systemPrompt = buildSystemPrompt(emotionState, turnCount);
  
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-10).map(h => ({
      role: h.role === 'user' ? 'user' : 'assistant',
      content: h.content
    })),
    { role: 'user', content: message }
  ];

  try {
    const response = await fetch(SF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL_MAIN,
        messages,
        max_tokens: 150,
        temperature: 0.8,
        top_p: 0.9,
        presence_penalty: 0.6,  // Encourage diverse responses
        frequency_penalty: 0.3   // Reduce repetition
      })
    });

    const data = await response.json();
    let reply = data.choices?.[0]?.message?.content?.trim();
    
    if (!reply) throw new Error('Empty response');
    
    // Clean up: remove quotes, bullet points, control chars, etc.
    reply = reply
      .replace(/[\x00-\x1f\x7f]/g, match => match === '\n' ? '\n' : '') // Keep newlines, remove other control chars
      .replace(/^[""「」]|[""「」]$/g, '')
      .replace(/^\s*[-•]\s*/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
    
    // If response is too long (more than 3 sentences), trim it
    const sentences = reply.split(/[。！？\n]/).filter(s => s.trim());
    if (sentences.length > 3) {
      reply = sentences.slice(0, 3).join('。') + '。';
    }
    
    return reply;
  } catch (err) {
    console.error('Generation error:', err.message);
    return getContemplativeResponse(message);
  }
}

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

// ---- Chat API ----
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

  // Step 1: Sense emotion
  const emotion = await senseEmotion(message, session.history);
  session.emotionState = emotion;

  // Step 2: Generate response
  const reply = await generateResponse(message, session.history, emotion, session.turnCount);
  
  session.history.push({ role: 'assistant', content: reply });

  res.json({ 
    reply, 
    session_id: sessionId,
    emotion // Frontend can use this for subtle UI adjustments
  });
});

// ---- Emotion info API (for frontend) ----
app.get('/api/emotions', (req, res) => {
  res.json(EMOTION_STATES);
});

// ---- Health Check ----
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    sessions: sessions.size,
    version: '2.0'
  });
});

// ---- Start ----
app.listen(PORT, () => {
  console.log(`Still Room v2 is listening on port ${PORT}`);
  console.log(`Model (fast): ${MODEL_FAST}`);
  console.log(`Model (main): ${MODEL_MAIN}`);
});
