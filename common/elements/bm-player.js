/**
 * BMPlayer — Reusable Pro Monospace Video Player Component
 * Web Component (<bm-player>), JS Class (BMPlayer), and Alpine.js Plugin.
 * Dark monospace terminal aesthetic matching AGENTS.md rules.
 */

(function () {
  'use me strict';

  // Prevent duplicate registration
  if (window.customElements && window.customElements.get('bm-player')) {
    return;
  }

  const template = document.createElement('template');
  template.innerHTML = `
    <style>
      :host {
        display: block;
        width: 100%;
        height: 100%;
        background: var(--bg-0, var(--bg, #0b0d10));
        color: var(--text-0, var(--text, #d9dee5));
        font-family: var(--mono, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace);
        box-sizing: border-box;
        position: relative;
        overflow: hidden;
        user-select: none;
      }
      *, *:before, *:after { box-sizing: border-box; }

      .player-shell {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 240px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: #000;
        outline: none;
      }
      .player-shell.idle {
        cursor: none;
      }

      video {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #000;
        display: block;
      }

      /* Big Center Play/Pause Overlay */
      .center-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        z-index: 10;
      }
      .big-play-btn {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: rgba(18, 21, 26, 0.75);
        border: 1px solid var(--line, rgba(255, 255, 255, 0.15));
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        color: var(--accent, #7de1c3);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        pointer-events: auto;
        transition: transform 0.2s ease, opacity 0.25s ease, background 0.2s ease;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
      }
      .big-play-btn:hover {
        transform: scale(1.1);
        background: rgba(18, 21, 26, 0.95);
        border-color: var(--accent, #7de1c3);
      }
      .big-play-btn svg {
        width: 28px;
        height: 28px;
        fill: currentColor;
        margin-left: 3px;
      }
      .big-play-btn.playing {
        opacity: 0;
        pointer-events: none;
      }
      .player-shell:hover .big-play-btn.playing {
        opacity: 0.35;
        pointer-events: auto;
      }
      .player-shell:hover .big-play-btn.playing:hover {
        opacity: 1;
      }

      /* Spinner Overlay */
      .spinner-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(4px);
        z-index: 12;
      }
      .spinner {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: 3px solid rgba(255, 255, 255, 0.12);
        border-top-color: var(--accent, #7de1c3);
        animation: bm-spin 0.75s linear infinite;
      }
      @keyframes bm-spin { to { transform: rotate(360deg); } }

      /* Error Overlay */
      .error-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: rgba(11, 13, 16, 0.92);
        color: var(--accent-2, #e17d6b);
        padding: 24px;
        text-align: center;
        z-index: 15;
        gap: 12px;
        font-size: 12px;
      }
      .error-overlay svg { width: 32px; height: 32px; }
      .retry-btn {
        background: var(--panel-2, #171b21);
        border: 1px solid var(--line, #232830);
        color: var(--text, #d9dee5);
        padding: 6px 14px;
        border-radius: 6px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
        transition: 0.15s ease;
      }
      .retry-btn:hover { border-color: var(--accent, #7de1c3); color: var(--accent, #7de1c3); }

      /* Toast Notification */
      .toast {
        position: absolute;
        top: 16px;
        right: 16px;
        background: var(--panel, #12151a);
        border: 1px solid var(--accent, #7de1c3);
        color: var(--accent, #7de1c3);
        padding: 8px 14px;
        border-radius: 6px;
        font-size: 11px;
        letter-spacing: 0.05em;
        z-index: 25;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
        opacity: 0;
        transform: translateY(-8px);
        transition: opacity 0.2s ease, transform 0.2s ease;
        pointer-events: none;
      }
      .toast.visible {
        opacity: 1;
        transform: translateY(0);
      }

      /* Control Bar (tmux-style statusline bottom) */
      .controls-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        background: linear-gradient(180deg, transparent, rgba(11, 13, 16, 0.95) 40%);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border-top: 1px solid var(--line, rgba(255, 255, 255, 0.1));
        padding: 8px 14px 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        z-index: 20;
        transition: opacity 0.3s ease, transform 0.3s ease;
      }
      .player-shell.idle .controls-bar {
        opacity: 0;
        transform: translateY(100%);
        pointer-events: none;
      }

      /* Timeline / Progress Scrubber */
      .timeline-container {
        position: relative;
        width: 100%;
        height: 14px;
        display: flex;
        align-items: center;
        cursor: pointer;
        padding: 4px 0;
      }
      .timeline-track {
        position: relative;
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.15);
        border-radius: 2px;
        overflow: hidden;
        transition: height 0.15s ease;
      }
      .timeline-container:hover .timeline-track {
        height: 6px;
      }
      .timeline-buffered {
        position: absolute;
        top: 0; bottom: 0; left: 0;
        background: rgba(255, 255, 255, 0.3);
        width: 0%;
        border-radius: 2px;
      }
      .timeline-progress {
        position: absolute;
        top: 0; bottom: 0; left: 0;
        background: var(--accent, #7de1c3);
        width: 0%;
        border-radius: 2px;
        box-shadow: 0 0 8px var(--accent, #7de1c3);
      }
      .timeline-handle {
        position: absolute;
        top: 50%;
        left: 0%;
        transform: translate(-50%, -50%) scale(0);
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--accent, #7de1c3);
        box-shadow: 0 0 10px rgba(0, 0, 0, 0.8);
        transition: transform 0.15s ease;
      }
      .timeline-container:hover .timeline-handle {
        transform: translate(-50%, -50%) scale(1);
      }

      /* Hover Time Tooltip */
      .time-tooltip {
        position: absolute;
        bottom: 22px;
        transform: translateX(-50%);
        background: var(--panel, #12151a);
        border: 1px solid var(--line, #232830);
        color: var(--text, #d9dee5);
        padding: 3px 7px;
        border-radius: 4px;
        font-size: 10px;
        letter-spacing: 0.05em;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s ease;
        white-space: nowrap;
      }
      .timeline-container:hover .time-tooltip {
        opacity: 1;
      }

      /* Action Row */
      .action-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 11px;
      }
      .ctrl-group {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      /* Icon Buttons */
      .icon-btn {
        background: transparent;
        border: 1px solid transparent;
        color: var(--text, #d9dee5);
        padding: 5px 8px;
        border-radius: 5px;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      }
      .icon-btn:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: var(--line, #232830);
        color: var(--accent, #7de1c3);
      }
      .icon-btn.active {
        color: var(--accent, #7de1c3);
        border-color: rgba(125, 225, 195, 0.3);
        background: rgba(125, 225, 195, 0.08);
      }
      .icon-btn svg {
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.8;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* Volume Container */
      .volume-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .volume-slider-wrap {
        width: 0;
        overflow: hidden;
        transition: width 0.2s ease;
        display: flex;
        align-items: center;
      }
      .volume-group:hover .volume-slider-wrap,
      .volume-slider-wrap:focus-within {
        width: 60px;
      }
      .volume-slider {
        -webkit-appearance: none;
        width: 56px;
        height: 3px;
        background: rgba(255, 255, 255, 0.2);
        border-radius: 2px;
        outline: none;
        cursor: pointer;
      }
      .volume-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: var(--accent, #7de1c3);
        cursor: pointer;
      }

      /* Monospace Timecode */
      .timecode {
        font-size: 11px;
        color: var(--dim, #6b7480);
        margin: 0 4px;
        cursor: pointer;
        user-select: none;
        letter-spacing: 0.04em;
      }
      .timecode b {
        color: var(--text, #d9dee5);
        font-weight: 500;
      }

      /* Speed Selector Menu */
      .popover-wrap {
        position: relative;
      }
      .speed-popover {
        position: absolute;
        bottom: 32px;
        right: 0;
        background: var(--panel, #12151a);
        border: 1px solid var(--line, #232830);
        border-radius: 6px;
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7);
        opacity: 0;
        pointer-events: none;
        transform: translateY(6px);
        transition: opacity 0.15s ease, transform 0.15s ease;
        z-index: 30;
        min-width: 68px;
      }
      .speed-popover.open {
        opacity: 1;
        pointer-events: auto;
        transform: translateY(0);
      }
      .speed-opt {
        background: transparent;
        border: none;
        color: var(--dim, #6b7480);
        padding: 4px 8px;
        font-family: inherit;
        font-size: 11px;
        text-align: left;
        cursor: pointer;
        border-radius: 4px;
        transition: 0.1s ease;
      }
      .speed-opt:hover, .speed-opt.active {
        color: var(--accent, #7de1c3);
        background: rgba(255, 255, 255, 0.05);
      }

      /* Help Modal Overlay */
      .help-modal {
        position: absolute;
        inset: 0;
        background: rgba(11, 13, 16, 0.94);
        backdrop-filter: blur(10px);
        z-index: 40;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        color: var(--text, #d9dee5);
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
      .help-modal.open {
        opacity: 1;
        pointer-events: auto;
      }
      .help-title {
        font-size: 13px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--accent, #7de1c3);
        font-weight: 700;
      }
      .help-grid {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 8px 16px;
        font-size: 11px;
        max-width: 340px;
        width: 100%;
      }
      .kbd {
        background: var(--panel-2, #171b21);
        border: 1px solid var(--line, #232830);
        padding: 2px 6px;
        border-radius: 4px;
        color: var(--accent, #7de1c3);
        font-weight: 600;
        text-align: center;
        display: inline-block;
      }
      .help-close {
        margin-top: 8px;
      }
    </style>

    <div class="player-shell" tabindex="0">
      <video id="vid" preload="metadata"></video>

      <!-- Center Play Overlay -->
      <div class="center-overlay">
        <button class="big-play-btn" id="bigPlayBtn" title="Play/Pause (Space)">
          <svg id="bigPlayIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </button>
      </div>

      <!-- Buffer Spinner -->
      <div class="spinner-overlay" id="spinner" style="display:none;">
        <div class="spinner"></div>
      </div>

      <!-- Error Overlay -->
      <div class="error-overlay" id="errorOverlay" style="display:none;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>
        </svg>
        <span id="errorMsg">Failed to load video source</span>
        <button class="retry-btn" id="retryBtn">Retry</button>
      </div>

      <!-- Toast Notification -->
      <div class="toast" id="toast"></div>

      <!-- Controls Bar -->
      <div class="controls-bar" id="controlsBar">
        <!-- Timeline -->
        <div class="timeline-container" id="timeline">
          <div class="timeline-track">
            <div class="timeline-buffered" id="timelineBuffered"></div>
            <div class="timeline-progress" id="timelineProgress"></div>
          </div>
          <div class="timeline-handle" id="timelineHandle"></div>
          <div class="time-tooltip" id="timeTooltip">00:00</div>
        </div>

        <!-- Action Buttons -->
        <div class="action-row">
          <div class="ctrl-group">
            <button class="icon-btn" id="playBtn" title="Play/Pause (Space)">
              <svg id="playIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/></svg>
            </button>

            <!-- Frame Steps -->
            <button class="icon-btn" id="stepBackBtn" title="Step Back 1 Frame (,) | -5s (←)">
              <svg viewBox="0 0 24 24"><path d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg>
            </button>
            <button class="icon-btn" id="stepFwdBtn" title="Step Forward 1 Frame (.) | +5s (→)">
              <svg viewBox="0 0 24 24"><path d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
            </button>

            <!-- Volume -->
            <div class="volume-group">
              <button class="icon-btn" id="muteBtn" title="Mute (M)">
                <svg id="volIcon" viewBox="0 0 24 24">
                  <path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/>
                </svg>
              </button>
              <div class="volume-slider-wrap">
                <input type="range" class="volume-slider" id="volSlider" min="0" max="1" step="0.05" value="1">
              </div>
            </div>

            <!-- Timecode -->
            <div class="timecode" id="timecode" title="Click to toggle remaining time">
              <b id="currTime">0:00</b> / <span id="durTime">0:00</span>
            </div>
          </div>

          <div class="ctrl-group">
            <!-- Speed Selector -->
            <div class="popover-wrap">
              <button class="icon-btn" id="speedBtn" title="Playback Speed">
                <span id="speedLabel">1.0x</span>
              </button>
              <div class="speed-popover" id="speedPopover">
                <button class="speed-opt" data-speed="0.25">0.25x</button>
                <button class="speed-opt" data-speed="0.5">0.5x</button>
                <button class="speed-opt" data-speed="0.75">0.75x</button>
                <button class="speed-opt active" data-speed="1.0">1.0x</button>
                <button class="speed-opt" data-speed="1.25">1.25x</button>
                <button class="speed-opt" data-speed="1.5">1.5x</button>
                <button class="speed-opt" data-speed="2.0">2.0x</button>
              </div>
            </div>

            <!-- Snapshot / Screenshot -->
            <button class="icon-btn" id="snapBtn" title="Capture Frame Snapshot (S)">
              <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>

            <!-- Loop -->
            <button class="icon-btn" id="loopBtn" title="Toggle Loop (L)">
              <svg viewBox="0 0 24 24"><path d="M17 2l4 4-4 4M3 11v-1a4 4 0 014-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 01-4 4H3"/></svg>
            </button>

            <!-- PiP -->
            <button class="icon-btn" id="pipBtn" title="Picture-in-Picture (P)">
              <svg viewBox="0 0 24 24"><path d="M19 7h-8v6h8V7z"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            </button>

            <!-- Fullscreen -->
            <button class="icon-btn" id="fullscreenBtn" title="Toggle Fullscreen (F)">
              <svg viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
            </button>

            <!-- Help -->
            <button class="icon-btn" id="helpBtn" title="Hotkeys Help (?)">
              <span>?</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Help Modal -->
      <div class="help-modal" id="helpModal">
        <div class="help-title">Terminal Hotkeys</div>
        <div class="help-grid">
          <div><span class="kbd">Space</span> / <span class="kbd">K</span></div><div>Play / Pause</div>
          <div><span class="kbd">Left</span> / <span class="kbd">Right</span></div><div>Seek ±5s (Shift ±1s)</div>
          <div><span class="kbd">,</span> / <span class="kbd">.</span></div><div>Step -1 / +1 Frame</div>
          <div><span class="kbd">Up</span> / <span class="kbd">Down</span></div><div>Volume ±10%</div>
          <div><span class="kbd">F</span></div><div>Toggle Fullscreen</div>
          <div><span class="kbd">M</span></div><div>Mute / Unmute</div>
          <div><span class="kbd">S</span></div><div>Frame Snapshot</div>
          <div><span class="kbd">P</span> / <span class="kbd">L</span></div><div>PiP / Loop</div>
          <div><span class="kbd">0</span> - <span class="kbd">9</span></div><div>Jump 0% - 90%</div>
        </div>
        <button class="retry-btn help-close" id="helpCloseBtn">Close [Esc]</button>
      </div>
    </div>
  `;

  class BMPlayerElement extends HTMLElement {
    constructor() {
      super();
      const shadow = this.attachShadow({ mode: 'open' });
      shadow.appendChild(template.content.cloneNode(true));

      // Elements
      this.shell = shadow.querySelector('.player-shell');
      this.video = shadow.querySelector('#vid');
      this.bigPlayBtn = shadow.querySelector('#bigPlayBtn');
      this.bigPlayIcon = shadow.querySelector('#bigPlayIcon');
      this.playBtn = shadow.querySelector('#playBtn');
      this.playIcon = shadow.querySelector('#playIcon');
      this.stepBackBtn = shadow.querySelector('#stepBackBtn');
      this.stepFwdBtn = shadow.querySelector('#stepFwdBtn');
      this.muteBtn = shadow.querySelector('#muteBtn');
      this.volIcon = shadow.querySelector('#volIcon');
      this.volSlider = shadow.querySelector('#volSlider');
      this.timecode = shadow.querySelector('#timecode');
      this.currTimeEl = shadow.querySelector('#currTime');
      this.durTimeEl = shadow.querySelector('#durTime');
      this.speedBtn = shadow.querySelector('#speedBtn');
      this.speedLabel = shadow.querySelector('#speedLabel');
      this.speedPopover = shadow.querySelector('#speedPopover');
      this.snapBtn = shadow.querySelector('#snapBtn');
      this.loopBtn = shadow.querySelector('#loopBtn');
      this.pipBtn = shadow.querySelector('#pipBtn');
      this.fullscreenBtn = shadow.querySelector('#fullscreenBtn');
      this.helpBtn = shadow.querySelector('#helpBtn');
      this.helpModal = shadow.querySelector('#helpModal');
      this.helpCloseBtn = shadow.querySelector('#helpCloseBtn');
      this.spinner = shadow.querySelector('#spinner');
      this.errorOverlay = shadow.querySelector('#errorOverlay');
      this.errorMsg = shadow.querySelector('#errorMsg');
      this.retryBtn = shadow.querySelector('#retryBtn');
      this.toast = shadow.querySelector('#toast');

      // Timeline
      this.timeline = shadow.querySelector('#timeline');
      this.timelineBuffered = shadow.querySelector('#timelineBuffered');
      this.timelineProgress = shadow.querySelector('#timelineProgress');
      this.timelineHandle = shadow.querySelector('#timelineHandle');
      this.timeTooltip = shadow.querySelector('#timeTooltip');

      // State
      this._showRemaining = false;
      this._idleTimer = null;
      this._isScrubbing = false;
      this._toastTimer = null;
    }

    static get observedAttributes() {
      return ['src', 'referrerpolicy', 'autoplay', 'loop', 'muted'];
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (oldVal === newVal) return;
      if (name === 'src') {
        this.load(newVal);
      } else if (name === 'referrerpolicy') {
        if (newVal) this.video.setAttribute('referrerpolicy', newVal);
        else this.video.removeAttribute('referrerpolicy');
      } else if (name === 'autoplay') {
        this.video.autoplay = this.hasAttribute('autoplay');
      } else if (name === 'loop') {
        this.video.loop = this.hasAttribute('loop');
        this.loopBtn.classList.toggle('active', this.video.loop);
      } else if (name === 'muted') {
        this.video.muted = this.hasAttribute('muted');
        this.updateVolumeUI();
      }
    }

    connectedCallback() {
      this.setupEvents();
      if (this.hasAttribute('src')) {
        this.load(this.getAttribute('src'));
      }
    }

    disconnectedCallback() {
      if (this._idleTimer) clearTimeout(this._idleTimer);
      if (this._toastTimer) clearTimeout(this._toastTimer);
    }

    // Public API
    load(url) {
      const src = url || this.getAttribute('src');
      if (!src) return;
      this.errorOverlay.style.display = 'none';
      this.spinner.style.display = 'flex';
      this.video.src = src;
      if (this.hasAttribute('referrerpolicy')) {
        this.video.setAttribute('referrerpolicy', this.getAttribute('referrerpolicy'));
      }
      this.video.load();
    }

    play() {
      return this.video.play().catch(e => {
        this.showError('Autoplay blocked or playback error');
      });
    }

    pause() {
      this.video.pause();
    }

    togglePlay() {
      if (this.video.paused) this.play();
      else this.pause();
    }

    seek(seconds) {
      if (!isNaN(this.video.duration)) {
        this.video.currentTime = Math.max(0, Math.min(this.video.duration, seconds));
      }
    }

    stepFrame(frames = 1) {
      this.pause();
      const frameDuration = 1 / 30; // approx 30fps
      this.seek(this.video.currentTime + (frames * frameDuration));
    }

    toggleMute() {
      this.video.muted = !this.video.muted;
      this.updateVolumeUI();
    }

    setVolume(val) {
      this.video.volume = Math.max(0, Math.min(1, val));
      if (this.video.volume > 0 && this.video.muted) {
        this.video.muted = false;
      }
      this.updateVolumeUI();
    }

    setSpeed(rate) {
      this.video.playbackRate = parseFloat(rate);
      this.speedLabel.textContent = `${rate}x`;
      this.shadowRoot.querySelectorAll('.speed-opt').forEach(opt => {
        opt.classList.toggle('active', opt.getAttribute('data-speed') === String(rate));
      });
      this.speedPopover.classList.remove('open');
    }

    toggleLoop() {
      this.video.loop = !this.video.loop;
      this.loopBtn.classList.toggle('active', this.video.loop);
      this.showToast(this.video.loop ? 'LOOP: ON' : 'LOOP: OFF');
    }

    async togglePip() {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else if (this.video.requestPictureInPicture) {
          await this.video.requestPictureInPicture();
        }
      } catch (e) {
        this.showToast('PiP not supported or blocked');
      }
    }

    toggleFullscreen() {
      if (!document.fullscreenElement) {
        this.shell.requestFullscreen().catch(() => {
          this.video.requestFullscreen().catch(() => {});
        });
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }

    snapshot() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = this.video.videoWidth || 1280;
        canvas.height = this.video.videoHeight || 720;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
        
        const timestamp = Math.floor(this.video.currentTime);
        const filename = `frame_${timestamp}s.png`;

        canvas.toBlob((blob) => {
          if (!blob) {
            this.showToast('Canvas capture failed');
            return;
          }
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(blobUrl);

          this.showToast(`SNAPSHOT SAVED (${canvas.width}x${canvas.height})`);
          this.dispatchEvent(new CustomEvent('snapshot', {
            bubbles: true,
            composed: true,
            detail: { blob, filename, dataUrl: canvas.toDataURL() }
          }));
        }, 'image/png');
      } catch (e) {
        this.showToast('Snapshot blocked (CORS header missing)');
      }
    }

    showToast(msg) {
      this.toast.textContent = msg;
      this.toast.classList.add('visible');
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        this.toast.classList.remove('visible');
      }, 2000);
    }

    showError(msg) {
      this.spinner.style.display = 'none';
      this.errorMsg.textContent = msg;
      this.errorOverlay.style.display = 'flex';
      this.dispatchEvent(new CustomEvent('error', {
        bubbles: true,
        composed: true,
        detail: { message: msg }
      }));
    }

    // Format seconds into mm:ss or hh:mm:ss
    formatTime(sec) {
      if (isNaN(sec) || sec < 0) return '0:00';
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60).toString().padStart(2, '0');
      if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s}`;
      }
      return `${m}:${s}`;
    }

    updateVolumeUI() {
      const vol = this.video.muted ? 0 : this.video.volume;
      this.volSlider.value = vol;
      if (vol === 0) {
        this.volIcon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6"/>';
      } else if (vol < 0.5) {
        this.volIcon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07"/>';
      } else {
        this.volIcon.innerHTML = '<path d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/>';
      }
    }

    updateTimecodeUI() {
      const curr = this.video.currentTime || 0;
      const dur = this.video.duration || 0;
      if (this._showRemaining && dur > 0) {
        this.currTimeEl.textContent = `-${this.formatTime(dur - curr)}`;
      } else {
        this.currTimeEl.textContent = this.formatTime(curr);
      }
      this.durTimeEl.textContent = this.formatTime(dur);

      // Progress bar fill
      const pct = dur > 0 ? (curr / dur) * 100 : 0;
      this.timelineProgress.style.width = `${pct}%`;
      this.timelineHandle.style.left = `${pct}%`;

      // Buffer fill
      if (this.video.buffered.length > 0) {
        const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
        const bufPct = dur > 0 ? (bufferedEnd / dur) * 100 : 0;
        this.timelineBuffered.style.width = `${bufPct}%`;
      }
    }

    resetIdleTimer() {
      this.shell.classList.remove('idle');
      if (this._idleTimer) clearTimeout(this._idleTimer);
      if (!this.video.paused) {
        this._idleTimer = setTimeout(() => {
          this.shell.classList.add('idle');
        }, 2500);
      }
    }

    setupEvents() {
      // Video Element Events
      this.video.addEventListener('loadedmetadata', () => {
        this.spinner.style.display = 'none';
        this.updateTimecodeUI();
        if (this.hasAttribute('autoplay')) this.play();
        this.dispatchEvent(new CustomEvent('loadedmetadata', { bubbles: true, composed: true }));
        this.dispatchEvent(new CustomEvent('meta', {
          bubbles: true,
          composed: true,
          detail: { duration: this.video.duration, width: this.video.videoWidth, height: this.video.videoHeight }
        }));
      });

      this.video.addEventListener('playing', () => {
        this.spinner.style.display = 'none';
        this.bigPlayBtn.classList.add('playing');
        this.playIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" fill="currentColor" stroke="none"/>';
        this.bigPlayIcon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        this.resetIdleTimer();
        this.dispatchEvent(new CustomEvent('playing', { bubbles: true, composed: true }));
      });

      this.video.addEventListener('pause', () => {
        this.bigPlayBtn.classList.remove('playing');
        this.playIcon.innerHTML = '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>';
        this.bigPlayIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        this.shell.classList.remove('idle');
        this.dispatchEvent(new CustomEvent('pause', { bubbles: true, composed: true }));
      });

      this.video.addEventListener('timeupdate', () => {
        if (!this._isScrubbing) {
          this.updateTimecodeUI();
        }
        this.dispatchEvent(new CustomEvent('timeupdate', {
          bubbles: true,
          composed: true,
          detail: { currentTime: this.video.currentTime, duration: this.video.duration }
        }));
      });

      this.video.addEventListener('waiting', () => {
        this.spinner.style.display = 'flex';
      });

      this.video.addEventListener('error', () => {
        this.showError('Could not play video source');
      });

      // Controls UI Events
      this.bigPlayBtn.addEventListener('click', () => this.togglePlay());
      this.playBtn.addEventListener('click', () => this.togglePlay());
      this.retryBtn.addEventListener('click', () => this.load());

      this.video.addEventListener('click', () => this.togglePlay());

      this.stepBackBtn.addEventListener('click', () => this.stepFrame(-1));
      this.stepFwdBtn.addEventListener('click', () => this.stepFrame(1));

      this.muteBtn.addEventListener('click', () => this.toggleMute());
      this.volSlider.addEventListener('input', (e) => this.setVolume(parseFloat(e.target.value)));

      this.timecode.addEventListener('click', () => {
        this._showRemaining = !this._showRemaining;
        this.updateTimecodeUI();
      });

      // Speed Selector Popover
      this.speedBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.speedPopover.classList.toggle('open');
      });
      this.shadowRoot.querySelectorAll('.speed-opt').forEach(opt => {
        opt.addEventListener('click', (e) => {
          this.setSpeed(e.target.getAttribute('data-speed'));
        });
      });
      document.addEventListener('click', () => {
        this.speedPopover.classList.remove('open');
      });

      // Feature Buttons
      this.snapBtn.addEventListener('click', () => this.snapshot());
      this.loopBtn.addEventListener('click', () => this.toggleLoop());
      this.pipBtn.addEventListener('click', () => this.togglePip());
      this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

      // Help Modal
      this.helpBtn.addEventListener('click', () => this.helpModal.classList.add('open'));
      this.helpCloseBtn.addEventListener('click', () => this.helpModal.classList.remove('open'));

      // Timeline Scrubber Drag & Click
      const handleScrub = (e) => {
        const rect = this.timeline.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const targetTime = pos * (this.video.duration || 0);
        
        this.timeTooltip.textContent = this.formatTime(targetTime);
        this.timeTooltip.style.left = `${pos * 100}%`;

        if (this._isScrubbing) {
          this.timelineProgress.style.width = `${pos * 100}%`;
          this.timelineHandle.style.left = `${pos * 100}%`;
          this.seek(targetTime);
        }
      };

      this.timeline.addEventListener('mousemove', (e) => handleScrub(e));
      this.timeline.addEventListener('mousedown', (e) => {
        this._isScrubbing = true;
        handleScrub(e);
      });
      window.addEventListener('mousemove', (e) => {
        if (this._isScrubbing) handleScrub(e);
      });
      window.addEventListener('mouseup', () => {
        if (this._isScrubbing) {
          this._isScrubbing = false;
        }
      });

      // Mouse Inactivity Listener
      this.shell.addEventListener('mousemove', () => this.resetIdleTimer());

      // Keyboard Hotkeys
      this.shell.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const key = e.key.toLowerCase();
        if (key === ' ' || key === 'k') {
          e.preventDefault();
          this.togglePlay();
        } else if (key === 'f') {
          e.preventDefault();
          this.toggleFullscreen();
        } else if (key === 'm') {
          e.preventDefault();
          this.toggleMute();
        } else if (key === 'p') {
          e.preventDefault();
          this.togglePip();
        } else if (key === 's') {
          e.preventDefault();
          this.snapshot();
        } else if (key === 'l') {
          e.preventDefault();
          this.toggleLoop();
        } else if (key === ',') {
          e.preventDefault();
          this.stepFrame(-1);
        } else if (key === '.') {
          e.preventDefault();
          this.stepFrame(1);
        } else if (key === 'arrowleft') {
          e.preventDefault();
          const step = e.shiftKey ? 1 : 5;
          this.seek((this.video.currentTime || 0) - step);
        } else if (key === 'arrowright') {
          e.preventDefault();
          const step = e.shiftKey ? 1 : 5;
          this.seek((this.video.currentTime || 0) + step);
        } else if (key === 'arrowup') {
          e.preventDefault();
          this.setVolume(this.video.volume + 0.1);
        } else if (key === 'arrowdown') {
          e.preventDefault();
          this.setVolume(this.video.volume - 0.1);
        } else if (key >= '0' && key <= '9') {
          e.preventDefault();
          const pct = parseInt(key, 10) * 0.1;
          this.seek((this.video.duration || 0) * pct);
        } else if (key === 'escape') {
          this.helpModal.classList.remove('open');
        }
      });
    }

    // Getters
    get duration() { return this.video.duration || 0; }
    get currentTime() { return this.video.currentTime || 0; }
    get paused() { return this.video.paused; }
    get volume() { return this.video.volume; }
    get muted() { return this.video.muted; }
  }

  // Register Custom Element
  window.customElements.define('bm-player', BMPlayerElement);
  window.BMPlayer = BMPlayerElement;

  // Register Alpine.js Component Helper if Alpine is available
  function initAlpinePlugin() {
    if (window.Alpine) {
      window.Alpine.data('bmPlayer', (config = {}) => ({
        src: config.src || '',
        referrerpolicy: config.referrerpolicy || '',
        init() {
          if (config.src) this.src = config.src;
        }
      }));
    }
  }

  if (window.Alpine) {
    initAlpinePlugin();
  } else {
    document.addEventListener('alpine:init', initAlpinePlugin);
  }
})();
