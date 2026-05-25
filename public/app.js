/* ========================================
   Still Room — App Logic
   Slow. Present. No rush.
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
    
    // Small delay for smooth crossfade
    setTimeout(() => {
      target.classList.add('active');
      currentLayer = layerId;
    }, 100);
  }

  // ---- Layer 1: The Surface ----
  function initSurface() {
    // Greeting fades in after 1s
    setTimeout(() => {
      const greetings = ['你来了。', '停一下。', '慢慢来。'];
      greeting.textContent = greetings[Math.floor(Math.random() * greetings.length)];
      greeting.classList.add('visible');
    }, 1000);

    // Breath circle appears after 3s
    setTimeout(() => {
      breathCircle.classList.add('visible');
    }, 3000);

    // Enter hint after 5s
    setTimeout(() => {
      enterHint.classList.add('visible');
    }, 5000);

    // Click/tap to enter dialogue
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
      // Typing effect for bot messages
      msg.innerHTML = '<span class="typing-cursor"></span>';
      dialogueFlow.appendChild(msg);
      requestAnimationFrame(() => msg.classList.add('visible'));
      
      typeText(msg, text);
    } else {
      msg.textContent = text;
      dialogueFlow.appendChild(msg);
      requestAnimationFrame(() => msg.classList.add('visible'));
    }
    
    // Scroll to bottom gently
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
        // Slow typing: 80-150ms per character
        setTimeout(typeChar, 80 + Math.random() * 70);
      } else {
        element.innerHTML = text;
        isTyping = false;
      }
    }
    
    // Start after a pause
    setTimeout(typeChar, 600);
  }

  async function sendMessage(text) {
    if (isTyping || !text.trim()) return;
    
    addMessage(text, 'user');
    dialogueInput.value = '';
    
    // Get response from API
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
      
      // Small delay before response appears
      setTimeout(() => {
        addMessage(data.reply, 'bot');
      }, 800);
      
    } catch (err) {
      // If API fails, still give a gentle response
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
    
    // Timer option clicks
    const options = timerSelect.querySelectorAll('.timer-option');
    options.forEach(opt => {
      opt.addEventListener('click', function handler() {
        const minutes = parseInt(this.dataset.minutes);
        startSilence(minutes);
        // Remove listeners after choice
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
    
    // Click to return to surface
    setTimeout(() => {
      silenceExit.addEventListener('click', () => {
        transitionTo('surface');
        // Reset states
        dialogueSession = null;
        dialogueFlow.innerHTML = '';
        silenceEndTime = null;
        ripples = [];
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
    // Occasional ripple
    function addRipple() {
      ripples.push({
        x: Math.random() * rippleCanvas.width,
        y: Math.random() * rippleCanvas.height,
        radius: 0,
        maxRadius: 50 + Math.random() * 100,
        opacity: 0.3 + Math.random() * 0.2,
        speed: 0.3 + Math.random() * 0.3
      });
    }
    
    // Add a ripple every few seconds
    setInterval(addRipple, 3000 + Math.random() * 2000);
    addRipple(); // Initial ripple
    
    function animate() {
      ctx.clearRect(0, 0, rippleCanvas.width, rippleCanvas.height);
      
      ripples = ripples.filter(r => r.opacity > 0.01);
      
      ripples.forEach(r => {
        r.radius += r.speed;
        r.opacity -= 0.001;
        
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(196, 149, 106, ${r.opacity})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });
      
      requestAnimationFrame(animate);
    }
    
    animate();
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
