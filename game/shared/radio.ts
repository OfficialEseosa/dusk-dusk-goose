import type { RoomSnapshot } from './protocol.js';
export const RADIO_HISTORY_LIMIT = 24;
export const RADIO_TEXT_LIMIT = 80;
export const RADIO_WINDOW_MS = 5000;
export const RADIO_MESSAGES_PER_WINDOW = 3;
export interface RadioPhrase { id: string; text: string }
/** Phrase availability uses only the caller's public role and phase. */
export function getRadioPhrases(room: RoomSnapshot, playerId: string): RadioPhrase[] {
  const player = room.players.find(item => item.id === playerId);
  if (!room.round || !player) return [];
  if (room.match?.phase === 'finished') return [
    { id: 'again', text: 'One more night?' }, { id: 'good-game', text: 'Good game, everyone.' },
    { id: 'summer', text: 'See you next summer.' }, { id: 'rematch', text: 'Ready for a rematch.' },
  ];
  if (room.round.phase === 'reveal') return [
    { id: 'close', text: 'That was close.' }, { id: 'next', text: 'Ready for the next round.' },
    { id: 'good-hide', text: 'Good hiding.' }, { id: 'good-search', text: 'Nice searching.' },
  ];
  if (player.role === 'waiting') return [
    { id: 'waiting-ready', text: 'Ready when you are.' }, { id: 'waiting-next', text: "I'll join next round." },
    { id: 'waiting-luck', text: 'Good luck out there.' }, { id: 'waiting-inside', text: "I'm inside." },
  ];
  if (player.role === 'hider') return room.round.phase === 'hiding' ? [
    { id: 'hiding', text: 'Give me a moment.' }, { id: 'no-peeking', text: 'No peeking.' },
    { id: 'hide-ready', text: 'Almost ready.' }, { id: 'hide-dark', text: 'Getting dark out here.' },
  ] : [
    { id: 'catch', text: 'Catch me if you can.' }, { id: 'shadows', text: 'Follow the shadows.' },
    { id: 'quiet', text: 'The street is quiet.' }, { id: 'still-looking', text: 'Still looking?' },
  ];
  if (room.round.phase === 'hiding') return [
    { id: 'prep-ready', text: 'Ready when you are.' }, { id: 'prep-light', text: 'Grab a flashlight.' },
    { id: 'prep-together', text: 'Stay together out there.' }, { id: 'prep-dark', text: 'It is dark outside.' },
  ];
  return [
    { id: 'footprints', text: 'Footprints here.' }, { id: 'bins', text: 'Check the bins.' },
    { id: 'here', text: 'Over here.' }, { id: 'split', text: 'Split up.' },
  ];
}
