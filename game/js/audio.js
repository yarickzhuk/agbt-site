// audio.js — plain WebAudio one-shots. Files decoded once, replayed cheaply.

const ctx = new (window.AudioContext || window.webkitAudioContext)();
const buffers = {};
const loops = {};   // name -> { src, gain } while looping

// EVERY sound plays backwards while DELTA is the equipped costume (per direct
// request: "if you chose delta reskin, EVERY SOUND IS REVERSED, even boss
// announcements and toxic mode voice lines"; it started as themes only).
// setReverseAll is flipped at boot and on equipping a costume; play()/loop()
// then swap any buffer for its reversed copy (built on first use), keeping
// the loop's own name so every stopLoop() call still works. A buffer that is
// itself a reversed copy (`<name>Rev`: Delta's and the DELTA skin's weapon
// cues) is already backwards and plays as it is.
let reverseAll = false;
const reversedNames = new Set();
const LOOP_FADE = 0.15;   // default fade in/out for loop()/stopLoop(), seconds

// Master volume (OPTIONS menu, settings.js): a single shared GainNode
// everything routes through on its way to ctx.destination, rather than a
// per-sound-source concern -- every existing play()/loop()/beep() call's
// own `volume` argument keeps working exactly as before, just scaled by
// this one extra multiplier on top.
const masterGain = ctx.createGain();
masterGain.connect(ctx.destination);

// short name -> filename under assets/sounds/
const FILES = {
  shoot: 'pew_bullet_louder.wav',
  torpedo: 'charge_fire.wav',
  hurt: 'hurt_single.wav',
  death: 'DED.wav',
  roastVertical: 'Roast_mobile_vertical.wav',   // the 'Y u do this?' Game Over (main.js)
  meteor1: 'Meteor_1.wav',
  meteor2: 'Meteor_2.wav',
  meteor3: 'Meteor_3.wav',
  ricochet: 'Bomb_rickoshet.wav',
  destroyCyan: 'destroyed_cyan.wav',
  destroyIndigo: 'Destroyed_indigo.mp3',
  splash: 'Splash.wav',
  laserU: 'Lazer_U.wav',
  laserM: 'Lazer_M.wav',
  laserD: 'Lazer_D.wav',
  press: 'Press.wav',
  warning: 'warning_robot.wav',
  bossTheme: 'TrapCircle_theme.wav',
  bossHurt: 'Boss_hurt.wav',
  bossDefeat: 'Boss_defeat.mp3',
  bossIntro: 'Stage_boss_intro_Lead.wav',
  mothership: 'Mothership_invasion.wav',
  crystalCrack: 'Crystal_crack1.wav',
  crystalExtract: 'Crystal_extract.wav',
  crystalCollect: 'Crystal_collect_L.wav',
  stageClear: 'Stage_Clear.wav',
  stageMenu: 'Stage_menu_Lead_trimmed.wav',   // looping theme on the stage-select hub
  shotgunFire: 'Shotgun_blast.mp3',   // the blast when the shotgun fires
  shotgunReload: 'Shotgun_reload.wav',   // racked during the cooldown after each volley
  bouncyShoot: 'Bouncy_ball_shoot.wav',   // the Bouncy Ball weapon's fire sound
  bouncyBounce: 'Bouncy_ball_bounce.wav', // played each time it actually bounces off something
  sawBreak: 'Saw_break.mp3',
  kangWait: 'Kangunroo_wait.wav',   // boss taunt / stare-down
  kangFoul: 'Kangunroo_foul.wav',   // pressed too early
  kangHit: 'Kangunroo_hit.wav',     // player lands a hit
  kangBang: 'Kangunroo_lose.wav',   // the Bang! attack
  pause: 'Pause.wav',       // NES-style hard freeze in
  unpause: 'Unpause.wav',   // and back out
  cheatStart: 'Cheat_start.wav',     // first direction key of the cheat sequence
  cheatInput: 'Cheat_input.wav',     // every subsequent correct key in the sequence
  cheatSuccess: 'Cheat_success.wav', // the sequence was completed and confirmed
  peanutSpawn: 'Peanut_spawn.wav',   // CRAZY CARNIVAL's peanut pickup/hazard appears
  peanutPop: 'Peanut_pop.wav',       // every time it's shot and its outcome re-rolls
  peanutGood: 'Peanut_1.wav',        // green outcome lands on the player (heal)
  peanutBad: 'Peanut_0.wav',         // purple (or never-shot) outcome lands (obstacle)
  cornPop: 'Corn_pop.wav',           // CRAZY CARNIVAL's corn: a real hit, and each seed it spits
  fireworkFly: 'Firework_fly.wav',   // a rocket's whoosh once its fuse is lit
  clownLaughA: 'Clown_laugh_A.wav',   // the clown's laugh, remade robotic (ring-mod + bitcrush)
  clownLaughC: 'Clown_laugh_C.wav',   // a second robotic laugh variant, picked at random with the above
  lollypopPop: 'Lollypop_pop.wav',    // a lollipop arms (becomes a real hazard)
  dartShot: 'Dart_shot.wav',    // a dart launches from the edge
  dartStuck: 'Dart_stuck.wav',  // it finishes crossing and embeds itself
  clownhouseMaze: 'Clownhouse_maze.wav',   // looping theme for Showman's maze intro
  showmanTheme: 'Showman_theme.wav',       // looping theme for the Showman duel itself
  showmanVoice: 'Showman_voice.wav',       // his one taunt line, remade robotic (ring-mod + bitcrush)
  slasherSlash: 'Line_slasher_slash.wav',   // LINE SLASHER's melee swing
  slasherDash: 'Line_slasher_dash.wav',     // its charged dash
  knightPop: 'Knight_pop.wav',       // telegraphs its sword swing (the source's own unused "поп" sfx)
  knightSlash: 'Knight_slash.wav',   // each of the 3 beats of its own sword swing
  ghostPresence: 'Ghost_presence.wav',   // the Ghost's own quiet hiss while still disguised
  mazeSpawn: 'Maze_spawn.wav',   // a gem telegraph finishes and its wall snaps into place
  flameIdle: 'Flame_idle.wav',   // looping ambience while any Flame is loose in phase 4
  spearSpawn: 'Spear_spawn.wav', // a Spear launches, phase 4
  wheelSpin: 'X_door_spin.wav',  // THE WHEEL (phase 4) actively spinning, looped
  plasmaTheme: 'Plasmadrache_theme.wav',            // OCCÜLTACRESBURG's boss (phase 5), looping
  plasmaChomp: 'Plasmadrache_chomp_instakill.wav',  // uploaded but unused in the source -- the chomp easter egg's own cue
  skinFireworkShot: 'Skin_firework_shot.wav',   // FIREWORK costume's charged shot (its bullet sprite's own Dart_shot)
  // Achievement unlock jingles, one per rarity (common / rare / legendary / mythical).
  achievementCommon: 'Achievement_common.wav',
  achievementRare: 'Achievement_rare.wav',
  achievementLegendary: 'Achievement_legendary.wav',
  achievementMythical: 'Achievement_mythical.wav',
  skinDragonShot: 'Skin_dragon_shot.wav',       // DRAGON costume's shot (its ship sprite's own Plasmadrache_flame)
  plasmaFlame: 'Plasmadrache_flame.wav',            // each fireball launches
  plasmaWallPop: 'Dart_pop.wav',   // a wall snaps into place -- the source's own Wall "поп" is byte-identical to this existing file
  levelSelectStart: 'LS_start.wav',   // played once on entering the stage-select hub
  levelSelectPress: 'LS_press.wav',   // played on each cursor move / selection in the hub
  chargeStart: 'Charge_start.wav',    // Charge Cannon: the instant a charge begins
  chargeHold: 'Charge_hold.wav',      // looped while it's held, up through the supercharge threshold
  chargeFull: 'Charge_full.wav',      // one-shot "ready" cue the instant supercharge is reached
  disruptorWaveSingle: 'Disruptor_wave_single.wav',   // played once, the first wave only -- a technical backup cue
  disruptorWaveLoop: 'Disruptor_wave_loop.wav',       // looped the whole time the Disruptor is alive
  cometFly: 'Comet_fly.wav',   // a comet's own travel whoosh, once per flight
  trapCircleBeats: 'TrapCircle_beats.wav',   // Trap Circle Delta: layered under bossTheme, not a replacement
  checkpointReach: 'Checkpoint_reach.wav',     // OUTER SPACE: a mid-level checkpoint activates
  checkpointRevive: 'Checkpoint_revive.wav',   // and this plays when a death respawns you there
  kangunrooTheme: 'Kangunroo_theme.mp3',   // Boss Rush: Kangunroo Delta's own theme, shoot phase only
  plasmaDeltaTheme: 'Plasmadrache_Delta_theme.mp3',            // Plasmadrache Delta, phase 1 (full body)
  plasmaDeltaHeadTheme: 'Plasmadrache_Delta_head_theme.wav',   // Plasmadrache Delta, phase 2 (head only)
  intruderAlarm: 'Intruder_alert.wav',         // OUTER SPACE boss intro: siren, looped only for the flash
  intruderVoice: 'Intruder_alert_voice.wav',
  diveA: 'Dive_A.wav',              // DELTA UNIT: a Divebomber's dive (one 4s cycle of the looped upload)
  diveB: 'Dive_B.wav',              // and a Commando's
  commandoPew: 'Commando_pew.wav',  // each Commando shot
  shooterPew: 'Shooter_pew.wav',    // each Shooter shot
  // DELTA UNIT's own theme: the 32s Delta_Unit.wav upload cut at its
  // 4s seams into one part per wave, layered over trapCircleBeats (fleet.js).
  deltaUnit1: 'Delta_Unit_1.wav', deltaUnit2: 'Delta_Unit_2.wav',
  deltaUnit3: 'Delta_Unit_3.wav', deltaUnit4: 'Delta_Unit_4.wav',
  deltaUnit5: 'Delta_Unit_5.wav', deltaUnit6: 'Delta_Unit_6.wav',
  deltaUnit7: 'Delta_Unit_7.wav', deltaUnit8: 'Delta_Unit_8.wav',
  // THE FINALE's mothership fight: plays after Mothership_invasion.wav,
  // 0-3s once, loops 3.0-38.5s (an exact 35.5s repeat), ends from 49.5s.
  mothershipAttacks: 'Mothership_Attacks.mp3',
  mothershipBuildUp: 'Destroyed_mothership_build_up.wav',   // THE FINALE defeat: shaking hull
  mothershipEnd: 'Destroyed_mothership_end.wav',            // ...then the blast
  // THE FINALE phases 2-5 (polytope.js): each polytope's own track
  finaleTesseract: 'Finale_tesseract.wav',
  finalePentachoron: 'Finale_pentachoron.wav',
  finale24cell: 'Finale_24cell.wav',
  finale120cell: 'Finale_120cell.wav',
  // THE FINALE phase 6, DELTA (delta.js)
  deltaTheme: 'vs_Delta.wav',                  // his own 120s track, looped for the fight
  finalAlert: 'Final_battle_alert.wav',        // replaces the intruder siren for this one boss
  finalVoice: 'Final_battle_voice.wav',        // "This is the end, prepare to meet your doom, Player"
  deltaDestroyed: 'Destroyed_Delta.wav',       // the victory screen's sound, instead of stageClear
  // The intro cutscene, "Monochrome Era" (intro.js), from Monochrome_Era.sb3
  introCrystalCreate: 'Intro_crystal_create.wav',
  introCrystalMerge: 'Intro_crystal_merge.wav',
  introCrystalMerged: 'Intro_crystal_merged.wav',
  introCrystalSpin: 'Intro_crystal_spin.wav',
  introCrystalDestroyed: 'Intro_crystal_destroyed.wav',
  introHurt: 'Intro_hurt.wav',
  introDeltaCreate: 'Intro_delta_create.wav',
  introDeltaMerge: 'Intro_delta_merge.wav',
  introDeltaMerged: 'Intro_delta_merged.wav',
  introCapture: 'Intro_capture.wav',          // the source's own Stage_Clear.wav, under Delta's capture
  outroDrone: 'Outro_drone.wav',              // the final cutscene, part 1: each aspect landing
  outroBuildUp: 'Outro_build_up.wav',         // part 1: under the spin (38s, played once)
  bigBang: 'Big_bang.wav',                    // part 2: an original synthesized rumble (tools/bigbang_synth.py)
  shieldSpin: 'Shield_spin_loop.wav',         // the Bomb Shield: loops while it's out
  shieldConsumed: 'Shield_sphere_consumed.wav', // the Bomb Shield: a sphere used up
};

// Exported so main.js's own boot-progress percentage can size itself against
// the real sound count without duplicating (or getting out of sync with)
// the FILES map above.
export const SOUND_NAMES = Object.keys(FILES);

// Sounds loaded in the background after boot (main.js's BOOT_SOUNDS):
// Audio.loadLater starts it, waitForSounds(world) holds a level (or the
// ending cutscene) with a LOADING readout until it's done.
let laterPromise = Promise.resolve(), laterDone = 0, laterTotal = 0, laterFinished = true;
export async function waitForSounds(world) {
  if (laterFinished) return;
  const t = new PIXI.Text('', { fontFamily: 'Tektur, monospace', fontSize: 28, fill: 0xffffff, letterSpacing: 4 });
  t.anchor.set(0.5);
  t.position.set(world.app.renderer.screen.width / 2, world.app.renderer.screen.height / 2);
  t.zIndex = 300;
  world.stage.addChild(t);
  const step = () => { t.text = `LOADING… ${Math.round(laterDone / Math.max(1, laterTotal) * 100)}%`; };
  step();
  world.app.ticker.add(step);
  await laterPromise;
  world.app.ticker.remove(step);
  t.destroy();
}

export const Audio = {
  loadLater(names) {
    laterTotal = names.length; laterDone = 0; laterFinished = false;
    laterPromise = this.load(names, () => { laterDone++; }).then(() => { laterFinished = true; });
    return laterPromise;
  },
  // `onItem`, if given, is called once per sound as it finishes loading (or
  // fails) -- see SOUND_NAMES' own comment above for why main.js reads this
  // rather than this file knowing anything about a loading screen itself.
  async load(names = SOUND_NAMES, onItem) {
    await Promise.all(names.map(async n => {
      try {
        const buf = await fetch(`assets/sounds/${FILES[n]}`).then(r => r.arrayBuffer());
        buffers[n] = await ctx.decodeAudioData(buf);
      } catch (e) { console.warn('sound failed', n, e); }
      if (onItem) onItem();
    }));
  },

  // Load one extra file under `name` (path relative to assets/sounds/).
  // Used by roast.js for TOXIC MODE's voicelines, which live outside FILES.
  async loadFile(name, path) {
    if (buffers[name]) return true;
    try {
      const buf = await fetch(`assets/sounds/${path}`).then(r => r.arrayBuffer());
      buffers[name] = await ctx.decodeAudioData(buf);
      return true;
    } catch (e) { console.warn('sound failed', name, e); return false; }
  },
  has(name) { return !!buffers[name]; },

  // `when` (an Audio.now() time, 0 = right away) and `offset` (seconds into
  // the buffer) are optional -- THE FINALE schedules its music back to back
  // and starts its ending partway into a longer track.
  play(name, volume = 1, when = 0, offset = 0) {
    const rev = this.musicRev(name);
    let buf = buffers[name], dur;
    // Reversed, the stretch [offset, end] is the buffer's first (end - offset)
    // seconds (e.g. THE FINALE's mothership-track ending).
    if (rev) { buf = rev; if (offset > 0) { dur = rev.duration - offset; offset = 0; } }
    if (!buf) return;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(masterGain);
    if (dur != null) src.start(when, offset, dur); else src.start(when, offset);
    src.gainNode = gain;   // so a caller can fade a one-shot out early (intro.js)
    return src;
  },

  // Builds a time-reversed copy of an already-loaded sound under `as`
  // (default `<name>Rev`) -- Delta's weapons sound like the player's own,
  // played backwards, without shipping a second file per sound.
  setReverseAll(on) { reverseAll = !!on; },
  isReversed() { return reverseAll; },
  // The reversed buffer to use for `name`, or null (not DELTA, or already reversed).
  musicRev(name) {
    if (!reverseAll || !buffers[name] || reversedNames.has(name)) return null;
    this.reverse(name);
    return buffers[name + 'Rev'];
  },

  reverse(name, as = name + 'Rev') {
    const b = buffers[name];
    if (!b || buffers[as]) return;
    const r = ctx.createBuffer(b.numberOfChannels, b.length, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) {
      const src = b.getChannelData(c), dst = r.getChannelData(c);
      for (let i = 0, n = src.length; i < n; i++) dst[i] = src[n - 1 - i];
    }
    buffers[as] = r;
    reversedNames.add(as);
  },

  now() { return ctx.currentTime; },
  duration(name) { return buffers[name] ? buffers[name].duration : 0; },

  // Ramps in from silence over `fadeIn` seconds instead of jumping straight
  // to `volume` — a raw sample looped with a hard-edged gain change (or
  // manually re-triggered back-to-back, the way e.g. Wheel's own Scratch
  // source plays its spin sound) tends to leave an audible click/gap at the
  // seam; a short linear ramp smooths both the start and every later
  // restart (e.g. THE WHEEL's spin sound stopping while idle and resuming
  // once it spins again) the same way.
  //
  // `sync` ({ to: <another loop's name>, grid: <seconds> }) delays the start
  // to that loop's next `grid`-second boundary, so two stems of one piece
  // (DELTA UNIT's per-wave theme over its beats) stay on the beat
  // however late in the bar the second one is asked to come in.
  loop(name, volume = 0.5, fadeIn = LOOP_FADE, sync = null) {
    const rev = this.musicRev(name);
    const buf = rev || buffers[name];
    if (!buf || loops[name]) return;
    if (ctx.state === 'suspended') ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const gain = ctx.createGain();
    let t = ctx.currentTime;
    const base = sync && sync.to && loops[sync.to];
    if (base) t = base.start + Math.ceil((t - base.start) / sync.grid - 1e-6) * sync.grid;
    if (sync && sync.at != null) t = Math.max(t, sync.at);
    let offset = 0;
    if (sync && sync.loopEnd) {
      if (rev) {   // the same stretch, mirrored; start right in it
        src.loopStart = buf.duration - sync.loopEnd;
        src.loopEnd = buf.duration - (sync.loopStart || 0);
        offset = src.loopStart;
      } else { src.loopStart = sync.loopStart || 0; src.loopEnd = sync.loopEnd; }
    }
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(volume, t + fadeIn);
    src.connect(gain).connect(masterGain);
    src.start(t, offset);
    loops[name] = { src, gain, start: t };
  },

  // Ramps down to silence over `fadeOut` seconds before actually stopping
  // the source, rather than cutting it off mid-waveform. The name is freed
  // immediately (so a fresh loop() call can start right away, e.g. Wheel
  // resuming its spin sound the very next frame) while the old source's
  // fade-out tail finishes on its own.
  stopLoop(name, fadeOut = LOOP_FADE) {
    // A reversed twin (DELTA's `<name>Rev`, see costumes.js) stops with it,
    // so callers that only know the stock name still silence it.
    if (loops[name + 'Rev']) this.stopLoop(name + 'Rev', fadeOut);
    const l = loops[name];
    if (!l) return;
    delete loops[name];
    const t = ctx.currentTime;
    try {
      l.gain.gain.cancelScheduledValues(t);
      l.gain.gain.setValueAtTime(l.gain.gain.value, t);
      l.gain.gain.linearRampToValueAtTime(0, t + fadeOut);
      l.src.stop(t + fadeOut);
    } catch (e) { try { l.src.stop(); } catch (e2) {} }
  },

  // Glides a playing loop's volume to `volume` (no-op if it isn't playing).
  // The ghost's hiss uses it to grow louder as a disguised Ghost closes in.
  setLoopVolume(name, volume, smooth = 0.08) {
    const l = loops[name + 'Rev'] || loops[name];
    if (!l) return;
    const t = Math.max(ctx.currentTime, l.start + LOOP_FADE);
    try { l.gain.gain.setTargetAtTime(volume, t, smooth); } catch (e) {}
  },

  // Fades out every loop at once (OUTER SPACE's respawn, outerspace.js).
  stopAllLoops(fadeOut = LOOP_FADE) {
    for (const name of Object.keys(loops)) this.stopLoop(name, fadeOut);
  },

  // Synthesized triangle-wave blip — no sample. Used for the jellyfish edge
  // beep and pop; freq in Hz, dur in seconds.
  beep(freq = 660, dur = 0.06, volume = 0.25) {
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    // DELTA: the envelope runs backwards too -- swells in, then cuts off.
    g.gain.setValueAtTime(reverseAll ? 0.0008 : volume, t);
    g.gain.exponentialRampToValueAtTime(reverseAll ? volume : 0.0008, t + dur);
    o.connect(g).connect(masterGain);
    o.start(t);
    o.stop(t + dur);
  },

  unlock() { if (ctx.state === 'suspended') ctx.resume(); },
  state() { return ctx.state; },   // 'running' once the browser allows sound

  // OPTIONS menu's VOLUME row. 0..1, applied instantly (no ramp -- a level
  // change from dragging a slider/tapping arrows should be heard right
  // away, unlike loop()/stopLoop()'s own fade which exists to avoid a
  // click at start/stop, not to smooth a deliberate volume change).
  setMasterVolume(v) { masterGain.gain.value = Math.max(0, Math.min(1, v)); },
  getMasterVolume() { return masterGain.gain.value; },
};
