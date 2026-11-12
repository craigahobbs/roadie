// planData.js - a loaded road plan and its cached analyses, finished grade, report views, and drawings

import {analyzeOption, planTopo} from './model.js';
import {finishedRows, reportViews} from './view3d.js';


// The maximum number of cached drawings
const maxDrawings = 48;


export class PlanData {
    constructor(plan, file) {
        this.plan = plan;
        this.file = file;
        this.topo = planTopo(plan);
        this.analysisCache = [];
        this.rowsCache = [];
        this.viewsCache = new Map();
        this.drawingCache = new Map();
    }


    // Get an option's analysis
    analysis(ixOption) {
        let analysis = this.analysisCache[ixOption];
        if (analysis === undefined) {
            analysis = analyzeOption(this.plan, ixOption, this.topo);
            this.analysisCache[ixOption] = analysis;
        }
        return analysis;
    }


    // Get every option's analysis
    analyses() {
        return this.plan.options.map((option, ixOption) => this.analysis(ixOption));
    }


    // Get an option's finished grade topography rows
    rows(ixOption) {
        let rows = this.rowsCache[ixOption];
        if (rows === undefined) {
            rows = finishedRows(this.topo, this.analysis(ixOption).samples, this.plan.options[ixOption].section.width * 0.5);
            this.rowsCache[ixOption] = rows;
        }
        return rows;
    }


    // Get an option's report 3D views
    reportViews(ixOption, width) {
        const key = `${ixOption}/${width}`;
        let views = this.viewsCache.get(key);
        if (views === undefined) {
            const halfWidth = this.plan.options[ixOption].section.width * 0.5;
            views = reportViews(this.topo, this.rows(ixOption), this.analysis(ixOption), halfWidth, width, false);
            this.viewsCache.set(key, views);
        }
        return views;
    }


    // Get a cached drawing, creating it if necessary
    drawing(key, createFn) {
        let drawing = this.drawingCache.get(key);
        if (drawing === undefined) {
            drawing = createFn();
            if (this.drawingCache.size >= maxDrawings) {
                this.drawingCache.delete(this.drawingCache.keys().next().value);
            }
        } else {
            this.drawingCache.delete(key);
        }
        this.drawingCache.set(key, drawing);
        return drawing;
    }
}
