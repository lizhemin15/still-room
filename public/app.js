/* ========================================
   Still Room — App Logic v2
   千人千面：情绪影响氛围，但不打扰
   
   - 焦虑：呼吸圆更慢，背景微暖
   - 悲伤：呼吸圆更柔，背景微蓝
   - 愤怒：呼吸圆极慢，空间更大
   - 平静：一切自然
   ======================================== */

(function() {
  'use strict';

  // ---- State ----
  let currentLayer = 'surface';
  let dialogueSession = null;
  let silenceTimer = null;
  let silenceEndTime = null;
  let isTyping = false;
  let soundOn = false;
  let ripples = [];
  let currentEmotion = 'calm';
  let breathSpeed = 8; // seconds per breath cycle

  // ---- Emotion → Atmosphere ----
  const EMOTION_ATMOSPHERE = {
    anxious:  { breathSpeed: 12, bgTint: 'rgba(180, 140, 100, 0.03)', glowColor: 'rgba(196, 149, 106, 0.2)' },
    angry:    { breathSpeed: 14, bgTint: 'rgba(160, 100, 80, 0.03)',  glowColor: 'rgba(180, 120, 80, 0.18)' },
    sad:      { breathSpeed: 10, bgTint: 'rgba(100, 120, 160, 0.03)', glowColor: 'rgba(120, 140, 180, 0.15)' },
    confused: { breathSpeed: 9,  bgTint: 'rgba(140, 130, 100, 0.02)', glowColor: 'rgba(160, 150, 120, 0.15)' },
    tired:    { breathSpeed: 11, bgTint: 'rgba(120, 110, 100, 0.04)', glowColor: 'rgba(150, 130, 110, 0.15)' },
    seeking:  { breathSpeed: 8,  bgTint: 'rgba(130, 140, 120, 0.02)', glowColor: 'rgba(160, 170, 140, 0.15)' },
    calm:     { breathSpeed: 8,  bgTint: 'transparent',               glowColor: 'rgba(196, 149, 106, 0.15)' },
    grateful: { breathSpeed: 8,  bgTint: 'rgba(180, 160, 120, 0.02)', glowColor: 'rgba(196, 170, 130, 0.18)' }
  };

  // ---- Elements ----
  const surface = document.getElementById('surface');
  const dialogue = document.getElementById('dialogue');
  const silence = document.getElementById('silence');
  const greeting = document.getElementById('greeting');
  const breathCircle = document.getElementById('breathCircle');
  const enterHint = document.getElementById('enterHint');
  const dialogueFlow = document.getElementById('dialogueFlow');
  const dialogueInput = document.getElementById('dialogueInput');
  const silenceOption = document.getElementById('silenceOption');
  const timerSelect = document.getElementById('timerSelect');
  const silenceSpace = document.getElementById('silenceSpace');
  const silenceTimerEl = document.getElementById('silenceTimer');
  const silenceExit = document.getElementById('silenceExit');
  const soundToggle = document.getElementById('soundToggle');
  const ambientSound = document.getElementById('ambientSound');
  const rippleCanvas = document.getElementById('rippleCanvas');
  const ctx = rippleCanvas.getContext('2d');

  // ---- Layer Transitions ----
  function transitionTo(layerId) {
    const layers = { surface, dialogue, silence };
    const target = layers[layerId];
    
    Object.values(layers).forEach(l => l.classList.remove('active'));
    
    setTimeout(() => {
      target.classList.add('active');
      currentLayer = layerId;
    }, 100);
  }

  // ---- Atmosphere Update ----
  function updateAtmosphere(emotion) {
    currentEmotion = emotion;
    const atmo = EMOTION_ATMOSPHERE[emotion] || EMOTION_ATMOSPHERE.calm;
    
    // Update breath speed
    breathSpeed = atmo.breathSpeed;
    document.documentElement.style.setProperty('--breath-duration', breathSpeed + 's');
    
    // Update breath inner animation
    const breathInners = document.querySelectorAll('.breath-inner');
    breathInners.forEach(el => {
      el.style.animationDuration = breathSpeed + 's';
    });
    
    // Subtle background tint
    document.body.style.backgroundColor = '';
    document.body.style.boxShadow = `inset 0 0 200px ${atmo.bgTint}`;
    
    // Update breath glow color
    const breathInners2 = document.querySelectorAll('.breath-inner');
    breathInners2.forEach(el => {
      el.style.background = `radial-gradient(circle, ${atmo.glowColor} 0%, transparent 70%)`;
    });
  }

  // ---- Layer 1: The Surface ----
  function initSurface() {
    setTimeout(() => {
      const greetings = ['你来了。', '停一下。', '慢慢来。', '歇一歇。', '在这里。'];
      greeting.textContent = greetings[Math.floor(Math.random() * greetings.length)];
      greeting.classList.add('visible');
    }, 1000);

    setTimeout(() => {
      breathCircle.classList.add('visible');
    }, 3000);

    setTimeout(() => {
      enterHint.classList.add('visible');
    }, 5000);

    surface.addEventListener('click', () => {
      if (currentLayer !== 'surface') return;
      transitionTo('dialogue');
      setTimeout(() => dialogueInput.focus(), 1200);
    });
  }

  // ---- Layer 2: Dialogue ----
  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `dialogue-message ${type}`;
    
    if (type === 'bot') {
      msg.innerHTML = '<span class="typing-cursor"></span>';
      dialogueFlow.appendChild(msg);
      requestAnimationFrame(() => msg.classList.add('visible'));
      typeText(msg, text);
    } else {
      msg.textContent = text;
      dialogueFlow.appendChild(msg);
      requestAnimationFrame(() => msg.classList.add('visible'));
    }
    
    setTimeout(() => {
      dialogueFlow.scrollTop = dialogueFlow.scrollHeight;
    }, 100);
  }

  function typeText(element, text) {
    isTyping = true;
    let index = 0;
    const cursor = '<span class="typing-cursor"></span>';
    
    function typeChar() {
      if (index < text.length) {
        element.innerHTML = text.substring(0, index + 1) + cursor;
        index++;
        dialogueFlow.scrollTop = dialogueFlow.scrollHeight;
        // Slow typing: varies with emotion
        const baseSpeed = currentEmotion === 'calm' ? 80 : 100;
        const variation = currentEmotion === 'anxious' ? 40 : 70;
        setTimeout(typeChar, baseSpeed + Math.random() * variation);
      } else {
        element.innerHTML = text;
        isTyping = false;
      }
    }
    
    setTimeout(typeChar, 600);
  }

  async function sendMessage(text) {
    if (isTyping || !text.trim()) return;
    
    addMessage(text, 'user');
    dialogueInput.value = '';
    
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: dialogueSession
        })
      });
      
      const data = await response.json();
      
      if (data.session_id && !dialogueSession) {
        dialogueSession = data.session_id;
      }
      
      // Update atmosphere based on emotion
      if (data.emotion) {
        updateAtmosphere(data.emotion);
      }
      
      setTimeout(() => {
        addMessage(data.reply, 'bot');
      }, 800);
      
    } catch (err) {
      setTimeout(() => {
        const fallbacks = [
          '在这里，不用急。',
          '深呼吸。一切都在。',
          '你已经在安静的地方了。',
          '不需要说什么也可以。',
        ];
        addMessage(fallbacks[Math.floor(Math.random() * fallbacks.length)], 'bot');
      }, 1200);
    }
  }

  function initDialogue() {
    dialogueInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.isComposing) {
        e.preventDefault();
        sendMessage(dialogueInput.value);
      }
    });

    silenceOption.addEventListener('click', () => {
      transitionTo('silence');
      setTimeout(() => initSilence(), 1200);
    });
  }

  // ---- Layer 3: Silence ----
  function initSilence() {
    timerSelect.classList.remove('hidden');
    silenceSpace.classList.remove('visible');
    silenceTimerEl.classList.remove('visible');
    silenceExit.classList.remove('visible');
    
    const options = timerSelect.querySelectorAll('.timer-option');
    options.forEach(opt => {
      opt.addEventListener('click', function handler() {
        const minutes = parseInt(this.dataset.minutes);
        startSilence(minutes);
        options.forEach(o => o.removeEventListener('click', handler));
      });
    });
  }

  function startSilence(minutes) {
    timerSelect.classList.add('hidden');
    
    setTimeout(() => {
      silenceSpace.classList.add('visible');
      initRippleCanvas();
      startRippleAnimation();
    }, 800);
    
    if (minutes > 0) {
      silenceEndTime = Date.now() + minutes * 60 * 1000;
      silenceTimerEl.classList.add('visible');
      updateSilenceTimer();
      silenceTimer = setInterval(updateSilenceTimer, 1000);
    }
  }

  function updateSilenceTimer() {
    if (!silenceEndTime) return;
    
    const remaining = Math.max(0, silenceEndTime - Date.now());
    
    if (remaining <= 0) {
      clearInterval(silenceTimer);
      silenceTimerEl.classList.remove('visible');
      showExit();
      return;
    }
    
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    silenceTimerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function showExit() {
    silenceExit.classList.add('visible');
    
    setTimeout(() => {
      silenceExit.addEventListener('click', () => {
        transitionTo('surface');
        dialogueSession = null;
        dialogueFlow.innerHTML = '';
        silenceEndTime = null;
        ripples = [];
        currentEmotion = 'calm';
        updateAtmosphere('calm');
        if (silenceTimer) clearInterval(silenceTimer);
      });
    }, 500);
  }

  // ---- Ripple Canvas ----
  function initRippleCanvas() {
    rippleCanvas.width = window.innerWidth;
    rippleCanvas.height = window.innerHeight;
    
    window.addEventListener('resize', () => {
      rippleCanvas.width = window.innerWidth;
      rippleCanvas.height = window.innerHeight;
    });
  }

  function startRippleAnimation() {
    const atmo = EMOTION_ATMOSPHERE[currentEmotion] || EMOTION_ATMOSPHERE.calm;
    
    function addRipple() {
      ripples.push({
        x: Math.random() * rippleCanvas.width,
        y: Math.random() * rippleCanvas.height,
        radius: 0,
        maxRadius: 50 + Math.random() * 100,
        opacity: 0.2 + Math.random() * 0.15,
        speed: 0.2 + Math.random() * 0.2
      });
    }
    
    const interval = currentEmotion === 'calm' ? 4000 : 5000;
    setInterval(addRipple, interval + Math.random() * 2000);
    addRipple();
    
    function animate() {
      ctx.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
      
      ripples = ripples.filter(r => r.opacity > 0.01);
      
      ripples.forEach(r => {
        r.radius += r.speed;
        r.opacity -= 0.0008;
        
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${hexToRgb(atmo.glowColor)}, ${r.opacity})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });
      
      requestAnimationFrame(animate);
    }
    
    animate();
  }

  function hexToRgb(color) {
    // Extract RGB from rgba string
    const match = color.match(/(\d+),\s*(\d+),\s*(\d+)/);
    if (match) return `${match[1]}, ${match[2]}, ${match[3]}`;
    return '196, 149, 106'; // default warm glow
  }

  // ---- Sound Toggle ----
  soundToggle.addEventListener('click', () => {
    soundOn = !soundOn;
    soundToggle.classList.toggle('active', soundOn);
    soundToggle.querySelector('.sound-icon').textContent = soundOn ? '🔊' : '🔇';
    
    if (soundOn) {
      ambientSound.volume = 0.3;
      ambientSound.play().catch(() => {});
    } else {
      ambientSound.pause();
    }
  });

  // ---- Init ----
  initSurface();
  initDialogue();

})();
