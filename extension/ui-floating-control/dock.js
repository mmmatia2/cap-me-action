// Purpose: render recorder state inside the floating dock and emit control actions.
// Inputs: state messages from parent frame and local button clicks.
// Outputs: timer/step UI updates and postMessage commands for toggle/stop capture.
const timerEl = document.querySelector("span.font-mono");
const stepEl = document.querySelector("span.text-sm.text-white.font-bold.tabular-nums");
const pauseBtn = document.querySelector('button[aria-label="Pause"]');
const pauseIcon = pauseBtn?.querySelector(".material-symbols-outlined");
const finishBtn = document.querySelector('button[aria-label="Finish Recording"]');

const state = { isCapturing: false, startedAt: null, stepCount: 0 };

function formatDuration(ms) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function render() {
  stepEl.textContent = String(state.stepCount ?? 0);
  timerEl.textContent = state.isCapturing && state.startedAt ? formatDuration(Date.now() - state.startedAt) : "00:00";
  pauseIcon.textContent = state.isCapturing ? "pause" : "play_arrow";
}

function send(type) {
  window.parent.postMessage({ channel: "CAP_ME_DOCK", type }, "*");
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.channel !== "CAP_ME_DOCK" || data.type !== "STATE") {
    return;
  }
  Object.assign(state, data.payload ?? {});
  render();
});

pauseBtn.addEventListener("click", () => send("TOGGLE_CAPTURE"));
finishBtn.addEventListener("click", () => send("STOP_CAPTURE"));
setInterval(render, 1000);
render();
