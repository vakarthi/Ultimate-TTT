import React from 'react';
import { Player, SmallBoardState, SmallBoardStatus } from '../types';
import { XIcon, OIcon } from './Icons';

interface SmallBoardProps {
  boardIndex: number;
  cells: SmallBoardState;
  status: SmallBoardStatus;
  isActive: boolean;
  isValidTarget: boolean; // Is this board a valid place to play?
  onCellClick: (boardIndex: number, cellIndex: number) => void;
  lastMove: { boardIndex: number; cellIndex: number } | null;
}

const SmallBoard: React.FC<SmallBoardProps> = ({
  boardIndex,
  cells,
  status,
  isActive,
  isValidTarget,
  onCellClick,
  lastMove,
}) => {
  const isWon = !!status.winner;
  const isDraw = status.isDraw;
  const isComplete = isWon || isDraw;

  // Dynamic styling based on game state
  let containerClasses = "relative grid grid-cols-3 gap-1 p-2 rounded-xl transition-all duration-300 ";

  if (isActive && !isComplete) {
    containerClasses += "bg-surface ring-4 ring-yellow-400/30 shadow-[0_0_15px_rgba(250,204,21,0.2)] scale-[1.02] z-10 ";
  } else if (isValidTarget && !isComplete) {
    containerClasses += "bg-surface ring-2 ring-indigo-500/30 hover:ring-indigo-500/60 cursor-pointer ";
  } else if (isComplete) {
    containerClasses += "bg-slate-800/50 opacity-90 ";
  } else {
    containerClasses += "bg-slate-800/80 opacity-60 ";
  }

  return (
    <div className={containerClasses}>
      {/* Grid of cells */}
      {cells.map((cell, idx) => {
        const isLastMove = lastMove?.boardIndex === boardIndex && lastMove?.cellIndex === idx;
        
        return (
          <button
            key={idx}
            disabled={cell !== null || !isValidTarget || isComplete}
            onClick={() => onCellClick(boardIndex, idx)}
            className={`
              h-8 w-8 sm:h-10 sm:w-10 md:h-12 md:w-12 lg:h-14 lg:w-14 
              rounded-md flex items-center justify-center 
              transition-all duration-200
              ${!cell && isValidTarget && !isComplete ? 'hover:bg-slate-700 bg-slate-700/30' : 'bg-slate-900/40'}
              ${isLastMove ? 'bg-indigo-500/20 ring-1 ring-indigo-400' : ''}
            `}
          >
            {cell === Player.X && <XIcon className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-xColor drop-shadow-lg" />}
            {cell === Player.O && <OIcon className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-oColor drop-shadow-lg" />}
          </button>
        );
      })}

      {/* Overlay for Won/Draw state */}
      {isComplete && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/60 backdrop-blur-[1px] z-20">
          {isWon ? (
            status.winner === Player.X ? (
              <XIcon className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 text-xColor drop-shadow-[0_0_15px_rgba(56,189,248,0.5)] animate-in zoom-in duration-300" />
            ) : (
              <OIcon className="w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 text-oColor drop-shadow-[0_0_15px_rgba(251,113,133,0.5)] animate-in zoom-in duration-300" />
            )
          ) : (
             <span className="text-3xl font-bold text-slate-400 tracking-wider">DRAW</span>
          )}
        </div>
      )}
    </div>
  );
};

export default SmallBoard;
