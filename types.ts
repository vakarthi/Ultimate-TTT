export enum Player {
  X = 'X',
  O = 'O',
}

export type CellValue = Player | null;

export type GameMode = 'PvP' | 'PvCPU' | 'PvOnline';

export type AiDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

// A single small board (3x3)
export type SmallBoardState = CellValue[];

// The entire game state (9 small boards)
export type GameBoardState = SmallBoardState[];

// Status of a small board
export type SmallBoardStatus = {
  winner: Player | null;
  isDraw: boolean;
};

export interface GameState {
  board: GameBoardState;
  smallBoardStatuses: SmallBoardStatus[];
  currentPlayer: Player;
  nextBoardIndex: number | null; // null means can play anywhere
  globalWinner: Player | null;
  isGlobalDraw: boolean;
  history: GameHistoryItem[];
  moveCount: number;
  gameMode: GameMode;
  aiDifficulty: AiDifficulty;
}

export interface GameHistoryItem {
  board: GameBoardState;
  smallBoardStatuses: SmallBoardStatus[];
  currentPlayer: Player;
  nextBoardIndex: number | null;
  lastMove: { boardIndex: number; cellIndex: number } | null;
}

export type OnlineRole = 'HOST' | 'GUEST' | null;

export type OnlineState = 'IDLE' | 'HOSTING' | 'JOINING' | 'CONNECTED' | 'DISCONNECTED';
