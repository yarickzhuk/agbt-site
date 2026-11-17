// manual.js — READ THE MANUAL, built into the game. Per direct request
// ("Make manual be built in game"): it used to open assets/docs/Manual.pdf in
// a new tab, which a popup blocker can stop and which leaves the game. Now
// it's a few pages of text on the game's own screen: ← / → turn the page,
// [X] goes back to the title. Coloured words use the palette roles the game
// itself uses for them.
import { SCREEN_W, SCREEN_H } from './core.js';
import { input } from './input.js';
import { paletteColor } from './retro.js';

// Pictures a manual page shows instead of text (preloaded at boot, main.js).
export const MANUAL_PNGS = ['assets/sprites/manual/quecton_table.png'];

const FONT = 'Tektur, monospace';

// Each page: a title and lines; a line is a string or [[text, role], ...]
// segments (role = a palette role name, or null for white).
function pages(mobile) {
  const fire = mobile ? 'FIRE' : 'Z / SPACE';
  return [
    { title: 'CONTROLS', lines: mobile ? [
      'DRAG THE STICK  -  MOVE',
      'TAP FIRE  -  SHOOT',
      'HOLD FIRE, LET GO  -  CHARGED SHOT',
      'V  -  SWITCH WEAPON (ONCE YOU HAVE MORE)',
      'X  -  PAUSE / BACK',
      'SAVE / LOAD  -  SAVE THE GAME / LOAD IT',
      '↻  -  TURN THE SCREEN',
    ] : [
      'ARROWS / WASD  -  MOVE',
      'Z / SPACE  -  SHOOT',
      'HOLD Z / SPACE, LET GO  -  CHARGED SHOT',
      'C (HOLD)  -  KEEP FACING ONE WAY',
      'V  -  SWITCH WEAPON (ONCE YOU HAVE MORE)',
      'X  -  PAUSE / BACK',
      'SHIFT  -  SAVE THE GAME',
      'ENTER  -  LOAD YOUR SAVE',
    ] },
    { title: 'COLOURS', lines: [
      'THE COLOUR OF A THING TELLS YOU THE RULES:',
      '',
      [['CYAN', 'ring'], [' - ANY SHOT DESTROYS IT', null]],
      [['DARK BLUE', 'cobalt'], [' - ONLY A CHARGED SHOT HURTS IT', null]],
      [['PURPLE', 'grape'], [' - CAN\'T BE DESTROYED, DODGE IT', null]],
      [['PINK', 'core'], [' - CAN\'T BE DESTROYED, HITS FOR 2', null]],
      '',
      [['GREEN', 'heal'], [' ORBS HEAL YOU. ', null], ['YELLOW', 'hull'], [' IS YOU.', null]],
    ] },
    { title: 'WEAPONS', lines: [
      'EACH STAGE GIVES YOU ITS OWN WEAPON.',
      'CLEAR THE STAGE TO KEEP IT.',
      '',
      [['CHARGE CANNON', 'hull'], [' (SHAPE LIMBO)', null]],
      'TAP TO SHOOT, HOLD FOR A TORPEDO, HOLD LONGER: 10 DMG',
      [['CYBER SHOTGUN', 'hull'], [' (CYBER ZOO)', null]],
      '3 PELLETS PER SHOT, HOLD FOR A BOMB SHIELD',
      [['BOUNCY BALL', 'amber'], [' (CRAZY CARNIVAL)', null]],
      'BOUNCES OFF WHAT IT HITS',
      [['LINE SLASHER', 'blood'], [' (OCCÜLTACRESBURG)', null]],
      'SLASH UP CLOSE, HOLD AND LET GO TO DASH',
    ] },
    { title: 'CHARGE CANNON', lines: [
      'TAP: A BULLET, 1 DAMAGE.',
      'HOLD AND LET GO: A TORPEDO, 3 DAMAGE.',
      'IT PIERCES PURPLE AND KILLS DARK BLUE.',
      '',
      'KEEP HOLDING: THE SHIP GLOWS, THEN PULSES.',
      'LET GO THEN: A SUPERCHARGE, 10 DAMAGE.',
      'IT STOPS ON THE FIRST BOSS IT HITS.',
      '',
      'TIP: SAVE SUPERCHARGES FOR BOSSES,',
      'USE TORPEDOES ON ROWS OF ENEMIES.',
    ] },
    { title: 'CYBER SHOTGUN', lines: [
      'TAP: 3 FAST PELLETS, 2 DAMAGE EACH.',
      'PELLETS KILL DARK BLUE WITHOUT CHARGING,',
      'BUT BREAK ON PURPLE: SHOOT AROUND IT.',
      '0.6 SECONDS TO RELOAD AFTER EVERY VOLLEY.',
      'YOU MOVE AT HALF SPEED WITH IT.',
      '',
      'HOLD 1.5 SECONDS AND LET GO: BOMB SHIELD',
      '(NEXT PAGE).',
      '',
      'TIP: POINT-BLANK, ALL 3 PELLETS HIT.',
    ] },
    { title: 'BOMB SHIELD', lines: [
      'SIX HOLLOW SPHERES ORBIT YOUR SHIP.',
      'EACH ONE BLOCKS ONE HIT, WHATEVER HIT YOU.',
      'MOVE TO THROW IT THE WAY YOU FACE.',
      mobile ? 'THROWN, IT NO LONGER PROTECTS YOU.'
             : 'HOLD C TO THROW ONE WAY AND MOVE ANOTHER.',
      'EVERY SPHERE THAT TOUCHES CYAN OR DARK BLUE',
      'DEALS 2 DAMAGE: UP TO 12 IN ALL.',
      'PURPLE, PINK AND WALLS DON\'T STOP IT.',
      'ONE SHIELD AT A TIME.',
      '',
      'TIP: RAISE IT, WALK UP TO A TOUGH ENEMY,',
      'THEN THROW IT POINT-BLANK.',
    ] },
    { title: 'BOUNCY BALL', lines: [
      'TAP: A BALL THAT BOUNCES OFF WHAT IT HITS,',
      'KILLING WHAT IT CAN. IT ENDS AT THE SCREEN EDGE.',
      'HOLD AND LET GO: AN ORANGE BALL THAT KILLS',
      'DARK BLUE AND BOUNCES OFF THE EDGES TOO.',
      'PURPLE AND WALLS: IT JUST RICOCHETS.',
      '',
      'NO MORE BALLS ON SCREEN THAN YOUR MAX HP.',
      'A BALL HITS THE SAME TARGET ONCE PER 0.6 SECONDS.',
      '',
      'TIP: FIRE INTO A CROWD OR A CORRIDOR',
      'AND LET THE BOUNCES DO THE WORK.',
    ] },
    { title: 'LINE SLASHER', lines: [
      'TAP: SLASH. REACHES 1.5 IN A 120° ARC IN FRONT.',
      '1 DAMAGE, BUT IT COUNTS AS CHARGED:',
      'IT KILLS DARK BLUE. IT CAN\'T CUT PURPLE',
      'OR REACH THROUGH SOLID WALLS.',
      '',
      'HOLD AND LET GO: DASH. NOTHING CAN HURT YOU',
      'WHILE DASHING, AND IT HITS WHAT YOU PASS THROUGH.',
      'YOU CAN SLASH IN THE MIDDLE OF A DASH.',
      '',
      'TIP: DASH THROUGH A HAZARD TO DODGE IT',
      'AND HIT WHAT\'S BEHIND IT AT ONCE.',
    ] },
    { title: 'HEALTH ORBS AND SCORE', lines: [
      [['GREEN', 'heal'], [' ORBS HEAL 1 HP. TOUCH THEM, DON\'T SHOOT.', null]],
      'THE MINUS? THEY\'RE ELECTRONS (SEE CRYSTALS).',
      'THEY APPEAR BETWEEN PHASES AND FADE AFTER',
      'ABOUT 12 SECONDS. EACH ONE IS WORTH 1 POINT.',
      'ON EASY, ONE DROPS FOR EVERY 100 DAMAGE YOU DEAL.',
      '',
      'YOU SCORE FOR WHAT YOU DESTROY.',
      'PURPLE AND PINK CAN\'T BE DESTROYED: NO POINTS.',
      'YOUR TOTAL CARRIES FROM STAGE TO STAGE.',
      'AT ONE MILLION IT READS M.',
    ] },
    { title: 'LIVES AND DIFFICULTY', lines: [
      'PICK THE DIFFICULTY ON THE TITLE SCREEN (← →).',
      '',
      'EASY  -  4 HP, 3 LIVES, LIVES REFILL ON A CLEAR,',
      '         A HEAL ORB FOR EVERY 100 DAMAGE YOU DEAL',
      'NORMAL  -  3 HP, 3 LIVES',
      'HARD  -  2 HP, 2 LIVES (UNLOCKED BY BEATING THE GAME)',
      '',
      'THE YELLOW TRIANGLES BY YOUR HP ARE SPARE LIVES.',
      'OUT OF LIVES: GIVE UP STARTS A NEW RUN.',
      'YOUR CLEARED STAGES STAY.',
      mobile ? 'ON A PHONE: EASY, OR HARD ONCE THE GAME IS BEATEN.' : '',
    ] },
    { title: 'SAVING', lines: [
      mobile ? 'TAP SAVE ANY TIME IN A STAGE.' : 'PRESS SHIFT ANY TIME IN A STAGE TO SAVE.',
      mobile ? 'TAP LOAD TO GO BACK TO YOUR SAVE.' : 'PRESS ENTER TO GO BACK TO YOUR SAVE.',
      'LOAD GAME ON THE TITLE SCREEN DOES THE SAME.',
      'THE SAVE STAYS AFTER YOU CLOSE THE GAME.',
      '',
      'WITHOUT A SAVE, A NEW TAB STARTS FROM ZERO.',
      'EVERY STAGE CLEAR AND GAME OVER SHOWS A CODE:',
      'OPTIONS → ENTER SAVECODE GIVES IT BACK',
      '(YOUR SCORE AND YOUR CLEARED STAGES).',
      'BEATING THE GAME SAVES BY ITSELF.',
    ] },
    { title: 'STAGES', lines: [
      'STAGE MENU OPENS THE FOUR STAGES.',
      'PLAY THEM IN ANY ORDER.',
      'THE FIRST TIME, A STAGE STARTS WITH A TUTORIAL.',
      '',
      'CLEAR ALL FOUR AND',
      'ENTER THE OUTER SPACE APPEARS ON THE TITLE SCREEN.',
      'IT\'S THE FINAL RUN: IF YOU DIE THERE,',
      'YOU START THAT PART AGAIN WHILE YOU HAVE LIVES.',
      '',
      'YOU SCORE FOR WHAT YOU DESTROY.',
      'SCOREBOARD (OPTIONS) KEEPS THE TOP 10 ON THIS DEVICE.',
    ] },
    { title: 'CRYSTAL EXTRACTION', lines: [
      'EVERY STAGE ENDS WITH ITS CRYSTAL.',
      'SHOOT IT 9 TIMES TO EXTRACT IT.',
      'ANY SHOT WORKS, AND IT NEVER HURTS YOU.',
      'MEANWHILE THE MOTHERSHIP CLOSES IN.',
      'ITS EDGE HITS FOR 3. IT LEAVES ONCE YOU\'RE DONE.',
      '',
      [['SHAPE LIMBO', 'heal'], [' - FROM THE TOP, NOTHING IN THE WAY', null]],
      [['CYBER ZOO', 'hull'], [' - FROM THE LEFT, 4 LASER GATES', null]],
      [['CRAZY CARNIVAL', 'amber'], [' - FROM THE RIGHT, 4 LASER GATES', null]],
      [['OCCÜLTACRESBURG', 'blood'], [' - FROM BELOW, 8 BOMBS', null]],
      '',
      'SHOOT A GATE\'S CYAN BLOCK TO TURN ITS BEAM OFF.',
    ] },
    { title: 'TRAP CIRCLE', lines: [
      [['SHAPE LIMBO', 'heal'], ['\'S BOSS.', null]],
      'A SPINNING RING CLOSES IN ON YOU.',
      [['ONLY ITS ', null], ['CYAN', 'ring'], [' SECTOR TAKES DAMAGE.', null]],
      'EVERY HIT SPRINGS THE RING BACK OPEN.',
      'IF IT CLOSES ALL THE WAY, YOU LOSE 1 HP.',
      'IT CLOSES FASTER AS ITS HP DROPS.',
      '',
      'HP: 10',
      '',
      'TIP: FOLLOW THE CYAN SECTOR AROUND.',
      'A SUPERCHARGE ENDS IT IN ONE HIT.',
    ] },
    { title: 'KANGUNROO', lines: [
      [['CYBER ZOO', 'hull'], ['\'S BOSS. NOT A SHOOTING FIGHT: A DUEL.', null]],
      'YOU\'RE FROZEN IN PLACE.',
      [['HE STARES YOU DOWN, THEN FLASHES A ', null], ['PINK', 'core'], [' RING.', null]],
      'PRESS FIRE RIGHT AFTER THE RING TO HIT HIM.',
      'TOO EARLY IS A FOUL: THE ROUND RESETS, NO DAMAGE.',
      'TOO LATE: HE HITS YOU FOR 1 HP.',
      '',
      'HITS TO WIN: 5',
      '',
      'TIP: WATCH THE RING, NOT HIS FACE.',
      'DON\'T GUESS.',
    ] },
    { title: 'CRUEL CLOWNHOUSE', lines: [
      [['CRAZY CARNIVAL', 'amber'], ['\'S BOSS: SHOWMAN.', null]],
      '1. THE MAZE: 30 SECONDS TO POP 5 CLOWN TARGETS.',
      [['POP ALL 5 AND HE\'S ', null], ['CYAN', 'ring'], ['. MISS ONE AND HE\'S', null]],
      [['ORANGE', 'amber'], [': NOTHING CAN HURT HIM.', null]],
      '2. THE SHOW: A FORCE FIELD SHRINKS FROM THE EDGES.',
      'TOUCH IT: 1 HP, AND BACK TO THE MAZE.',
      'METEORS AND A DARK-BLUE CLOWN JOIN IN.',
      'TOUCHING SHOWMAN COSTS 1 HP.',
      '',
      'HP: 15',
      'TIP: BOUNCY BALLS RACE DOWN MAZE CORRIDORS.',
      'ORANGE? LET THE FIELD CATCH YOU, TRY AGAIN.',
    ] },
    { title: 'PLASMADRACHE', lines: [
      [['OCCÜLTACRESBURG', 'blood'], ['\'S BOSS. ', null], ['DARK BLUE', 'cobalt'], [': CHARGED HITS ONLY.', null]],
      'HIS STRIPED BELLY IS ARMOUR: HIT HIS HEAD,',
      'ARMS, WINGS, LEGS OR FEET. THOSE HURT TO TOUCH,',
      'THE BELLY IS SAFE TO STAND ON.',
      'WALLS: A BLINKING OUTLINE, THEN A WALL FOR 2 SEC.',
      'CHARGED SHOTS AND THE DASH GO THROUGH PURPLE ONES.',
      'FIREBALLS: 20 IN A ROW. DODGE THEM.',
      [['HIT HIM UP CLOSE WHILE HIS MOUTH IS OPEN', 'blood']],
      [['AND HE EATS YOU.', 'blood']],
      '',
      'HP: 30',
    ] },
    { title: 'TRAP CIRCLE DELTA', lines: [
      'OUTER SPACE, STAGE 1. 9 SEGMENTS, A SLOWER RING.',
      [['CYAN', 'ring'], [' x3 - 10 HP EACH, ANY SHOT', null]],
      [['DARK BLUE', 'cobalt'], [' x3 - 30 HP EACH, CHARGED ONLY', null]],
      [['PINK', 'core'], [' x3 - CAN\'T BE DESTROYED, HITS FOR 2', null]],
      'A DESTROYED SEGMENT LEAVES A GAP.',
      'A HIT SPRINGS THE RING OPEN. IF IT CLOSES,',
      'YOU LOSE 1 HP. DESTROY ALL CYAN AND DARK BLUE.',
      '',
      'HP: 120',
      '',
      'TIP: KEEP SHOOTING SO IT NEVER CLOSES,',
      'AND KEEP AN EYE ON THE PINK.',
    ] },
    { title: 'KANGUNROO DELTA', lines: [
      'OUTER SPACE, STAGE 2: BOSS RUSH, FIGHT 1.',
      'HE LEAPS NONSTOP BETWEEN THE FLOOR, THE CEILING',
      'AND BOTH WALLS. ABOUT HALF HIS LEAPS AIM AT YOU.',
      'EVERY 4-7 LEAPS HE RESTS FOR A SECOND.',
      'TOUCHING HIM COSTS 1 HP. ANY SHOT HURTS HIM.',
      'AT 0 HP: THE DUEL, LIKE IN CYBER ZOO.',
      'ONE MISS ENDS IT: YOU LOSE 2 HP',
      'AND HE GETS ALL 50 HP BACK.',
      '',
      'HP: 50',
      '',
      'TIP: KEEP MOVING, AND SHOOT WHEN HE RESTS.',
    ] },
    { title: 'SHOWMAN DELTA', lines: [
      'OUTER SPACE, STAGE 2: BOSS RUSH, FIGHT 2.',
      'A BIG MAZE. SHOWMAN WAITS AT THE END OF ITS',
      'LONGEST PATH. YOU HAVE 20 SECONDS (TOP RIGHT).',
      'OUT OF TIME: YOU LOSE 1 HP, THE CLOCK RESTARTS.',
      'NOTHING GETS THROUGH THE WALLS: NO SHOT, NO DASH.',
      'HE\'S SMALL, NEVER MOVES, AND HURTS TO TOUCH.',
      'YOU DON\'T HAVE TO REACH HIM:',
      'SHOOT ONCE YOU HAVE A CLEAR LINE.',
      '',
      'HP: 10',
      'TIP: LEARN THE ROUTE. A SUPERCHARGE',
      'TAKES HALF HIS HP IN ONE HIT.',
    ] },
    { title: 'PLASMADRACHE DELTA', lines: [
      'OUTER SPACE, STAGE 2: BOSS RUSH, FINAL FIGHT.',
      '1. THE DRAGON (150 HP) CHASES YOU SLOWLY AND',
      'SPITS A FIREBALL EVERY 2 SECONDS. ONLY THE',
      'FIREBALLS HURT. HIT HIS TORSO OR NECK.',
      '',
      '2. THE HEAD (50 HP) IS FASTER. ONLY ITS',
      [['CYAN', 'ring'], [' CHIN TAKES DAMAGE, AND ONLY HALF:', null]],
      'BULLET 0, PELLET 1, CHARGED 2, SUPERCHARGE 5.',
      [['TOUCH THE HEAD AND IT EATS YOU.', 'blood']],
      '',
      'TIP: IN PHASE 2, KEEP YOUR DISTANCE',
      'AND AIM AT THE CHIN.',
    ] },
    { title: 'DELTA UNIT', lines: [
      'OUTER SPACE, STAGE 3. 102 SHIPS IN 8 WAVES.',
      'EACH WAVE FLIES IN AND LINES UP AT THE TOP.',
      'A SHIP STILL FLYING IN CAN\'T BE HIT.',
      [['COMMANDO', 'ring'], [' - CYAN PODS, THEN A ', null], ['DARK-BLUE', 'cobalt'], [' CORE', null]],
      [['SHOOTER', 'cobalt'], [' - STAYS IN LINE, SHOOTS DOWN', null]],
      [['DIVEBOMBER', 'ring'], [' - DIVES AT YOU IN PAIRS', null]],
      'ONE ATTACK AT A TIME. AN ATTACKER KEEPS',
      'DIVING UNTIL YOU SHOOT IT DOWN.',
      'LAST 3 SHIPS: SHOOTERS FIRE FASTER, AT YOU.',
      'A BOX KEEPS YOU BELOW THE SHIPS.',
      'A HEAL ORB DROPS AFTER EVERY WAVE BUT THE LAST.',
    ] },
    { title: 'THE MOTHERSHIP', lines: [
      'THE FINALE, PHASE 1. IT PARKS AT THE TOP.',
      [['CYAN', 'ring'], [': ANY SHOT, ANYWHERE ON THE HULL.', null]],
      'THE HULL HURTS TO TOUCH. IT HAS 3 ATTACKS:',
      '',
      'MACHINE GUN - 10 VOLLEYS OF 3-WAY PURPLE SHOTS',
      'SPLASH - 7 RINGS OF PURPLE SHARDS; A SHRINKING',
      '         RING SHOWS WHERE EACH ONE STARTS',
      'SPEARS - 24 CYAN SPEARS; SHOOT THEM DOWN',
      '',
      'HP: 200',
      '',
      'TIP: STAY LOW AND KEEP FIRING UP.',
    ] },
    { title: 'THE FOUR SHAPES', lines: [
      'THE FINALE, PHASES 2-5. EACH COOL CRYSTAL HIDES',
      'IN A SPINNING 4D SHAPE. ITS LINES HURT TO TOUCH;',
      'THE GAPS BETWEEN THEM ARE SAFE.',
      '',
      [['TESSERACT', 'ring'], [' - 200 HP, ANY SHOT. FIRES SMALL ONES.', null]],
      [['5-CELL', 'cobalt'], [' - 200 HP, CHARGED ONLY. BOUNCING RINGS.', null]],
      [['24-CELL', 'grape'], [' - SURVIVE A MINUTE. IT DRIFTS AROUND.', null]],
      [['120-CELL', 'core'], [' - SURVIVE A MINUTE. IT FOLLOWS YOU.', null]],
      '',
      'TIP: A SHOT THAT SLIPS THROUGH A GAP',
      'AND HITS THE CRYSTAL INSIDE STILL COUNTS.',
    ] },
    // The crystals' lore, in the author's own words ("crystals are
    // technically a bosses that gives game a lore"): what each is made of
    // and its part in the story.
    { title: 'CRYSTALS OF WARM COLOURS', lines: [
      [['LIFE', 'heal'], [' - SHAPE LIMBO. ELECTRONS AND GLUONS.', null]],
      'DELTA LOCKED IT IN A SAFE GUARDED BY A TRAP CIRCLE.',
      'IT KEEPS GIVING OFF ELECTRONS: THE HEAL ORBS.',
      [['SPIRIT', 'hull'], [' - CYBER ZOO. PHOTONS.', null]],
      'FLUNG THE FARTHEST WHEN THE WHITE CRYSTAL BROKE.',
      'A DRIFTING PIECE MET SOME ELECTRONS AND BECAME YOU.',
      'THAT\'S WHY YOU CAN HEAL.',
      [['CREATIVITY', 'amber'], [' - CRAZY CARNIVAL. TOP QUARKS.', null]],
      'YOU ABSORB THE QUARKS IT GIVES OFF: BOUNCY BALLS.',
      [['SPEED', 'blood'], [' - OCCÜLTACRESBURG. UP QUARKS.', null]],
      'A PIECE CRACKED OFF AS IT LANDED: THE LINE SLASHER.',
    ] },
    { title: 'CRYSTALS OF COOL COLOURS', lines: [
      'DELTA FORGED THESE FOUR INTO ONE CRYSTAL.',
      'IN THE FINALE, EACH HIDES IN A 4D SHAPE.',
      '',
      [['CONTROL', 'ring'], [' - TESSERACT. BOTTOM QUARKS.', null]],
      [['RESISTANCE', 'cobalt'], [' - 5-CELL. CHARM QUARKS.', null]],
      [['MATTER', 'grape'], [' - 24-CELL. DOWN QUARKS.', null]],
      [['POWER', 'core'], [' - 120-CELL. STRANGE QUARKS.', null]],
      '',
      'STRANGE MATTER TURNS WHATEVER IT TOUCHES',
      'INTO MORE OF ITSELF.',
      'THAT\'S WHY PINK HITS YOU TWICE AS HARD.',
    ] },
    // The author's own Quecton Table, drawn by them, shown as-is.
    { title: 'THE QUECTON TABLE', image: 'assets/sprites/manual/quecton_table.png', lines: [] },
    // The Quantum Codex: the author's own, sent as three pages (primordial,
    // player & time, the subon numbers -5 to -10 of the Quecton Table).
    { title: 'THE QUANTUM CODEX (1/3)', lines: [
      [['PRIMORDIAL', 'hull']],
      '',
      [['QUECTONS (q₀)', null], [' - THE SMALLEST PARTICLES THERE ARE.', null]],
      'NOTHING SMALLER EXISTS, SO THEY CAN NEVER DECAY.',
      'EVERYTHING IN LIGHT AND MATTER IS FORGED FROM THEM.',
      [['SUBONS (ϡ)', 'grape'], [' - PARTICLES THAT EXIST BELOW ZERO.', null]],
      'DRAIN ALL LIGHT FROM EMPTY SPACE AND WHAT REMAINS',
      'IS LESS THAN NOTHING: THE NEGATIVE VOID BEHIND',
      'DELTA AND EVERY HAZARD IN YOUR WAY.',
      [['PHOTINOS (γ̃) & POSITRONS (e⁺)', 'core'], [' - THE DARK OPPOSITES', null]],
      'OF YOUR PHOTONS (γ) AND ELECTRONS (e⁻). THEY FORM',
      'DELTA\'S BODY: WHY HE MIRRORS YOUR EVERY WEAPON.',
    ] },
    { title: 'THE QUANTUM CODEX (2/3)', lines: [
      [['PLAYER & TIME', 'hull']],
      '',
      [['TACHYONS (τ)', 'blood'], [' - FASTER-THAN-LIGHT PARTICLES.', null]],
      'THEY POWER YOUR MOVEMENT AND LET YOUR DASH',
      'SLIP THROUGH HAZARDS UNTOUCHED.',
      [['STERILE NEUTRINOS (νₛ)', 'ring'], [' - GHOST PARTICLES', null]],
      'THAT IGNORE ALL BARRIERS, LETTING YOUR BOMB SHIELD',
      'AND ATTACKS PHASE STRAIGHT THROUGH SOLID WALLS.',
      [['CHRONONS (χ)', 'heal'], [' - INDIVISIBLE QUANTA OF TIME.', null]],
      'THIS STORY HAPPENS BEFORE',
      'THE FIRST CHRONON WAS BORN.',
    ] },
    { title: 'THE QUANTUM CODEX (3/3)', lines: [
      [['SUBON NUMBERS', 'hull']],
      '',
      [['CHAMELEON PARTICLES (ϡ₁)', 'amber'], [' - SHIFT BY ENVIRONMENT.', null]],
      'THEY GOVERN THE COLOUR RULES AND',
      'SHOWMAN\'S INVINCIBLE ORANGE STATE.',
      [['MAGNETIC MONOPOLES (ϡ₂)', 'ring'], [' - SINGLE-POLE PARTICLES', null]],
      'THAT LOCK ONTO YOU TO GUIDE HOMING ATTACKS.',
      [['SYMMETRONS (ϡ₃)', 'cobalt'], [' - SHRINKING TRAPS AND FORCE FIELDS.', null]],
      [['GRAVIPHOTONS (ϡ₄)', 'heal'], [' - VIOLENT RICOCHETS.', null]],
      [['DILATONS (ϡ₅)', 'grape'], [' - WARP SPACE INTO 4D BOSS SHAPES.', null]],
      [['MIRROR MATTER (ϡ₆)', null], [' - FLIPS YOUR SCREEN, SOUND', null]],
      'AND COLOURS BACKWARDS.',
    ] },
    // Delta himself, from the author's lore, plus his cameo as a playable
    // character: the DELTA costume (costumes.js).
    { title: 'DELTA', lines: [
      'HE LOOKS LIKE THE GREEK LETTER, AND HE GOT',
      'BORED OF LIVING IN MONOCHROME. SO HE STRUCK',
      'THE WHITE UNIVERSAL CRYSTAL, TOOK THE CRYSTAL',
      'OF POWER AND FORGED THE COOL FOUR INTO ONE.',
      '',
      [['THE FINAL BOSS', 'blood'], [' - 100 HP. HE FIGHTS WITH YOUR OWN', null]],
      'WEAPONS, TAKES HALF FROM CHARGED HITS,',
      'AND ANSWERS EVERY HIT WITH A DASH AND A SLASH.',
      '',
      [['PLAY AS HIM', 'hull'], [' - BEAT THE GAME TO WEAR HIS COSTUME:', null]],
      'NO COLOURS, EVERY SOUND BACKWARDS, THE SCREEN',
      'MIRRORED. NO PASSIVE. HE DOESN\'T NEED ONE.',
    ] },
    { title: 'COSTUMES', lines: [
      'OPTIONS → COSTUMES. CLEAR A STAGE TO EARN ITS SHIP.',
      'EACH HAS A PASSIVE: AN UPSIDE AND A DOWNSIDE.',
      '',
      [['CLASSIC', 'hull'], [' - THE STOCK SHIP. NO PASSIVE.', null]],
      'TIP: NO TRADE-OFFS. THE SAFE PICK.',
      '',
      [['FIREWORK', 'amber'], [' - CRAZY CARNIVAL', null]],
      'MOVES 20% FASTER, AND A FULL CHARGE ALSO BURSTS',
      '6 PELLETS AROUND YOU. PURPLE HITS YOU FOR +1.',
      'TIP: DIVE IN, LET A CHARGE GO POINT-BLANK, GET OUT.',
      'STAY AWAY FROM PURPLE-HEAVY FIGHTS.',
    ] },
    { title: 'COSTUMES', lines: [
      [['DRAGON', 'blood'], [' - OCCÜLTACRESBURG', null]],
      'HOLD FIRE TO RAPID FIRE WHILE THE CHARGE BUILDS,',
      'AND IT CHARGES 1.4X FASTER. 1 LESS MAX HP.',
      'TIP: JUST HOLD FIRE: TAPS AND A CHARGED SHOT',
      'COME FROM ONE PRESS. PLAY SAFE, YOU HAVE LESS HP.',
      '',
      [['THE OG', 'heal'], [' - SHAPE LIMBO', null]],
      'WHILE CHARGING, NEARBY HEAL ORBS GLIDE TO YOU.',
      'ALWAYS MOVES 25% SLOWER.',
      'TIP: CHARGE NEAR AN ORB INSTEAD OF CHASING IT.',
      'GOOD FOR FIGHTS WHERE YOU CHARGE A LOT.',
    ] },
    { title: 'COSTUMES', lines: [
      [['DEVIL FISH', 'hull'], [' - CYBER ZOO', null]],
      '3 SHOTS IN A ROW THAT HIT EARN A FREE CHARGE:',
      'YOUR NEXT LET-GO FIRES FULLY CHARGED.',
      'A MISS RESETS THE COUNT. ONE LIFE LESS.',
      'TIP: TAP BIG, SLOW TARGETS TO BANK A CHARGE,',
      'THEN SPEND IT ON DARK BLUE. NO WILD SHOTS.',
      '',
      [['DELTA', null], [' - BEAT THE GAME', null]],
      'NO PASSIVE. NO COLOURS, BACKWARDS SOUND,',
      'A MIRRORED SCREEN: A CHALLENGE, NOT A BOOST.',
      'TIP: LEARN EACH HAZARD BY ITS SHAPE.',
    ] },
    { title: 'SPEEDRUN MODE', lines: [
      'OPENS ON THE TITLE SCREEN ONCE YOU BEAT THE GAME.',
      '',
      'EVERY STAGE IN A ROW, THEN OUTER SPACE,',
      'AGAINST THE CLOCK. NO TITLE CARDS, NO PAUSE.',
      'EASY, BUT ONE LIFE FOR THE WHOLE RUN.',
      'YOU HEAL TO FULL BETWEEN PHASES.',
      'ALL FOUR WEAPONS, SWITCH WITH V.',
      '',
      'YOU START WITH 35:00. IF TIME RUNS OUT, YOU DIE.',
      'BEAT THE RECORD AND THE LIMIT BECOMES',
      'YOUR TIME + 1 SECOND.',
    ] },
    { title: 'ENDLESS MODE', lines: [
      'OPENS ON THE TITLE SCREEN ONCE YOU BEAT THE GAME.',
      '',
      'ROUND AFTER ROUND UNTIL YOU FALL.',
      'EACH ROUND: 4 PHASES OF RANDOM ATTACKS, THEN A BOSS.',
      'IT GETS A LITTLE HARDER EVERY ROUND.',
      'A HEAL ORB BEFORE EVERY PHASE AND BOSS.',
      '3 HP AND ONE LIFE, WHATEVER THE DIFFICULTY.',
      'A HEAL ORB FOR EVERY 100 DAMAGE YOU DEAL.',
      'ALL WEAPONS, SWITCH WITH V.',
      '',
      'YOUR BEST ROUND AND SCORE ARE KEPT ON THIS DEVICE.',
    ] },
    { title: 'OPTIONS', lines: [
      'VOLUME, SCREEN SIZE AND DISPLAY MODE.',
      'COSTUMES  -  NEW SHIPS, ONE FOR EACH STAGE YOU CLEAR.',
      'DEATH HITBOX  -  SHOWS WHAT HIT YOU WHEN YOU DIE.',
      'WATCH CUTSCENES  -  THE INTRO, AND THE ENDING',
      '                   ONCE YOU BEAT THE GAME.',
      '',
      [['TOXIC MODE', 'blood'], [' (OFF BY DEFAULT, 12+)', null]],
      'A VOICE MAKES FUN OF YOU EVERY TIME YOU DIE,',
      'WITH RUDE WORDS. NOT FOR YOUNG PLAYERS.',
    ] },
  ];
}

export function showManual(world) {
  return new Promise(resolve => {
    const PAGES = pages(world.isMobile);
    const layer = new PIXI.Container();
    layer.zIndex = 200;
    world.stage.addChild(layer);
    const head = new PIXI.Text('MANUAL', { fontFamily: FONT, fontSize: 18, fill: 0xffffff, letterSpacing: 6 });
    head.anchor.set(0.5); head.position.set(SCREEN_W / 2, 50); head.alpha = 0.6;
    const hint = new PIXI.Text(world.isMobile ? '◄ ►  TURN THE PAGE      X  BACK' : '← →  TURN THE PAGE      X  BACK',
      { fontFamily: FONT, fontSize: 15, fill: 0xffffff, letterSpacing: 3 });
    hint.anchor.set(0.5); hint.position.set(SCREEN_W / 2, SCREEN_H - 50); hint.alpha = 0.7;
    layer.addChild(head, hint);

    let page = 0, body = null;
    const draw = () => {
      if (body) { layer.removeChild(body); body.destroy({ children: true }); }
      body = new PIXI.Container();
      const pg = PAGES[page];
      const title = new PIXI.Text(pg.title, { fontFamily: FONT, fontSize: 36, fill: paletteColor('ring'), letterSpacing: 5 });
      title.anchor.set(0.5); title.position.set(SCREEN_W / 2, 110);
      if (title.width > SCREEN_W - 60) title.scale.set((SCREEN_W - 60) / title.width);
      body.addChild(title);
      if (pg.image) {   // a picture page: fit it between the title and the page number
        const pic = PIXI.Sprite.from(pg.image);
        const k = Math.min(440 / pic.texture.height, (SCREEN_W - 60) / pic.texture.width);
        pic.anchor.set(0.5); pic.scale.set(k); pic.position.set(SCREEN_W / 2, 370);
        body.addChild(pic);
      }
      const lines = pg.lines.filter((l, i, a) => l !== '' || i < a.length - 1);
      const gap = lines.length > 11 ? 33 : lines.length > 10 ? 36 : 40;
      const top = 190;
      lines.forEach((line, i) => {
        const segs = typeof line === 'string' ? [[line, null]] : line;
        const parts = segs.map(([t, role]) => {
          const tx = new PIXI.Text(t, { fontFamily: FONT, fontSize: 19, fill: role ? paletteColor(role) : 0xffffff, letterSpacing: 2 });
          tx.anchor.set(0, 0.5); body.addChild(tx); return tx;
        });
        const total = parts.reduce((w, t) => w + t.width, 0);
        const fitK = Math.min(1, (SCREEN_W - 40) / total);   // a long line shrinks to fit
        if (fitK < 1) parts.forEach(t => t.scale.set(fitK));
        let x = SCREEN_W / 2 - total * fitK / 2;
        for (const t of parts) { t.position.set(x, top + i * gap); x += t.width; }
      });
      const num = new PIXI.Text((page + 1) + ' / ' + PAGES.length, { fontFamily: FONT, fontSize: 16, fill: 0xffffff, letterSpacing: 3 });
      num.anchor.set(0.5); num.position.set(SCREEN_W / 2, SCREEN_H - 85); num.alpha = 0.6;
      body.addChild(num);
      layer.addChild(body);
    };
    draw();

    const turn = d => { page = (page + d + PAGES.length) % PAGES.length; world.audio.play('levelSelectPress', 0.5); draw(); };
    const step = () => {
      if (input.wasPressed('left')) turn(-1);
      if (input.wasPressed('right') || input.wasPressed('fire')) turn(1);
      if (input.backPressed()) {
        world.app.ticker.remove(step);
        world.stage.removeChild(layer); layer.destroy({ children: true });
        input.endFrame();
        resolve();
        return;
      }
      input.endFrame();
    };
    world.app.ticker.add(step);
  });
}
