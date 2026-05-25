/* ========================================
   Still Room — App Logic v3
   流式 + 颂钵 + 快
   ======================================== */

(function() {
  'use strict';

  // ---- State ----
  let currentLayer = 'surface';
  let dialogueSession = null;
  let silenceTimer = null;
  let silenceEndTime = null;
  let isTyping = false;
  let ripples = [];
  let currentEmotion = 'calm';
  let breathSpeed = 8;

  // ---- Singing Bowl Audio Context ----
  let audioCtx = null;
  let bowlGainNode = null;
  let bowlVolume = 0.35;
  let bowlPlaying = false;
  let bowlInterval = null;

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
  const rippleCanvas = document.getElementById('rippleCanvas');
  const ctx = rippleCanvas.getContext('2d');

  // ---- Singing Bowl Synthesis ----
  // Generate singing bowl sound using Web Audio API
  // A singing bowl has multiple harmonics that slowly decay

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    bowlGainNode = audioCtx.createGain();
    bowlGainNode.gain.value = bowlVolume;
    bowlGainNode.connect(audioCtx.destination);
  }

  function playBowlStrike(baseFreq = 396, duration = 6) {
    if (!audioCtx) initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now = audioCtx.currentTime;
    
    // Singing bowl harmonics (approximate)
    // Fundamental + harmonics at ~2.76x, ~4.72x, ~6.8x with decreasing amplitude
    const harmonics = [
      { freq: baseFreq, amp: 0.4, decay: duration },
      { freq: baseFreq * 1.498, amp: 0.25, decay: duration * 0.7 },
      { freq: baseFreq * 2.76, amp: 0.15, decay: duration * 0.5 },
      { freq: baseFreq * 4.72, amp: 0.08, decay: duration * 0.35 },
      { freq: baseFreq * 6.8, amp: 0.04, decay: duration * 0.25 },
    ];

    harmonics.forEach(h => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.value = h.freq;
      
      // Slight frequency drift (bowls aren't perfect)
      osc.frequency.setValueAtTime(h.freq, now);
      osc.frequency.linearRampToValueAtTime(h.freq * 0.999, now + h.decay);
      
      // Amplitude envelope: quick attack, long exponential decay
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(h.amp, now + 0.05); // Fast attack
      gain.gain.exponentialRampToValueAtTime(h.amp * 0.001, now + h.decay);
      
      osc.connect(gain);
      gain.connect(bowlGainNode);
      
      osc.start(now);
      osc.stop(now + h.decay);
    });

    // Add a subtle beating effect (two close frequencies)
    const beatOsc = audioCtx.createOscillator();
    const beatGain = audioCtx.createGain();
    beatOsc.type = 'sine';
    beatOsc.frequency.value = baseFreq * 1.003; // Slightly off for beating
    beatGain.gain.setValueAtTime(0, now);
    beatGain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    beatGain.gain.exponentialRampToValueAtTime(0.0001, now + duration * 0.8);
    beatOsc.connect(beatGain);
    beatGain.connect(bowlGainNode);
    beatOsc.start(now);
    beatOsc.stop(now + duration * 0.8);
  }

  // Different bowl tones for different moments
  const BOWL_TONES = {
    enter:     { freq: 285, dur: 5 },   // Low, grounding
    response:  { freq: 396, dur: 4 },   // Mid, releasing
    silence:   { freq: 528, dur: 7 },   // Higher, transformation
    exit:      { freq: 432, dur: 5 },   // Natural tuning
  };

  function startBowlAmbient() {
    if (bowlPlaying) return;
    bowlPlaying = true;
    
    // Play a bowl strike every 15-25 seconds
    function scheduleNext() {
      if (!bowlPlaying) return;
      const delay = 15000 + Math.random() * 10000;
      bowlInterval = setTimeout(() => {
        if (bowlPlaying) {
          playBowlStrike(
            BOWL_TONES.silence.freq + (Math.random() - 0.5) * 40,
            BOWL_TONES.silence.dur
          );
          scheduleNext();
        }
      }, delay);
    }
    
    // First strike
    playBowlStrike(BOWL_TONES.silence.freq, BOWL_TONES.silence.dur);
    scheduleNext();
  }

  function stopBowlAmbient() {
    bowlPlaying = false;
    if (bowlInterval) {
      clearTimeout(bowlInterval);
      bowlInterval = null;
    }
  }

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
    breathSpeed = atmo.breathSpeed;
    
    document.querySelectorAll('.breath-inner').forEach(el => {
      el.style.animationDuration = breathSpeed + 's';
    });
    
    document.body.style.boxShadow = `inset 0 0 200px ${atmo.bgTint}`;
    document.querySelectorAll('.breath-inner').forEach(el => {
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
      // Play bowl on enter
      initAudio();
      playBowlStrike(BOWL_TONES.enter.freq, BOWL_TONES.enter.dur);
      transitionTo('dialogue');
      setTimeout(() => dialogueInput.focus(), 1200);
    });
  }

  // ---- Layer 2: Dialogue (Streaming) ----
  function addMessage(text, type) {
    const msg = document.createElement('div');
    msg.className = `dialogue-message ${type}`;
    msg.textContent = text;
    dialogueFlow.appendChild(msg);
    requestAnimationFrame(() => msg.classList.add('visible'));
    setTimeout(() => { dialogueFlow.scrollTop = dialogueFlow.scrollHeight; }, 100);
    return msg;
  }

  function addStreamingMessage() {
    const msg = document.createElement('div');
    msg.className = 'dialogue-message bot';
    msg.innerHTML = '<span class="typing-cursor"></span>';
    dialogueFlow.appendChild(msg);
    requestAnimationFrame(() => msg.classList.add('visible'));
    return msg;
  }

  function appendToStreamMessage(msg, text) {
    // Remove cursor, add text, re-add cursor
    const cursor = '<span class="typing-cursor"></span>';
    const current = msg.textContent || '';
    msg.innerHTML = current + text + cursor;
    dialogueFlow.scrollTop = dialogueFlow.scrollHeight;
  }

  function finalizeStreamMessage(msg) {
    const cursor = msg.querySelector('.typing-cursor');
    if (cursor) cursor.remove();
  }

  async function sendMessage(text) {
    if (isTyping || !text.trim()) return;
    
    addMessage(text, 'user');
    dialogueInput.value = '';
    isTyping = true;

    // Play subtle bowl on response start
    if (audioCtx) {
      playBowlStrike(BOWL_TONES.response.freq, BOWL_TONES.response.dur);
    }

    const streamMsg = addStreamingMessage();

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          session_id: dialogueSession
        })
      });

      // Read SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'emotion') {
                updateAtmosphere(data.emotion);
              } else if (data.type === 'token') {
                appendToStreamMessage(streamMsg, data.content);
              } else if (data.type === 'done') {
                if (data.session_id) dialogueSession = data.session_id;
                finalizeStreamMessage(streamMsg);
                isTyping = false;
              }
            } catch (e) {}
          }
        }
      }
      
      // Ensure finalized
      finalizeStreamMessage(streamMsg);
      isTyping = false;

    } catch (err) {
      finalizeStreamMessage(streamMsg);
      isTyping = false;
      
      const fallbacks = ['在这里，不用急。', '深呼吸。一切都在。', '你已经在安静的地方了。'];
      const fb = fallbacks[Math.floor(Math.random() * fallbacks.length)];
      streamMsg.textContent = fb;
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
      // Bowl sound when entering silence
      if (audioCtx) {
        playBowlStrike(BOWL_TONES.silence.freq, BOWL_TONES.silence.dur);
      }
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
      // Start ambient bowl in silence
      startBowlAmbient();
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
        // Final bowl
        if (audioCtx) {
          playBowlStrike(BOWL_TONES.exit.freq, BOWL_TONES.exit.dur);
        }
        transitionTo('surface');
        dialogueSession = null;
        dialogueFlow.innerHTML = '';
        silenceEndTime = null;
        ripples = [];
        currentEmotion = 'calm';
        updateAtmosphere('calm');
        stopBowlAmbient();
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
    
    setInterval(addRipple, 4000 + Math.random() * 2000);
    addRipple();
    
    function animate() {
      ctx.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
      ripples = ripples.filter(r => r.opacity > 0.01);
      ripples.forEach(r => {
        r.radius += r.speed;
        r.opacity -= 0.0008;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        const match = atmo.glowColor.match(/(\d+),\s*(\d+),\s*(\d+)/);
        const rgb = match ? `${match[1]}, ${match[2]}, ${match[3]}` : '196, 149, 106';
        ctx.strokeStyle = `rgba(${rgb}, ${r.opacity})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });
      requestAnimationFrame(animate);
    }
    animate();
  }

  // ---- Sound Toggle → Now controls bowl ----
  soundToggle.addEventListener('click', () => {
    initAudio();
    
    if (!bowlPlaying) {
      // Start bowl
      bowlPlaying = true;
      soundToggle.classList.add('active');
      soundToggle.querySelector('.sound-icon').textContent = '🔔';
      bowlGainNode.gain.value = bowlVolume;
      
      // If in silence layer, start ambient
      if (currentLayer === 'silence') {
        startBowlAmbient();
      } else {
        // Play a single strike to confirm
        playBowlStrike(BOWL_TONES.enter.freq, BOWL_TONES.enter.dur);
      }
    } else {
      // Stop bowl
      stopBowlAmbient();
      soundToggle.classList.remove('active');
      soundToggle.querySelector('.sound-icon').textContent = '🔕';
      bowlGainNode.gain.value = 0;
    }
  });

  // ---- Volume control (scroll on sound toggle) ----
  soundToggle.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (!bowlGainNode) return;
    
    const delta = e.deltaY > 0 ? -0.05 : 0.05;
    bowlVolume = Math.max(0, Math.min(1, bowlVolume + delta));
    bowlGainNode.gain.value = bowlVolume;
    
    // Visual feedback
    const bars = Math.round(bowlVolume * 5);
    soundToggle.querySelector('.sound-icon').textContent = '🔔';
    soundToggle.title = `颂钵音量: ${Math.round(bowlVolume * 100)}%`;
  }, { passive: false });

  // ---- Init ----
  initSurface();
  initDialogue();

})();
