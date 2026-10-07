# Live game protocol

The production page and WebSocket `/ws` share one origin and one Node process.
Each tab keeps one socket and a private seat credential. JSON handles create,
join, resume, ping, errors and corrections. Names never authenticate a seat.

Movement reports use a 16-byte little-endian frame: tag, 32-bit sequence,
32-bit synchronized timestamp (modulo 2^32), signed centimetre x/z, byte facing,
held/lunge flags and a reserved byte. The server uses its own arrival clock and
measured ping/pong latency for validation and rewind; client timestamps grant
no authority. JSON movement remains accepted by the same validator for tests
and compatibility. Replay, speed, swept collision and boundary checks apply to
both formats. A one-second speed-credit bucket absorbs delayed report bursts;
credit cannot permit sustained excess speed.

Device movement advances on the independent 20 Hz input timer, so a slow GPU
cannot reduce running speed. A single resumed input tick caps elapsed movement
at 150 ms and still sweeps the full path. Positions arriving during a server-owned
freeze, conversion root or committed lunge are ignored without repeated corrections;
state frames carry that pose. Unlocked invalid movement still receives a correction.

At 20 Hz the server sends a binary frame with simulation and wall clocks, elapsed
time, goose speed boost, solo intensity, current pickups and lamp state. Every
entity has an 8-byte core (slot, centimetre position, facing, flags, battery)
and 19 bytes for aim, score, velocity, freeze/immunity/conversion deadlines and
lunge timing/direction. These extensions preserve current gameplay state after
resume rather than making the renderer infer it. Names, slot identities, round
deadlines, totals and run metadata are JSON, sent on change. Timestamped events
are separate reliable JSON messages, sent once per socket; histories cap at 48.
Human lunge wind-up broadcasts immediately. Other rule events broadcast when
the server resolves the tick. Full JSON state accompanies authenticated resume.

Remote characters interpolate 100 ms behind received state without extrapolation.
The local character moves immediately. Clock sync takes the lowest round trip of
the last 8 samples, smooths corrections over 500 ms, and never displays time going
backward. Round deadlines are absolute server times.

Passive catches use two consecutive latest-position overlapping ticks. Lunges
sweep the dash segment against kid history rewound at most 150 ms. Beams use goose
history at most 200 ms old. A completed or imminent freeze wins the 50 ms tie window.
Histories cap at 11 samples / 500 ms per entity. A stale device gets bot cover after 1.5 s; disconnected kids have 1.5 s grace and disconnected geese get immediate cover.

Backpressure skips complete updates before the socket queue reaches 32 KB.
Metadata/events remain unsent in the encoder until an update can be enqueued.
Nothing replays old input after resume. Per-socket encoders reset on reconnect;
run changes reset event ids and remote interpolation. There are no production
latency controls or debugging endpoints. Test TCP relays add real 100/200 ms delays
in each direction, including native WebSocket heartbeat packets.

