window.addEventListener('message', event => {
    console.log(event.data);

    if (event.data.cloneReport) {
        cloneReport = event.data.cloneReport;
    }

    searchingFilePath = event.data.filePath;
    searchingLineNumber = event.data.lineNumber;

    initialize();
});

const vscode = acquireVsCodeApi();

let cloneReport;
let searchingFilePath;
let searchingLineNumber;
let brushedData = [];
let isIgnoringUnchangedClones = d3.select('#ignore-unchanged-clone-input').node().checked;

const previousState = vscode.getState();
if(previousState){
    cloneReport = previousState.cloneReport;
    searchingFilePath = previousState.searchingFilePath;
    searchingLineNumber = previousState.searchingLineNumber;
    brushedData = previousState.brushedData;
    isIgnoringUnchangedClones = previousState.isIgnoringUnchangedClones;

    initialize();
}

function refresh(){
    vscode.postMessage({
        command: 'refresh'
    });
}

function initialize() {
    let chartData = generateChartData();
    if (searchingFilePath && searchingLineNumber) {
        var queriedClone = Object.values(cloneReport.cloneDictionary[cloneReport.info.maxRevision][searchingFilePath]).find(d => d.start_line <= searchingLineNumber && d.end_line >= searchingLineNumber);
        chartData = chartData.filter(d => {
            const clone = cloneReport.globalIdDictionary[d.id][cloneReport.info.maxRevision];
            return queriedClone && clone && clone.class_id === queriedClone.class_id;
        });
    }
    chartData = chartData.filter(d => {
        let result = d[cloneReport.info.maxRevision] >= 0;
        if (isIgnoringUnchangedClones) {
            let hasChangeCount = false;
            for (let i = 0; i <= cloneReport.info.maxRevision; i++) {
                if (d[i] > 0) {
                    hasChangeCount = true;
                    break;
                }
            }
            result = result && hasChangeCount;
        }
        return result;
    });

    const removeUnchangedRevisionsFilter = (revisionId, chartData) => {
        for (const file of Object.values(cloneReport.cloneDictionary[revisionId])) {
            for (const clone of Object.values(file)) {
                if (chartData.find(d => d.id == clone.global_id) && (clone.change_count > 0 || !cloneReport.globalIdDictionary[clone.global_id][revisionId - 1])) {
                    return true;
                }
            }
        }
        return false;
    };

    updateChart(chartData, cloneReport.info.minRevision, cloneReport.info.maxRevision, removeUnchangedRevisionsFilter);

    window.onresize = () => {
        updateChart(chartData, cloneReport.info.minRevision, cloneReport.info.maxRevision, removeUnchangedRevisionsFilter);
    };

    saveState();
}

function generateChartData() {
    const data = [];

    for (const globalId of Array.from(Object.keys(cloneReport.globalIdDictionary))) {
        const revisionsNode = cloneReport.globalIdDictionary[globalId];
        const temp = {};

        for (let i = cloneReport.info.minRevision; i <= cloneReport.info.maxRevision; i++) {
            temp[i] = revisionsNode[i] ? revisionsNode[i].change_count : Number.NEGATIVE_INFINITY;
        }
        temp.id = globalId.toString();
        data.push(temp);
    }

    return data;
}

function initializeParcoords() {
    d3.selectAll('#pc-container').selectAll('*').remove();
    return ParCoords()('#pc-container')
        .margin({
            top: 20,
            left: 20,
            right: 20,
            bottom: 20
        })
        .mode('queue')
        .alpha(.3)
        .color('blue')
        .alphaOnBrushed(.35)
        .brushedColor('red')
        .on('brush', d => {
            brushedData = d;
            d3.selectAll('#clone-picker-list').selectAll('*').remove();
            let li = d3.select('#clone-picker-list')
                .selectAll('li')
                .data(brushedData)
                .enter()
                .append('li');
            li.append('a')
                .attr('href', '#')
                .text(d => {
                    let clone = cloneReport.globalIdDictionary[d.id][cloneReport.info.maxRevision];
                    return d.id + ' > ' + clone.file + ' : ' + clone.start_line + ' ~ ' + clone.end_line;
                })
                .on('click', d => {
                    let clone = cloneReport.globalIdDictionary[d.id][cloneReport.info.maxRevision];
                    vscode.postMessage({
                        command: 'open-clone',
                        id: d.id,
                        file: clone.file,
                        start_line: clone.start_line,
                        end_line: clone.end_line
                    });
                });
        });
}

function generateDimensions(pc, minRevision, maxRevision, data, filter) {
    const dimensions = {};
    const range = pc.height() - pc.margin().top - pc.margin().bottom;
    const max = d3.max(Object.values(cloneReport.globalIdDictionary), d => d3.max(Object.values(d), dd => dd.change_count));
    const scale = d3.scaleSqrt().domain([0, max]).range([range, 1]);

    for (let i = minRevision; i <= maxRevision; i++) {
        if (filter(i, data)) {
            dimensions[i] = {
                type: 'number',
                yscale: scale,
                ticks: 0
            };
        }
    }
    // dimensions[maxRevision] = {
    //     type: 'number',
    //     yscale: scale,
    //     ticks: 0
    // };

    dimensions[d3.min(Object.keys(dimensions), d => parseInt(d))].ticks = 10;
    dimensions[d3.min(Object.keys(dimensions), d => parseInt(d))].orient = 'left';
    dimensions[d3.max(Object.keys(dimensions), d => parseInt(d))].ticks = 10;
    dimensions[d3.max(Object.keys(dimensions), d => parseInt(d))].orient = 'right';
    dimensions.id = {
        type: 'string',
        ticks: 0,
        tickValues: []
    };

    return dimensions;
}

function updateChart(data, minRevision, maxRevision, filter) {
    const pc = initializeParcoords();
    const dimensions = generateDimensions(pc, minRevision, maxRevision, data, filter);
    pc
        .data(data)
        .dimensions(dimensions)
        .render()
        .createAxes()
        .reorderable()
        .brushMode('1D-axes-multi');
}


function isIgnoringUnchangedClonesInputChangeHandler() {
    isIgnoringUnchangedClones = d3.select('#ignore-unchanged-clone-input').node().checked;
    initialize();
}

function resetData() {
    searchingFilePath = undefined;
    searchingLineNumber = undefined;
    initialize();
}

function saveState() {
    vscode.setState({
        cloneReport,
        searchingFilePath,
        searchingLineNumber,
        brushedData,
        isIgnoringUnchangedClones
    });
}