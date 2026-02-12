import { Player, SmallBoardState, SmallBoardStatus, CellValue, GameState } from '../types';

export const WINNING_COMBINATIONS = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // Rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // Columns
  [0, 4, 8],
  [2, 4, 6], // Diagonals
];

export const checkSmallBoardStatus = (cells: SmallBoardState): SmallBoardStatus => {
  // Check winner
  for (const combo of WINNING_COMBINATIONS) {
    const [a, b, c] = combo;
    if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
      return { winner: cells[a] as Player, isDraw: false };
    }
  }

  // Check draw (full board, no winner)
  const isFull = cells.every((cell) => cell !== null);
  if (isFull) {
    return { winner: null, isDraw: true };
  }

  return { winner: null, isDraw: false };
};

export const checkGlobalWinner = (statuses: SmallBoardStatus[]): { winner: Player | null; isDraw: boolean } => {
  // Check winner
  for (const combo of WINNING_COMBINATIONS) {
    const [a, b, c] = combo;
    const statA = statuses[a];
    const statB = statuses[b];
    const statC = statuses[c];

    if (
      statA.winner &&
      statA.winner === statB.winner &&
      statA.winner === statC.winner
    ) {
      return { winner: statA.winner, isDraw: false };
    }
  }

  // Check global draw
  const allDecided = statuses.every((s) => s.winner !== null || s.isDraw);
  if (allDecided) {
    return { winner: null, isDraw: true };
  }

  return { winner: null, isDraw: false };
};

export const createInitialBoard = (): CellValue[][] => {
  return Array(9).fill(null).map(() => Array(9).fill(null));
};

export const createInitialStatuses = (): SmallBoardStatus[] => {
  return Array(9).fill({ winner: null, isDraw: false });
};

export const getValidMoves = (gameState: GameState): { boardIndex: number; cellIndex: number }[] => {
  const { board, nextBoardIndex, smallBoardStatuses, globalWinner } = gameState;
  
  if (globalWinner) return [];

  const moves: { boardIndex: number; cellIndex: number }[] = [];

  // If nextBoardIndex is defined, we must play there, unless it's full/won (which shouldn't happen if logic handles null correctly, but we check validity)
  // If nextBoardIndex is null, we can play in any board that isn't full/won.

  let targetBoards: number[] = [];

  if (nextBoardIndex !== null) {
      // Logic in Game.tsx handles the "sent to full board" case by setting nextBoardIndex to null. 
      // So if it is not null here, we assume it is valid.
      // DOUBLE CHECK: If the game state is somehow out of sync, we might need to verify.
      const status = smallBoardStatuses[nextBoardIndex];
      if (!status.winner && !status.isDraw) {
          targetBoards = [nextBoardIndex];
      } else {
          // This case implies the player can play anywhere
          targetBoards = [0, 1, 2, 3, 4, 5, 6, 7, 8];
      }
  } else {
      targetBoards = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  }

  for (const bIdx of targetBoards) {
      const status = smallBoardStatuses[bIdx];
      if (!status.winner && !status.isDraw) {
          // Board is playable
          board[bIdx].forEach((cell, cIdx) => {
              if (cell === null) {
                  moves.push({ boardIndex: bIdx, cellIndex: cIdx });
              }
          });
      }
  }

  return moves;
};
