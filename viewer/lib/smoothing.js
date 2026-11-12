// smoothing.js - adaptive terrain for the canvas 3D drawings - the terrain's point limit is chosen so a drawing takes
// about a time budget, from the measured cost of drawing a terrain cell on this computer


// The time budgets, in milliseconds - the 3D explorer's frames while the view moves (10 frames a second) and once it
// stops, and each of the report's 3D views
export const motionBudget = 100;
export const stillBudget = 500;
export const reportBudget = 250;


// The cell cost estimate's smoothing factor, and its initial value, in milliseconds per cell (headless Chrome's
// software rendering - a GPU is several times faster, and the estimate adapts after the first frame)
const costSmoothing = 0.3;
const initialCellCost = 0.0016;


// The fraction of the budget a frame aims to take, and the frame time bounds, as fractions of the budget, outside which
// the point cap changes - within them it stays, so the smoothing doesn't change from frame to frame as the view moves
const budgetTarget = 0.85;
const budgetOver = 1.25;
const budgetUnder = 0.6;


// The fewest terrain cells a frame's cost is measured over (a frame's fixed costs dominate a small drawing)
const minMeasureCells = 2000;


export class AdaptiveSmoothing {
    // "cellCost" is a previously measured cell cost estimate, in milliseconds per cell, or null
    constructor(cellCost = null) {
        this.cellCost = typeof cellCost === 'number' && cellCost > 0 && isFinite(cellCost) ? cellCost : initialCellCost;
        this.caps = {
            'motion': this.targetPoints(motionBudget),
            'still': this.targetPoints(stillBudget)
        };
    }


    // The point cap that fits a budget at the current cell cost estimate
    targetPoints(budget) {
        return Math.round(budget * budgetTarget / this.cellCost);
    }


    // Get the smooth terrain point cap for a moving or still view
    points(still) {
        return this.caps[still ? 'still' : 'motion'];
    }


    // Record a drawing's time, in milliseconds, and its number of terrain cells, updating the cell cost estimate
    recordCost(drawTime, cells) {
        this.cellCost = this.cellCost * (1 - costSmoothing) + (drawTime / Math.max(cells, minMeasureCells)) * costSmoothing;
    }


    // Record a drawn frame - its time, in milliseconds, and its number of terrain cells - updating the cell cost
    // estimate and, when the frame was well over or under its budget, the frame's point cap
    record(frameTime, cells, still) {
        this.recordCost(frameTime, cells);
        const mode = still ? 'still' : 'motion';
        const budget = still ? stillBudget : motionBudget;
        const target = this.targetPoints(budget);
        if (frameTime > budget * budgetOver) {
            this.caps[mode] = Math.min(this.caps[mode], target);
        } else if (frameTime < budget * budgetUnder) {
            this.caps[mode] = Math.max(this.caps[mode], target);
        }
    }
}
