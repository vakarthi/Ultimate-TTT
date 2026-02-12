import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Player,
  GameState,
  GameHistoryItem,
  GameMode,
  AiDifficulty,
  OnlineRole,
  OnlineState,
} from '../types';
import {
  checkSmallBoardStatus,
  checkGlobalWinner,
  createInitialBoard,
  createInitialStatuses,
} from '../utils/gameLogic';
import { getAiMove } from '../utils/aiLogic';
import { peerService } from '../utils/peerService';
import SmallBoard from './SmallBoard';
import { XIcon, OIcon } from './Icons';

const SAVE_KEY = 'ultimate-t3-save-v1';

const Game: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    board: createInitialBoard(),
    smallBoardStatuses: createInitialStatuses(),
    currentPlayer: Player.X,
    nextBoardIndex: null, // Start anywhere
    globalWinner: null,
    isGlobalDraw: false,
    history: [],
    moveCount: 0,
    gameMode: 'PvP', // Default
    aiDifficulty: 'Beginner', // Default
  });

  const [lastMove, setLastMove] = useState<{ boardIndex: number; cellIndex: number } | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [showNewGameModal, setShowNewGameModal] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Online State
  const [onlineState, setOnlineState] = useState<OnlineState>('IDLE');
  const [onlineRole, setOnlineRole] = useState<OnlineRole>(null);
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [joinId, setJoinId] = useState<string>('');

  // Helper to show temporary notifications
  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // --- Game Logic ---

  const handleCellClick = useCallback((boardIndex: number, cellIndex: number, isRemote: boolean = false) => {
    
    setGameState((prevState) => {
        // Enforce online turn rules
        if (prevState.gameMode === 'PvOnline' && !isRemote) {
            // If it's my turn, I must be the correct role
            const myPlayer = onlineRole === 'HOST' ? Player.X : Player.O;
            if (prevState.currentPlayer !== myPlayer) return prevState;
        }

        const {
            board,
            currentPlayer,
            nextBoardIndex,
            smallBoardStatuses,
            globalWinner,
            history,
            moveCount,
        } = prevState;

        // Validation
        if (globalWinner) return prevState;
        if (board[boardIndex][cellIndex] !== null) return prevState;
        
        // Check valid board constraint
        if (nextBoardIndex !== null && nextBoardIndex !== boardIndex) {
            return prevState; 
        }
        
        const targetStatus = smallBoardStatuses[boardIndex];
        if (targetStatus.winner || targetStatus.isDraw) return prevState;

        // 1. Update Board State
        const newBoard = board.map((b, bIdx) =>
            bIdx === boardIndex
            ? b.map((c, cIdx) => (cIdx === cellIndex ? currentPlayer : c))
            : b
        );

        // 2. Check for Local Win/Draw
        const newSmallBoardStatus = checkSmallBoardStatus(newBoard[boardIndex]);
        const newSmallBoardStatuses = [...smallBoardStatuses];
        newSmallBoardStatuses[boardIndex] = newSmallBoardStatus;

        // 3. Check for Global Win
        const { winner: newGlobalWinner, isDraw: newGlobalDraw } = checkGlobalWinner(newSmallBoardStatuses);

        // 4. Determine Next Board
        let newNextBoardIndex: number | null = cellIndex;

        // If that sent-to board is full or won, play anywhere
        const nextTargetStatus = newSmallBoardStatuses[newNextBoardIndex];
        if (nextTargetStatus.winner || nextTargetStatus.isDraw) {
            newNextBoardIndex = null;
        }

        // Side effect: If online and move was local, send it
        if (prevState.gameMode === 'PvOnline' && !isRemote) {
             peerService.send({ type: 'MOVE', boardIndex, cellIndex });
        }

        // Update Last Move State (Side effect outside reducer logic)
        setLastMove({ boardIndex, cellIndex });

        // 5. Update History & Return New State
        const historyItem: GameHistoryItem = {
            board: prevState.board,
            smallBoardStatuses: prevState.smallBoardStatuses,
            currentPlayer: prevState.currentPlayer,
            nextBoardIndex: prevState.nextBoardIndex,
            lastMove: lastMove, 
        };

        return {
            ...prevState,
            board: newBoard,
            smallBoardStatuses: newSmallBoardStatuses,
            currentPlayer: currentPlayer === Player.X ? Player.O : Player.X,
            nextBoardIndex: newNextBoardIndex,
            globalWinner: newGlobalWinner,
            isGlobalDraw: newGlobalDraw,
            history: [...history, historyItem],
            moveCount: moveCount + 1,
        };
    });
  }, [lastMove, onlineRole]);

  // --- Online Handlers ---

  const handleOnlineData = useCallback((data: any) => {
      if (data.type === 'MOVE') {
          handleCellClick(data.boardIndex, data.cellIndex, true);
      } else if (data.type === 'RESTART') {
           resetGameState('PvOnline', onlineRole === 'HOST' ? 'Beginner' : 'Beginner'); // keep same mode
           showNotification("Opponent restarted the game");
      }
  }, [handleCellClick, showNotification, onlineRole]);

  const handleOnlineDisconnect = useCallback(() => {
      setOnlineState('DISCONNECTED');
      showNotification("Opponent disconnected");
  }, [showNotification]);

  const handleOnlineError = useCallback((err: string) => {
      setOnlineState('IDLE');
      showNotification(`Connection Error: ${err}`);
  }, [showNotification]);

  const startHosting = () => {
      setOnlineState('HOSTING');
      setOnlineRole('HOST'); // Host is X
      peerService.initHost(
          (id) => setMyPeerId(id),
          () => {
              setOnlineState('CONNECTED');
              showNotification("Player connected! You are X.");
              startNewGame('PvOnline');
          },
          handleOnlineData,
          handleOnlineDisconnect,
          handleOnlineError
      );
  };

  const joinGame = () => {
      if (!joinId) {
          showNotification("Please enter a Game ID");
          return;
      }
      setOnlineState('JOINING');
      setOnlineRole('GUEST'); // Guest is O
      peerService.initJoin(
          joinId,
          () => {
              setOnlineState('CONNECTED');
              showNotification("Connected! You are O.");
              startNewGame('PvOnline');
          },
          handleOnlineData,
          handleOnlineDisconnect,
          handleOnlineError
      );
  };

  const copyToClipboard = () => {
      navigator.clipboard.writeText(myPeerId);
      showNotification("Game ID copied to clipboard!");
  };

  // --- AI Effect ---

  useEffect(() => {
    if (gameState.gameMode === 'PvCPU' && gameState.currentPlayer === Player.O && !gameState.globalWinner && !gameState.isGlobalDraw) {
      setIsAiThinking(true);
      const timer = setTimeout(() => {
        const move = getAiMove(gameState);
        if (move) {
          handleCellClick(move.boardIndex, move.cellIndex);
        }
        setIsAiThinking(false);
      }, 700); 
      return () => clearTimeout(timer);
    }
  }, [gameState, handleCellClick]);


  // --- Controls ---

  const resetGameState = (mode: GameMode, difficulty: AiDifficulty) => {
    setGameState({
        board: createInitialBoard(),
        smallBoardStatuses: createInitialStatuses(),
        currentPlayer: Player.X,
        nextBoardIndex: null,
        globalWinner: null,
        isGlobalDraw: false,
        history: [],
        moveCount: 0,
        gameMode: mode,
        aiDifficulty: difficulty,
      });
      setLastMove(null);
  }

  const startNewGame = (mode: GameMode, difficulty: AiDifficulty = 'Beginner') => {
    // If we are starting a NEW game session (not just restart)
    if (mode !== 'PvOnline') {
        peerService.cleanUp();
        setOnlineState('IDLE');
        setOnlineRole(null);
    }
    
    resetGameState(mode, difficulty);
    setShowNewGameModal(false);
    
    if (mode === 'PvOnline') {
        if (onlineState === 'CONNECTED') {
             peerService.send({ type: 'RESTART' });
        }
    } else {
        const modeText = mode === 'PvP' ? '2 Player' : `vs CPU (${difficulty})`;
        showNotification(`Started New ${modeText} Game`);
    }
  };

  const undoMove = () => {
    if (gameState.history.length === 0) return;

    // PvP: 1, PvCPU: 2, PvOnline: Not allowed usually, or implement complex logic
    if (gameState.gameMode === 'PvOnline') {
        showNotification("Undo not available in Online mode yet");
        return;
    }

    const stepsToUndo = gameState.gameMode === 'PvCPU' && gameState.currentPlayer === Player.X ? 2 : 1;
    
    if (gameState.history.length < stepsToUndo) return;

    const targetStateIndex = gameState.history.length - stepsToUndo;
    const previousState = gameState.history[targetStateIndex];
    const newHistory = gameState.history.slice(0, targetStateIndex);
    
    setGameState({
      ...gameState, 
      board: previousState.board,
      smallBoardStatuses: previousState.smallBoardStatuses,
      currentPlayer: previousState.currentPlayer,
      nextBoardIndex: previousState.nextBoardIndex,
      globalWinner: null,
      isGlobalDraw: false,
      history: newHistory,
      moveCount: gameState.moveCount - stepsToUndo,
    });
    setLastMove(previousState.lastMove);
    showNotification("Undo successful");
  };

  const saveGame = () => {
    try {
      const stateToSave = {
        ...gameState,
        history: [], 
        lastMoveState: lastMove 
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(stateToSave));
      showNotification("Game Saved!");
    } catch (e) {
      console.error("Save failed", e);
      showNotification("Failed to save game");
    }
  };

  const loadGame = () => {
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (!saved) {
        showNotification("No saved game found");
        return;
      }
      const parsed = JSON.parse(saved);
      
      if (!parsed.board || !parsed.smallBoardStatuses) {
        throw new Error("Invalid save file");
      }

      // Restore
      setGameState({
        ...parsed,
        aiDifficulty: parsed.aiDifficulty || 'Beginner', 
        history: [], 
      });
      if (parsed.lastMoveState) {
          setLastMove(parsed.lastMoveState);
      }
      
      // If loading an online game state, it effectively converts to local analysis
      // because reconnection logic isn't serialized.
      if (parsed.gameMode === 'PvOnline') {
          showNotification("Loaded as local analysis (Online disconnected)");
          // Optionally switch to PvP to allow play
          // setGameState(prev => ({...prev, gameMode: 'PvP'}));
      } else {
          showNotification("Game Loaded!");
      }
      
    } catch (e) {
      console.error("Load failed", e);
      showNotification("Error loading game");
    }
  };

  // Helper component for Difficulty Selection
  const DifficultyButton: React.FC<{ 
      level: AiDifficulty, 
      color: string, 
      icon: string 
  }> = ({ level, color, icon }) => (
      <button 
        onClick={() => startNewGame('PvCPU', level)}
        className={`w-full py-2.5 ${color} text-white font-bold rounded-xl transition-all flex items-center justify-between px-4 hover:scale-[1.02] active:scale-95 shadow-md`}
      >
         <div className="flex items-center gap-3">
            <span className="text-xl">{icon}</span>
            <span>{level}</span>
         </div>
      </button>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen py-8 px-4 gap-6 max-w-7xl mx-auto relative">
      
      {/* Toast Notification */}
      <div className={`fixed top-4 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-2 rounded-full shadow-2xl border border-slate-600 transition-opacity duration-300 pointer-events-none z-[70] ${notification ? 'opacity-100' : 'opacity-0'}`}>
        {notification}
      </div>

      {/* New Game Modal */}
      {showNewGameModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
           <div className="bg-surface p-6 rounded-2xl shadow-2xl border border-slate-700 max-w-md w-full animate-in zoom-in duration-200">
              <h2 className="text-2xl font-bold text-white mb-6 text-center">Start New Game</h2>
              
              <div className="space-y-6">
                  {/* Online Section */}
                  <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50">
                      <h3 className="text-xs text-sky-400 font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                        Online Multiplayer
                      </h3>
                      
                      {onlineState === 'IDLE' || onlineState === 'DISCONNECTED' ? (
                          <div className="grid grid-cols-2 gap-3">
                              <button 
                                onClick={startHosting}
                                className="py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl transition-all"
                              >
                                Host Game
                              </button>
                              <div className="flex flex-col gap-2">
                                <input 
                                    type="text" 
                                    placeholder="Enter ID" 
                                    value={joinId}
                                    onChange={(e) => setJoinId(e.target.value)}
                                    className="px-3 py-1 text-sm bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-sky-500"
                                />
                                <button 
                                    onClick={joinGame}
                                    className="py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold rounded-lg transition-all text-sm"
                                >
                                    Join
                                </button>
                              </div>
                          </div>
                      ) : (
                          <div className="text-center space-y-3">
                              {onlineState === 'HOSTING' && (
                                  <div className="space-y-2">
                                      <div className="text-sm text-slate-400">Share this Game ID:</div>
                                      <div 
                                        onClick={copyToClipboard}
                                        className="bg-slate-800 p-3 rounded-lg font-mono text-lg text-sky-400 border border-sky-500/30 cursor-pointer hover:bg-slate-750 flex items-center justify-center gap-2 group"
                                      >
                                          {myPeerId || 'Generating...'}
                                          <span className="text-slate-500 group-hover:text-white text-xs">📋</span>
                                      </div>
                                      <div className="text-xs text-slate-500 animate-pulse">Waiting for opponent...</div>
                                  </div>
                              )}
                              {onlineState === 'JOINING' && (
                                  <div className="text-emerald-400 font-medium animate-pulse">Connecting to host...</div>
                              )}
                              {onlineState === 'CONNECTED' && (
                                  <div className="text-emerald-400 font-bold">Connected! Close this menu to play.</div>
                              )}
                          </div>
                      )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* PvP Section */}
                    <div>
                        <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-3">Local</h3>
                        <button 
                            onClick={() => startNewGame('PvP')}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-500/20"
                        >
                            <XIcon className="w-4 h-4"/> vs <OIcon className="w-4 h-4"/>
                        </button>
                    </div>

                    {/* PvCPU Section */}
                    <div>
                        <h3 className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-3">vs CPU</h3>
                        <div className="space-y-2">
                            <DifficultyButton level="Beginner" color="bg-emerald-600 hover:bg-emerald-500" icon="🙂" />
                            <DifficultyButton level="Intermediate" color="bg-amber-600 hover:bg-amber-500" icon="🤔" />
                            <DifficultyButton level="Advanced" color="bg-rose-600 hover:bg-rose-500" icon="🤖" />
                        </div>
                    </div>
                  </div>

                  <button 
                    onClick={() => setShowNewGameModal(false)}
                    className="w-full py-2 text-slate-400 hover:text-white font-medium transition-colors border-t border-slate-700 pt-4"
                  >
                    Close
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* Header / HUD */}
      <div className="flex flex-col md:flex-row items-center justify-between w-full max-w-2xl bg-surface p-5 rounded-2xl shadow-xl border border-slate-700">
        
        <div className="flex items-center gap-4 mb-4 md:mb-0">
          <div className="flex flex-col">
            <h1 className="text-3xl font-black bg-gradient-to-r from-xColor to-oColor bg-clip-text text-transparent">
              ULTIMATE T3
            </h1>
            <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium tracking-widest uppercase">
                    {gameState.gameMode === 'PvP' ? '2 Player' : 
                     gameState.gameMode === 'PvOnline' ? 'Online Multiplayer' : 
                     `vs CPU (${gameState.aiDifficulty})`}
                </span>
                {gameState.gameMode === 'PvOnline' && (
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${onlineState === 'CONNECTED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {onlineState}
                    </span>
                )}
            </div>
          </div>
        </div>

        {/* Turn Indicator */}
        {!gameState.globalWinner && !gameState.isGlobalDraw && (
          <div className="flex items-center gap-3 bg-slate-900/50 px-5 py-2 rounded-full border border-slate-700">
             {isAiThinking ? (
                <div className="flex items-center gap-2 text-emerald-400">
                    <span className="animate-spin text-xl">⚙️</span>
                    <span className="text-sm font-bold uppercase tracking-wider">AI Thinking...</span>
                </div>
             ) : (
                <>
                    <span className="text-sm text-slate-400 uppercase font-semibold">Turn:</span>
                    <div className="flex items-center gap-2">
                        {gameState.currentPlayer === Player.X ? (
                            <XIcon className="w-6 h-6 text-xColor" />
                        ) : (
                            <OIcon className="w-6 h-6 text-oColor" />
                        )}
                        <span className={`font-bold text-lg ${gameState.currentPlayer === Player.X ? 'text-xColor' : 'text-oColor'}`}>
                            {gameState.gameMode === 'PvCPU' && gameState.currentPlayer === Player.O ? 'CPU' : 
                             gameState.gameMode === 'PvOnline' && onlineRole === 'HOST' && gameState.currentPlayer === Player.O ? 'Opponent' :
                             gameState.gameMode === 'PvOnline' && onlineRole === 'GUEST' && gameState.currentPlayer === Player.X ? 'Opponent' :
                             gameState.gameMode === 'PvOnline' ? 'YOU' :
                             `PLAYER ${gameState.currentPlayer}`}
                        </span>
                    </div>
                </>
             )}
          </div>
        )}

        {/* Game Over Status */}
        {(gameState.globalWinner || gameState.isGlobalDraw) && (
            <div className="flex items-center gap-2 animate-pulse-slow">
                 {gameState.globalWinner ? (
                     <>
                        <span className="text-xl font-bold text-white">WINNER:</span>
                        {gameState.globalWinner === Player.X ? <XIcon className="w-8 h-8 text-xColor" /> : <OIcon className="w-8 h-8 text-oColor" />}
                     </>
                 ) : (
                     <span className="text-xl font-bold text-slate-300">GAME DRAWN</span>
                 )}
            </div>
        )}

      </div>

      {/* Main Board Grid */}
      <div className="relative">
          {/* Winner Overlay for the WHOLE game */}
          {(gameState.globalWinner || gameState.isGlobalDraw) && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/85 backdrop-blur-sm rounded-3xl animate-in fade-in duration-500 p-8">
                {gameState.globalWinner ? (
                    <div className="text-center transform scale-110 md:scale-150">
                        <div className="mb-4 text-white text-2xl font-bold tracking-widest uppercase">Victory for</div>
                        {gameState.globalWinner === Player.X ? (
                             <XIcon className="w-40 h-40 mx-auto text-xColor drop-shadow-[0_0_30px_rgba(56,189,248,0.6)]" />
                        ) : (
                             <OIcon className="w-40 h-40 mx-auto text-oColor drop-shadow-[0_0_30px_rgba(251,113,133,0.6)]" />
                        )}
                        <div className="mt-4 text-xl font-bold text-slate-300">
                             {gameState.gameMode === 'PvCPU' && gameState.globalWinner === Player.O ? 'The AI Outsmarted You!' : 
                              gameState.gameMode === 'PvOnline' && ((onlineRole === 'HOST' && gameState.globalWinner === Player.O) || (onlineRole === 'GUEST' && gameState.globalWinner === Player.X)) ? 'You Lost!' :
                              gameState.gameMode === 'PvOnline' ? 'You Won!' :
                              'Well Played!'}
                        </div>
                    </div>
                ) : (
                    <div className="text-6xl font-black text-slate-200">DRAW</div>
                )}
                
                <button 
                  onClick={() => setShowNewGameModal(true)}
                  className="mt-12 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full shadow-lg transition-all transform hover:scale-105"
                >
                    New Game
                </button>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-4 p-4 bg-slate-900 rounded-3xl shadow-2xl border border-slate-800">
            {gameState.board.map((smallBoard, idx) => {
                const isComplete = !!gameState.smallBoardStatuses[idx].winner || gameState.smallBoardStatuses[idx].isDraw;
                const isValidTarget = !gameState.globalWinner && !gameState.isGlobalDraw && !isComplete && (
                    gameState.nextBoardIndex === null || gameState.nextBoardIndex === idx
                );

                // Disable interaction if it's AI's turn OR Opponent's turn (Online)
                let isInteractionAllowed = true;
                if (gameState.gameMode === 'PvCPU' && gameState.currentPlayer === Player.O) isInteractionAllowed = false;
                if (gameState.gameMode === 'PvOnline') {
                    if (onlineRole === 'HOST' && gameState.currentPlayer === Player.O) isInteractionAllowed = false;
                    if (onlineRole === 'GUEST' && gameState.currentPlayer === Player.X) isInteractionAllowed = false;
                    if (onlineState !== 'CONNECTED') isInteractionAllowed = false;
                }

                const isActive = isValidTarget && isInteractionAllowed;

                return (
                    <SmallBoard
                        key={idx}
                        boardIndex={idx}
                        cells={smallBoard}
                        status={gameState.smallBoardStatuses[idx]}
                        isActive={isActive}
                        isValidTarget={isValidTarget && isInteractionAllowed} // Visual feedback
                        onCellClick={isInteractionAllowed ? (b, c) => handleCellClick(b, c, false) : () => {}}
                        lastMove={lastMove}
                    />
                );
            })}
          </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap justify-center gap-3 w-full max-w-2xl">
        <button
            onClick={() => setShowNewGameModal(true)}
            className="px-5 py-2.5 rounded-lg font-bold bg-indigo-600 text-white hover:bg-indigo-500 transition-colors shadow-lg"
        >
            New Game
        </button>
        <button
            onClick={undoMove}
            disabled={gameState.history.length === 0 || !!gameState.globalWinner || isAiThinking || gameState.gameMode === 'PvOnline'}
            className="px-5 py-2.5 rounded-lg font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors border border-slate-600"
        >
            Undo
        </button>
        <div className="w-px h-10 bg-slate-700 mx-2 hidden sm:block"></div>
        <button
            onClick={saveGame}
            className="px-5 py-2.5 rounded-lg font-semibold bg-slate-800 text-emerald-400 hover:bg-slate-700 transition-colors border border-slate-700"
        >
            Save
        </button>
        <button
            onClick={loadGame}
            className="px-5 py-2.5 rounded-lg font-semibold bg-slate-800 text-blue-400 hover:bg-slate-700 transition-colors border border-slate-700"
        >
            Load
        </button>
      </div>
      
      {/* Instructions / Footer */}
      <div className="max-w-xl text-center text-slate-500 text-sm">
        {isAiThinking ? (
            <span className="animate-pulse text-emerald-500/80">AI is calculating optimal strategy...</span>
        ) : (
            <p>
                {gameState.gameMode === 'PvCPU' && gameState.currentPlayer === Player.O ? (
                    <span>Waiting for computer...</span>
                ) : gameState.gameMode === 'PvOnline' && ((onlineRole === 'HOST' && gameState.currentPlayer === Player.O) || (onlineRole === 'GUEST' && gameState.currentPlayer === Player.X)) ? (
                    <span className="text-sky-400 animate-pulse">Waiting for opponent to move...</span>
                ) : (
                    <>
                        You are playing <strong>Player {gameState.currentPlayer}</strong>. 
                        {gameState.nextBoardIndex !== null ? (
                        <span> You must play in the <span className="text-indigo-400 font-bold">highlighted board</span>.</span>
                        ) : (
                        <span> You can play in <span className="text-indigo-400 font-bold">any open board</span>.</span>
                        )}
                    </>
                )}
            </p>
        )}
      </div>

    </div>
  );
};

export default Game;
