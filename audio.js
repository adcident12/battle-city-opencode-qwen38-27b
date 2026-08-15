var Sfx = (function () {
  "use strict";
  var ctx = null, muted = false;

  function ensure() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // tone(startFreq, endFreq, duration, type, gain)
  function tone(f0, f1, dur, type, vol) {
    var c = ensure();
    if (!c || muted) return;
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(f0, c.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.04, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    osc.connect(g); g.connect(c.destination);
    osc.start(); osc.stop(c.currentTime + dur);
  }

  var SOUNDS = {
    shoot:        function () { tone(880, 220, 0.08, "square", 0.03); },
    brick_break:  function () { tone(200, 60, 0.12, "square", 0.05); },
    steel_hit:    function () { tone(1200, 400, 0.05, "square", 0.02); },
    explode_small:function () { noise(0.25, 0.06); },
    explode_big:  function () { noise(0.5, 0.1); tone(120, 30, 0.4, "sawtooth", 0.06); },
    powerup:      function () { tone(440, 880, 0.15, "square", 0.04); tone(880, 1760, 0.12, "square", 0.03); },
    star:         function () { tone(523, 1046, 0.1, "square", 0.04); tone(1046, 1568, 0.15, "square", 0.04); },
    fort_destroy: function () { noise(0.8, 0.12); tone(80, 20, 0.7, "sawtooth", 0.08); },
    stage_clear:  function () { [523, 659, 784, 1046].forEach(function (f, i) {
      setTimeout(function () { tone(f, f, 0.12, "square", 0.04); }, i * 130); }); },
    game_over:    function () { [392, 330, 262, 196, 131].forEach(function (f, i) {
      setTimeout(function () { tone(f, f, 0.2, "square", 0.05); }, i * 180); }); }
  };

  function noise(dur, vol) {
    var c = ensure();
    if (!c || muted) return;
    var len = Math.floor(c.sampleRate * dur);
    var buf = c.createBuffer(1, len, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = c.createBufferSource(); src.buffer = buf;
    var g = c.createGain(); g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    src.connect(g); g.connect(c.destination);
    src.start();
  }

  SOUNDS.noise = noise;

  function play(name) {
    var fn = SOUNDS[name];
    if (fn) fn();
  }

  return { play: play, toggleMute: function () { muted = !muted; return muted; },
           isMuted: function () { return muted; }, unlock: ensure };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Sfx;
