import { GameState, Player, SmallBoardState, SmallBoardStatus } from '../types';
import { getValidMoves, checkSmallBoardStatus, checkGlobalWinner, WINNING_COMBINATIONS } from './gameLogic';

type Move = { boardIndex: number; cellIndex: number };

// Helper: Check if a player can win a specific small board in one move
const canWinBoard = (board: SmallBoardState, player: Player): number | null => {
  // Check all empty cells
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) {
      const tempBoard = [...board];
      tempBoard[i] = player;
      const result = checkSmallBoardStatus(tempBoard);
      if (result.winner === player) return i;
    }
  }
  return null;
};

// Helper: Score a move for Advanced AI
const evaluateMove = (gameState: GameState, move: Move): number => {
  const { board, smallBoardStatuses, currentPlayer } = gameState;
  const opponent = currentPlayer === Player.X ? Player.O : Player.X;
  
  let score = 0;

  // 1. Simulate Move locally
  const targetBoardIndex = move.boardIndex;
  const currentSmallBoard = [...board[targetBoardIndex]];
  currentSmallBoard[move.cellIndex] = currentPlayer;
  
  const boardStatusResult = checkSmallBoardStatus(currentSmallBoard);
  const isBoardWon = boardStatusResult.winner === currentPlayer;
  
  // Factor: Win Small Board
  if (isBoardWon) {
    score += 100;
    
    // Factor: Win Global Game
    // We need to simulate the global status array
    const nextStatuses = [...smallBoardStatuses];
    nextStatuses[targetBoardIndex] = boardStatusResult;
    const globalResult = checkGlobalWinner(nextStatuses);
    if (globalResult.winner === currentPlayer) {
      score += 10000;
    }

    // Factor: Strategic Board Capture (Center > Corner > Edge)
    if (targetBoardIndex === 4) score += 20; // Center board
    else if ([0, 2, 6, 8].includes(targetBoardIndex)) score += 10; // Corners
  }

  // Factor: Block Opponent from Winning Small Board
  // (Did we take a spot that they could have won with?)
  const opponentWinMove = canWinBoard(board[targetBoardIndex], opponent);
  if (opponentWinMove === move.cellIndex) {
      score += 80; // Blocking is very important
  }

  // Factor: Destination Board Analysis (Where are we sending them?)
  let nextBoardIdx: number | null = move.cellIndex;
  // If sent to full/won board, they get free move.
  const nextBoardStatus = smallBoardStatuses[nextBoardIdx]; // Note: using current status is approx correct unless we just won it?
  // Actually, if we just won the board at `move.boardIndex`, it doesn't affect the STATUS of `move.cellIndex` board directly, 
  // UNLESS `move.boardIndex` IS `move.cellIndex` (playing in self?). No, `move.cellIndex` is the destination index.
  
  // We need the status of the destination board.
  // Caveat: If the destination board is ALREADY won or full, opponent plays anywhere.
  
  const isDestFullOrWon = nextBoardStatus.winner !== null || nextBoardStatus.isDraw;
  
  if (isDestFullOrWon) {
      score -= 50; // Penalty for giving free move
  } else {
      // We are sending them to `nextBoardIdx`.
      // Check if they can win immediately in that board.
      const destBoard = board[nextBoardIdx];
      const oppWinInDest = canWinBoard(destBoard, opponent);
      if (oppWinInDest !== null) {
          score -= 100; // DANGER: Sending them to a win
      }
      
      // Check if they can block US in that board? Less critical.
  }

  // Factor: Center/Corner preference within the small board
  if (move.cellIndex === 4) score += 5;
  else if ([0, 2, 6, 8].includes(move.cellIndex)) score += 3;

  return score;
};


export const getAiMove = (gameState: GameState): Move | null => {
  const { aiDifficulty, board, currentPlayer } = gameState;
  const validMoves = getValidMoves(gameState);
  
  if (validMoves.length === 0) return null;

  // --- BEGINNER ---
  if (aiDifficulty === 'Beginner') {
    const randomIndex = Math.floor(Math.random() * validMoves.length);
    return validMoves[randomIndex];
  }

  // --- INTERMEDIATE ---
  if (aiDifficulty === 'Intermediate') {
    // 1. Try to win any small board immediately
    for (const move of validMoves) {
       const smallBoard = board[move.boardIndex];
       if (canWinBoard(smallBoard, currentPlayer) === move.cellIndex) {
           return move;
       }
    }
    
    // 2. Block opponent from winning small board immediately
    const opponent = currentPlayer === Player.X ? Player.O : Player.X;
    for (const move of validMoves) {
        const smallBoard = board[move.boardIndex];
        // If opponent could win here, block it
        if (canWinBoard(smallBoard, opponent) === move.cellIndex) {
            return move;
        }
    }

    // 3. Random otherwise
    return validMoves[Math.floor(Math.random() * validMoves.length)];
  }

  // --- ADVANCED ---
  if (aiDifficulty === 'Advanced') {
     // Score all moves
     let bestScore = -Infinity;
     let bestMoves: Move[] = [];

     for (const move of validMoves) {
         // Add some small randomness to score to vary gameplay for equal moves
         const randomNoise = Math.random() * 5; 
         const score = evaluateMove(gameState, move) + randomNoise;
         
         if (score > bestScore) {
             bestScore = score;
             bestMoves = [move];
         } else if (Math.abs(score - bestScore) < 0.1) {
             bestMoves.push(move);
         }
     }
     
     if (bestMoves.length > 0) {
         return bestMoves[Math.floor(Math.random() * bestMoves.length)];
     }
  }
  
  // Fallback
  return validMoves[0];
};
