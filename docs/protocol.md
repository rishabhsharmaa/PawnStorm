# Realtime protocol

Socket.IO protocol between the web app and the game server. The canonical
definitions live in `packages/shared/src/protocol.ts` as zod schemas (every
inbound payload is validated; malformed input gets an `error` event, never an
exception). TypeScript event maps: `ClientToServerEvents`,
`ServerToClientEvents`.

Connect to `NEXT_PUBLIC_GAME_SERVER_URL` with:

```js
io(url, { auth: { token } }) // short-lived JWT from GET /api/socket-token
```

Missing/invalid tokens reject the handshake (`connect_error`). All events are
rate-limited per socket (burst 30, 10/sec); exceeding it emits
`error {code: "RATE_LIMITED"}`.

Conventions: `gameId` is a UUID, squares are `"e2"`-style, colors are
`"w" | "b"`, clocks are integer milliseconds, `serverTime` is `Date.now()`.

## Client → server

### `queue:join` — enter matchmaking

```json
{ "timeControl": "5+3" }
```

`timeControl` is one of `1+0 | 3+2 | 5+3 | 10+0 | 15+10`. If the player is
already in a live game, the server answers
`error {code: "ALREADY_IN_GAME", gameId}` so the client can route back.

### `queue:leave` — leave matchmaking

```json
{}
```

### `move` — play a move (server validates everything)

```json
{ "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "from": "e2", "to": "e4" }
```

With promotion: `{ "gameId": "…", "from": "e7", "to": "e8", "promotion": "q" }`.
The client never sends color, turn, or clocks. Illegal/wrong-turn moves get
`move:rejected`; legal moves broadcast `move:ok` to the whole game room.

### `resign` — resign the game

```json
{ "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6" }
```

### `draw:offer` / `draw:accept` / `draw:decline`

```json
{ "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6" }
```

Offers notify only the opponent. Accepting ends the game as `DRAW` /
`AGREEMENT`. Any move clears a pending offer.

### `rejoin` — re-enter a game (fresh page load or reconnect)

```json
{ "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6" }
```

Answers with a full `game:start` snapshot (`rejoined: true`), or with
`game:over` if the game finished within the last 24h.

## Server → client

### `game:start` — match found / rejoin snapshot

```json
{
  "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "color": "w",
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "clocks": { "whiteMs": 300000, "blackMs": 300000 },
  "opponent": { "id": "user-2", "username": "bob", "rating": 1250 },
  "timeControl": "5+3",
  "turn": "w",
  "moves": [],
  "lastMove": null,
  "drawOfferBy": null,
  "status": "playing",
  "serverTime": 1728500000000,
  "rejoined": false
}
```

The client rebuilds all state from this single message.

### `move:ok` — authoritative move broadcast

```json
{
  "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "san": "e4",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "clocks": { "whiteMs": 298000, "blackMs": 300000 },
  "ply": 1,
  "turn": "b",
  "lastMove": { "from": "e2", "to": "e4" },
  "serverTime": 1728500001000
}
```

Clocks resync the client's local countdown on every move.

### `move:rejected` — illegal / wrong-turn / finished-game move

```json
{
  "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "reason": "not your turn",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"
}
```

`reason` is `"illegal move"`, `"not your turn"`, or `"game is already
finished"`. `fen` is the authoritative position to resync to.

### `draw:offered` / `draw:declined`

```json
{ "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "by": "alice" }
```

```json
{ "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6" }
```

### `game:over` — final result (also the rejoin answer for finished games)

```json
{
  "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "result": "WHITE_WIN",
  "termination": "CHECKMATE",
  "pgn": "[Event \"Pawnstorm rated game\"]\n…\n\n1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0",
  "white": { "id": "user-1", "username": "alice", "ratingBefore": 1200, "ratingAfter": 1216, "delta": 16 },
  "black": { "id": "user-2", "username": "bob", "ratingBefore": 1200, "ratingAfter": 1184, "delta": -16 }
}
```

`result`: `WHITE_WIN | BLACK_WIN | DRAW`. `termination`: `CHECKMATE |
RESIGN | TIMEOUT | STALEMATE | AGREEMENT | INSUFFICIENT_MATERIAL | THREEFOLD
| FIFTY_MOVE | ABANDONED`. Each client reads its own delta from its color block.

### `opponent:disconnected` / `opponent:reconnected`

```json
{ "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6", "graceMs": 45000 }
```

```json
{ "gameId": "3fa85f64-5717-4562-b3fc-2c963f66afa6" }
```

### `error` — human-readable failure

```json
{ "code": "ALREADY_IN_GAME", "message": "finish your current game first", "gameId": "…" }
```

`gameId` is present only when it helps route the user (e.g.
`ALREADY_IN_GAME`). Codes: `INVALID_PAYLOAD`, `RATE_LIMITED`,
`GAME_NOT_FOUND`, `NOT_IN_GAME`, `ALREADY_IN_GAME`, `MOVE_REJECTED`,
`SERVER_DRAINING`, `INTERNAL`.
