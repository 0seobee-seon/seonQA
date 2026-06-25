const chatMessages = document.getElementById("chatMessages");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const quickButtons = document.getElementById("quickButtons");

function addMessage(text, role, sourceText = null, isFallback = false) {
  const wrapper = document.createElement("div");
  wrapper.className = `message ${role}${isFallback ? " fallback" : ""}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;
  wrapper.appendChild(bubble);

  if (sourceText) {
    const src = document.createElement("div");
    src.className = "source-tag";
    src.textContent = `참고: ${sourceText}`;
    wrapper.appendChild(src);
  }

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrapper;
}

function addLoading() {
  const wrapper = document.createElement("div");
  wrapper.className = "message bot";

  const bubble = document.createElement("div");
  bubble.className = "bubble loading-dots";
  bubble.innerHTML = "<span></span><span></span><span></span>";
  wrapper.appendChild(bubble);

  chatMessages.appendChild(wrapper);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrapper;
}

async function sendQuestion(question) {
  if (!question.trim()) return;

  addMessage(question, "user");
  userInput.value = "";
  sendBtn.disabled = true;

  const loadingEl = addLoading();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    const data = await res.json();
    loadingEl.remove();

    if (data.error) {
      addMessage("오류가 발생했습니다. 잠시 후 다시 시도해 주세요.", "bot", null, true);
    } else {
      addMessage(data.answer, "bot", data.source, data.fallback);
    }
  } catch (e) {
    loadingEl.remove();
    addMessage("서버에 연결할 수 없습니다. 총무팀(내선 100)으로 문의해 주세요.", "bot", null, true);
  }

  sendBtn.disabled = false;
  userInput.focus();
}

sendBtn.addEventListener("click", () => sendQuestion(userInput.value));

userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendQuestion(userInput.value);
  }
});

quickButtons.addEventListener("click", (e) => {
  if (e.target.classList.contains("quick-btn")) {
    sendQuestion(e.target.dataset.q);
  }
});
