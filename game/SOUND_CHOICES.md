# Sound choices to audition

These are the selected files from assets/source/audio/prepared, copied with source
filenames into public/assets/chase/audio. No downloads or recorded goose files.
Selections are by the supplied cue sheet/name; automated signal checks are not a
listening review. Replace a mapping in client/chase-sound.ts to swap a choice.

| Use | File / synthesis |
|---|---|
| Title/results music | music/music_lobby.mp3 |
| Chase music | music/music_chase.mp3 |
| Finale/late solo | music/music_finale.mp3 |
| Quiet night | music/amb_crickets.mp3 (fades near geese) |
| UI | click_001/002/003.mp3; confirmation_001.mp3; error_001.mp3; pluck_001.mp3 |
| Countdown / Go | tick_001.mp3 / bong_001.mp3 |
| Flashlight | switch_001.mp3 on / switch_002.mp3 off |
| Own steps | footstep_grass_000/001.mp3; footstep_concrete_000/001.mp3 |
| Freeze / thaw | zap1.mp3 / drop_001.mp3 |
| Catch impact | impactSoft_heavy_000.mp3 + synthesized poof/honk |
| Pickup | powerUp1.mp3 |
| Battery empty / blackout | phaserDown1.mp3 |
| New best | jingles_PIZZI01.mp3 |
| Kids survive / caught | jingles_NES00.mp3 / jingles_NES01.mp3 |
| Connection loss | glitch_001.mp3 + persistent reconnect text |
| Goose honk | two detuned saw oscillators, 260 to190Hz, nasal710Hz bandpass, .38s; four base pitches |
| Hiss/flap/poof | filtered white-noise envelope, .15–.35s |
| Heartbeat | paired72/58Hz triangles, distance-dependent cadence |
| Low battery |620/440Hz double beep, no more than once per2s |
| Dawn substitute |520/780Hz rising chime + comic honk; no recorded rooster available |

Music source: supplied prepared Juhani Junkala chiptune files (CC0 INFO included).
SFX/jingles: supplied Kenney packs (four original CC0 licences included). Crickets:
supplied prepared CC0 Wolfgang_ / Ted Kerr loop described in research02. Audio
uses MP3 for the supplied-file format. Music overlaps an80–100ms fade at seams;
crickets loop inside decoder padding. Seam quality remains for listening review.

Controls stay MOVE + LIGHT/LUNGE. M toggles sound on a keyboard and saves the
preference. Phone players retain their device volume controls. Audio suspends
while hidden, resumes on return/next gesture, and requests playback audio-session
mode only where supported. No essential event depends on audio or vibration.

The first button tap has a short synthesized click while files decode. Later UI
clicks choose among three files without immediate repetition. Join uses a pluck
pitched by seat count; departure uses a lower drop as the closest supplied cue.
Lamp activation uses confirmation; expiry uses a short power-down. A last-kid
accent uses pickup plus a rising tone. The final ten multiplayer seconds use
rising ticks from the authoritative deadline. Results stop the chase loop before
the win/lose stinger and delay the lobby return by two seconds; score ticks follow.
Thaw now has an explicit once-only server event, a drop and a short hiss. The
beam hum and contact fizz are synthesized locally from visible beam geometry.
The visual beam read is feedback only; the server still decides every freeze.

These are implemented mappings, not an audition recommendation. Listen especially
to the synthesized honk, the chase-to-finale transition, the two-second result
stinger gap, and music seams. Physical iPhone audio remains unverified.

Hidden-tab handling stops music voices and pending scheduled SFX before suspending,
then schedules the current music on return. Browser verification records one
music layer after return, avoiding doubled loops. Countdown reschedules only its
remaining authoritative seconds. This does not verify perceived loop seams.
