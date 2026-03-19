(function () {
  'use strict';

  const API_URL = window.EDG_CHATBOT_API || '/api/chat';
  const TOKEN = window.EDG_CHATBOT_TOKEN || '';

  let sessionId = null;
  let isOpen = false;
  let isLoading = false;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = `
    #edg-chat-widget * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #edg-chat-btn {
      position: fixed; bottom: 24px; right: 24px; width: 60px; height: 60px;
      border-radius: 50%; background: #2563eb; border: none; cursor: pointer;
      box-shadow: 0 4px 12px rgba(37,99,235,0.4); z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    #edg-chat-btn:hover { transform: scale(1.08); box-shadow: 0 6px 16px rgba(37,99,235,0.5); }
    #edg-chat-btn svg { width: 28px; height: 28px; fill: white; }
    #edg-chat-window {
      position: fixed; bottom: 96px; right: 24px; width: 380px; height: 520px;
      background: #fff; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      z-index: 99999; display: none; flex-direction: column; overflow: hidden;
    }
    #edg-chat-window.open { display: flex; }
    #edg-chat-header {
      background: #2563eb; color: white; padding: 16px 20px;
      font-size: 15px; font-weight: 600; display: flex; align-items: center;
      justify-content: space-between;
    }
    #edg-chat-header .close-btn {
      background: none; border: none; color: white; cursor: pointer;
      font-size: 20px; line-height: 1; padding: 0 4px;
    }
    #edg-chat-messages {
      flex: 1; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 12px;
    }
    .edg-msg {
      max-width: 85%; padding: 10px 14px; border-radius: 12px;
      font-size: 14px; line-height: 1.5; word-wrap: break-word;
    }
    .edg-msg.user {
      align-self: flex-end; background: #2563eb; color: white;
      border-bottom-right-radius: 4px;
    }
    .edg-msg.bot {
      align-self: flex-start; background: #f1f5f9; color: #1e293b;
      border-bottom-left-radius: 4px;
    }
    .edg-msg.bot ol, .edg-msg.bot ul { margin: 6px 0; padding-left: 20px; }
    .edg-msg.bot li { margin-bottom: 4px; }
    .edg-msg.bot strong { font-weight: 600; }
    .edg-typing { align-self: flex-start; padding: 12px 16px; background: #f1f5f9; border-radius: 12px; }
    .edg-typing span {
      display: inline-block; width: 8px; height: 8px; margin: 0 2px;
      background: #94a3b8; border-radius: 50%; animation: edg-bounce 1.4s infinite ease-in-out;
    }
    .edg-typing span:nth-child(2) { animation-delay: 0.2s; }
    .edg-typing span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes edg-bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
    #edg-chat-input-area {
      padding: 12px 16px; border-top: 1px solid #e2e8f0;
      display: flex; gap: 8px; align-items: center;
    }
    #edg-chat-input {
      flex: 1; border: 1px solid #e2e8f0; border-radius: 8px;
      padding: 10px 12px; font-size: 14px; outline: none;
      resize: none; height: 40px; line-height: 20px;
    }
    #edg-chat-input:focus { border-color: #2563eb; }
    #edg-chat-send {
      background: #2563eb; border: none; border-radius: 8px;
      width: 40px; height: 40px; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    #edg-chat-send:disabled { opacity: 0.5; cursor: not-allowed; }
    #edg-chat-send svg { width: 18px; height: 18px; fill: white; }
    @media (max-width: 440px) {
      #edg-chat-window { width: calc(100vw - 16px); right: 8px; bottom: 88px; height: 70vh; }
    }
  `;
  document.head.appendChild(style);

  // Create widget HTML
  const container = document.createElement('div');
  container.id = 'edg-chat-widget';
  container.innerHTML = `
    <button id="edg-chat-btn" aria-label="Отворете чат">
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
    </button>
    <div id="edg-chat-window">
      <div id="edg-chat-header">
        <span>EDG.bg Помощник</span>
        <button class="close-btn" aria-label="Затвори">&times;</button>
      </div>
      <div id="edg-chat-messages">
        <div class="edg-msg bot">Здравейте! Аз съм помощникът на EDG.bg. Как мога да ви помогна?</div>
      </div>
      <div id="edg-chat-input-area">
        <input id="edg-chat-input" type="text" placeholder="Въведете вашия въпрос..." autocomplete="off" />
        <button id="edg-chat-send" aria-label="Изпрати">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // Elements
  const btn = document.getElementById('edg-chat-btn');
  const win = document.getElementById('edg-chat-window');
  const closeBtn = win.querySelector('.close-btn');
  const messagesEl = document.getElementById('edg-chat-messages');
  const input = document.getElementById('edg-chat-input');
  const sendBtn = document.getElementById('edg-chat-send');

  // Toggle chat window
  btn.addEventListener('click', () => {
    isOpen = !isOpen;
    win.classList.toggle('open', isOpen);
    if (isOpen) input.focus();
  });

  closeBtn.addEventListener('click', () => {
    isOpen = false;
    win.classList.remove('open');
  });

  // Send message
  async function sendMessage() {
    const text = input.value.trim();
    if (!text || isLoading) return;

    addMessage(text, 'user');
    input.value = '';
    isLoading = true;
    sendBtn.disabled = true;

    const typing = showTyping();

    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + TOKEN,
        },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });

      const data = await res.json();

      if (res.ok) {
        sessionId = data.session_id;
        addMessage(data.response, 'bot');
      } else {
        addMessage(data.error || 'Възникна грешка. Моля, опитайте отново.', 'bot');
      }
    } catch (err) {
      addMessage('Няма връзка със сървъра. Моля, опитайте по-късно.', 'bot');
    } finally {
      typing.remove();
      isLoading = false;
      sendBtn.disabled = false;
    }
  }

  function renderMarkdown(text) {
    // Escape HTML to prevent XSS
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Bold: **text**
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

    // Split into lines for list processing
    const lines = html.split('\n');
    let result = [];
    let inOl = false;
    let inUl = false;

    for (const line of lines) {
      const olMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
      const ulMatch = line.match(/^\s*[-•]\s+(.+)/);

      if (olMatch) {
        if (!inOl) { if (inUl) { result.push('</ul>'); inUl = false; } result.push('<ol>'); inOl = true; }
        result.push('<li>' + olMatch[2] + '</li>');
      } else if (ulMatch) {
        if (!inUl) { if (inOl) { result.push('</ol>'); inOl = false; } result.push('<ul>'); inUl = true; }
        result.push('<li>' + ulMatch[1] + '</li>');
      } else {
        if ((inOl || inUl) && line.trim() === '') continue;
        if (inOl) { result.push('</ol>'); inOl = false; }
        if (inUl) { result.push('</ul>'); inUl = false; }
        result.push(line);
      }
    }
    if (inOl) result.push('</ol>');
    if (inUl) result.push('</ul>');

    // Join and convert remaining newlines to <br>
    html = result.join('\n');
    html = html.replace(/\n/g, '<br>');
    // Clean up <br> around list tags
    html = html.replace(/<br>\s*(<\/?[uo]l>)/g, '$1');
    html = html.replace(/(<\/?[uo]l>)\s*<br>/g, '$1');

    return html;
  }

  function addMessage(text, type) {
    const div = document.createElement('div');
    div.className = 'edg-msg ' + type;
    if (type === 'bot') {
      div.innerHTML = renderMarkdown(text);
    } else {
      div.textContent = text;
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showTyping() {
    const div = document.createElement('div');
    div.className = 'edg-typing';
    div.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
})();
