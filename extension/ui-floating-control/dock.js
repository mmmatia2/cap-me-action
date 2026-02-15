// Purpose: render recorder state inside the floating dock and emit control actions.
// Inputs: state messages from parent frame and local button clicks.
// Outputs: timer/step UI updates and postMessage commands for toggle/stop/discard.
const timerEl = document.getElementById("dockTimer");
const stepEl = document.getElementById("dockStepCount");
const dockRoot = document.getElementById("dockRoot");
const pauseBtn = document.getElementById("dockPause");
const pauseIcon = document.getElementById("dockPauseIcon");
const finishBtn = document.getElementById("dockFinish");
const discardBtn = document.getElementById("dockDiscard");
const minimizeBtn = document.getElementById("dockMinimize");
const dragHandle = document.getElementById("dockDragHandle");
const toastEl = document.getElementById("dockToast");

const state = { isCapturing: false, startedAt: null, stepCount: 0, minimized: false };
let toastTimer = null;
let isDragging = false;
let lastPointer = null;

function formatDuration(ms) {
  const secs = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, "0");
  const ss = String(secs % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function render() {
  stepEl.textContent = String(state.stepCount ?? 0);
  timerEl.textContent = state.isCapturing && state.startedAt ? formatDuration(Date.now() - state.startedAt) : "00:00";
  pauseIcon.textContent = state.isCapturing ? "||" : ">";
  if (dockRoot) {
    dockRoot.classList.toggle("minimized", Boolean(state.minimized));
  }
  if (minimizeBtn) {
    minimizeBtn.textContent = state.minimized ? "^" : "_";
  }
}

function showToast(text) {
  if (!toastEl) {
    return;
  }
  toastEl.textContent = text;
  toastEl.classList.add("show");
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1300);
}

function send(type, payload = null) {
  window.parent.postMessage({ channel: "CAP_ME_DOCK", type, payload }, "*");
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.channel !== "CAP_ME_DOCK") {
    return;
  }
  if (data.type === "STATE") {
    Object.assign(state, data.payload ?? {});
    render();
    return;
  }
  if (data.type === "DISCARD_RESULT") {
    showToast(data.discarded ? "Step discarded" : "No step to discard");
  }
});

pauseBtn.addEventListener("click", () => send("TOGGLE_CAPTURE"));
finishBtn.addEventListener("click", () => send("STOP_CAPTURE"));
discardBtn.addEventListener("click", () => send("DISCARD_LAST_STEP"));
if (minimizeBtn) {
  minimizeBtn.addEventListener("click", () => send("TOGGLE_MINIMIZE"));
}
if (dragHandle) {
  dragHandle.addEventListener("pointerdown", (event) => {
    isDragging = true;
    lastPointer = { x: event.clientX, y: event.clientY };
    dragHandle.setPointerCapture(event.pointerId);
  });
  dragHandle.addEventListener("pointermove", (event) => {
    if (!isDragging || !lastPointer) {
      return;
    }
    const dx = event.clientX - lastPointer.x;
    const dy = event.clientY - lastPointer.y;
    lastPointer = { x: event.clientX, y: event.clientY };
    send("MOVE_DOCK", { dx, dy });
  });
  const stopDragging = (event) => {
    if (!isDragging) {
      return;
    }
    isDragging = false;
    lastPointer = null;
    if (typeof event.pointerId === "number") {
      dragHandle.releasePointerCapture(event.pointerId);
    }
  };
  dragHandle.addEventListener("pointerup", stopDragging);
  dragHandle.addEventListener("pointercancel", stopDragging);
}
setInterval(render, 1000);
render();
