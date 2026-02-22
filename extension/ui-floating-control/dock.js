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
const minimizeIcon = document.getElementById("dockMinimizeIcon");

const PAUSE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
const PLAY_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
const MINIMIZE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';
const EXPAND_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"></polyline><polyline points="9 21 3 21 3 15"></polyline><line x1="21" y1="3" x2="14" y2="10"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>';

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
  pauseIcon.innerHTML = state.isCapturing ? PAUSE_ICON : PLAY_ICON;
  if (dockRoot) {
    dockRoot.classList.toggle("minimized", Boolean(state.minimized));
  }
  if (minimizeBtn && minimizeIcon) {
    minimizeIcon.innerHTML = state.minimized ? EXPAND_ICON : MINIMIZE_ICON;
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
  dragHandle.addEventListener("keydown", (event) => {
    const moveBy = event.shiftKey ? 24 : 12;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      send("MOVE_DOCK", { dx: -moveBy, dy: 0 });
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      send("MOVE_DOCK", { dx: moveBy, dy: 0 });
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      send("MOVE_DOCK", { dx: 0, dy: -moveBy });
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      send("MOVE_DOCK", { dx: 0, dy: moveBy });
      return;
    }
  });
}
setInterval(render, 1000);
render();
